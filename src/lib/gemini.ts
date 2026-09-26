import { GoogleGenerativeAI } from "@google/generative-ai";
import { BOROUGHS, CATEGORIES, NEIGHBORHOODS } from "./catalog";
import { emptyFilters, parseQuery } from "./parseQuery";
import type { SearchFilters } from "./types";

export function geminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY);
}

function client() {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) return null;
  return new GoogleGenerativeAI(key);
}

const MODELS = [process.env.GEMINI_MODEL, "gemini-2.5-flash", "gemini-2.0-flash"].filter(
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
