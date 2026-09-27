import { GoogleGenerativeAI } from "@google/generative-ai";
import { BOROUGHS, CATEGORIES, NEIGHBORHOODS } from "./catalog";
import { emptyFilters, parseQuery } from "./parseQuery";
import { applySuggestedOrder, profileBrief, sortByProfile, type RenterProfile } from "./profile";
import type { SearchFilters, Summary } from "./types";

export function geminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY);
}

function client() {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) return null;
  return new GoogleGenerativeAI(key);
}

const MODELS = [process.env.GEMINI_MODEL, "gemini-3.8-flash", "gemini-2.5-flash", "gemini-2.0-flash"].filter(
  (model): model is string => Boolean(model),
);

async function generate(prompt: string, json: boolean) {
  const genAI = client();
  if (!genAI) return null;
  let lastError: unknown = null;
  for (const modelName of MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: json
          ? { responseMimeType: "application/json", temperature: 0.1 }
          : { temperature: 0.2 },
      });
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      lastError = error;
    }
  }
  console.error("Gemini request failed", lastError);
  return null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export async function interpretSearch(query: string): Promise<{ filters: SearchFilters; source: "gemini" | "local" }> {
  const local = parseQuery(query);
  const raw = await generate(
    `Convert this storefront search into JSON filters. Use only names from the lists. Do not invent neighborhoods, scores, or property facts.
Query: ${JSON.stringify(query)}
Boroughs: ${BOROUGHS.join(", ")}
Neighborhoods: ${NEIGHBORHOODS.join(", ")}
Categories: ${CATEGORIES.map((category) => category.id).join(", ")}
Return JSON with keys boroughs, neighborhoods, category (string or null), months (number or null), minTurnover (number), vacantOnly (boolean), nearSubway (boolean), multiSignal (boolean), landlordOnly (boolean), address (string or null).
If the person asks for availability within N months, set months to N. Vacancy on a filing can satisfy that window; do not invent a lease date.`,
    true,
  );
  if (!raw) return { filters: local, source: "local" };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const filters = emptyFilters();
    filters.boroughs = asStringArray(parsed.boroughs).filter((borough) =>
      BOROUGHS.includes(borough as (typeof BOROUGHS)[number]),
    );
    filters.neighborhoods = asStringArray(parsed.neighborhoods).filter((name) =>
      NEIGHBORHOODS.some((known) => known.toLowerCase() === name.toLowerCase()),
    );
    const category = typeof parsed.category === "string" ? parsed.category : null;
    filters.category = CATEGORIES.some((item) => item.id === category) ? category : local.category;
    filters.months = typeof parsed.months === "number" ? Math.min(24, Math.max(1, parsed.months)) : local.months;
    filters.minTurnover = typeof parsed.minTurnover === "number" ? parsed.minTurnover : local.minTurnover;
    filters.vacantOnly = Boolean(parsed.vacantOnly);
    filters.nearSubway = Boolean(parsed.nearSubway);
    filters.multiSignal = Boolean(parsed.multiSignal);
    filters.landlordOnly = Boolean(parsed.landlordOnly);
    filters.address = typeof parsed.address === "string" ? parsed.address : local.address;
    if (!filters.boroughs.length && !filters.neighborhoods.length && !filters.category && filters.months == null) {
      return { filters: local, source: "local" };
    }
    return { filters, source: "gemini" };
  } catch {
    return { filters: local, source: "local" };
  }
}

export function grounded(text: string, source: string) {
  const years = text.match(/\b20\d{2}\b/g) ?? [];
  if (years.some((year) => !source.includes(year))) return false;
  if (text.includes("$") && !source.includes("$")) return false;
  return true;
}

function compactRecord(result: Summary) {
  return {
    id: result.id,
    address: result.address,
    neighborhood: result.neighborhood,
    borough: result.borough,
    reportingYear: result.reportingYear,
    turnoverScore: result.turnoverScore,
    fitScore: result.fitScore,
    retailArea: result.retailArea,
    availability: result.availability.label,
    signals: result.topSignals.map((signal) => signal.label),
  };
}

export async function rankForProfile(profile: RenterProfile, results: Summary[]) {
  const fallback = sortByProfile(profile, results);
  const brief = profileBrief(profile);
  const sample = fallback.slice(0, 25).map(compactRecord);
  const raw = await generate(
    `Rank these already-retrieved NYC storefront records for the renter profile.
The priorities array is sorted. Rank 1 matters most.
Fields marked use=filter were already applied in the database query.
Fields marked use=compare may change order only when that record includes the field.
Fields marked use=context are about the renter. Do not treat them as facts about a property.
Do not invent rent, bedrooms, pets, lease dates, or addresses.
Return JSON with keys order (array of ids from the records only), reasons (object of id to one sentence), and summary (under 70 words).
Every id in order must come from the records. Mention a retail area only when retailArea is a number.
Profile: ${JSON.stringify(brief)}
Records: ${JSON.stringify(sample)}`,
    true,
  );
  if (!raw) return { results: fallback, reasons: {} as Record<string, string>, summary: null as string | null, source: "profile" as const };
  try {
    const parsed = JSON.parse(raw) as { order?: unknown; reasons?: unknown; summary?: unknown };
    const order = asStringArray(parsed.order).filter((id) => sample.some((record) => record.id === id));
    if (order.length < Math.min(3, sample.length)) {
      return { results: fallback, reasons: {}, summary: null, source: "profile" as const };
    }
    const reasons: Record<string, string> = {};
    const reasonMap = parsed.reasons && typeof parsed.reasons === "object" ? (parsed.reasons as Record<string, unknown>) : {};
    for (const record of sample) {
      const text = reasonMap[record.id];
      if (typeof text !== "string") continue;
      const trimmed = text.trim().slice(0, 280);
      if (!trimmed || trimmed.includes("$")) continue;
      if (!grounded(trimmed, JSON.stringify(record))) continue;
      if (sample.some((other) => other.id !== record.id && other.address && trimmed.includes(other.address))) continue;
      reasons[record.id] = trimmed;
    }
    const summaryText = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    const summary = summaryText && grounded(summaryText, JSON.stringify({ brief, sample })) ? summaryText : null;
    return { results: applySuggestedOrder(fallback, order), reasons, summary, source: "gemini" as const };
  } catch {
    return { results: fallback, reasons: {}, summary: null, source: "profile" as const };
  }
}

export async function summarizeRecords(instruction: string, records: unknown) {
  const source = JSON.stringify(records);
  const text = await generate(
    `${instruction}
Use only the JSON below. Do not invent addresses, dates, prices, landlords, or lease expirations. If a field is missing, say it is not on file. Keep it under 90 words.
${source}`,
    false,
  );
  if (!text || !grounded(text, source)) return null;
  return text.trim();
}
