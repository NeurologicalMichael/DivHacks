import { NextResponse } from "next/server";
import { rankForProfile, interpretSearch, summarizeRecords } from "@/lib/gemini";
import { describeFilters, emptyFilters } from "@/lib/parseQuery";
import { profileToFilters } from "@/lib/profile";
import { loadRenterProfile, searchStorefronts } from "@/lib/queries";
import type { SearchFilters } from "@/lib/types";

export const dynamic = "force-dynamic";

function cleanFilters(input: Partial<SearchFilters> | undefined, base: SearchFilters): SearchFilters {
  if (!input) return base;
  return {
    boroughs: Array.isArray(input.boroughs) ? input.boroughs.map(String) : base.boroughs,
    neighborhoods: Array.isArray(input.neighborhoods) ? input.neighborhoods.map(String) : base.neighborhoods,
    category: typeof input.category === "string" ? input.category : input.category === null ? null : base.category,
    months: typeof input.months === "number" ? input.months : input.months === null ? null : base.months,
    minTurnover: typeof input.minTurnover === "number" ? input.minTurnover : base.minTurnover,
    vacantOnly: typeof input.vacantOnly === "boolean" ? input.vacantOnly : base.vacantOnly,
    nearSubway: typeof input.nearSubway === "boolean" ? input.nearSubway : base.nearSubway,
    multiSignal: typeof input.multiSignal === "boolean" ? input.multiSignal : base.multiSignal,
    landlordOnly: typeof input.landlordOnly === "boolean" ? input.landlordOnly : base.landlordOnly,
    address: typeof input.address === "string" ? input.address : input.address === null ? null : base.address,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      query?: string;
      filters?: Partial<SearchFilters>;
      summarize?: boolean;
      sessionId?: string;
      fromProfile?: boolean;
      /** When true, body.filters is authoritative — do not re-parse the query text. */
      preferFilters?: boolean;
    };
    const sessionId = typeof body.sessionId === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(body.sessionId.trim())
      ? body.sessionId.trim()
      : "";
    const saved = body.fromProfile && sessionId ? await loadRenterProfile(sessionId) : null;
    let source: "gemini" | "local" | "filters" = "filters";
    let filters = emptyFilters();
    if (saved) {
      filters = profileToFilters(saved.profile);
      source = "filters";
      if (body.filters) filters = cleanFilters(body.filters, filters);
    } else if (body.preferFilters && body.filters) {
      // Edit-filter panel: trust the chip state, ignore leftover "restaurant-ready" query text.
      filters = cleanFilters(body.filters, emptyFilters());
      source = "filters";
    } else if (body.query?.trim()) {
      const interpreted = await interpretSearch(body.query.trim());
      filters = interpreted.filters;
      source = interpreted.source;
      if (body.filters) filters = cleanFilters(body.filters, filters);
    } else if (body.filters) {
      filters = cleanFilters(body.filters, emptyFilters());
      source = "filters";
    }
    let results = await searchStorefronts(filters);
    let rankSource: "gemini" | "profile" | null = null;
    let matchReasons: Record<string, string> = {};
    const interpretation = describeFilters(filters, results.length);
    let summary: string | null = null;
    let summarySource: "gemini" | "template" | null = null;
    if (saved && results.length) {
      const ranked = await rankForProfile(saved.profile, results);
      results = ranked.results;
      rankSource = ranked.source;
      matchReasons = ranked.reasons;
      summary = ranked.summary;
      summarySource = ranked.source === "gemini" && ranked.summary ? "gemini" : "template";
    } else if (body.summarize && results.length) {
      const sample = results.slice(0, 5).map((result) => ({
        address: result.address,
        neighborhood: result.neighborhood,
        turnoverScore: result.turnoverScore,
        fitScore: result.fitScore,
        availability: result.availability.label,
        signals: result.topSignals.map((signal) => signal.label),
      }));
      summary = await summarizeRecords(
        "Summarize why these NYC storefront records matched the search. Mention only addresses and facts present in the JSON.",
        { interpretation, results: sample },
      );
      summarySource = summary ? "gemini" : "template";
    }
    return NextResponse.json({
      filters,
      interpretation,
      interpreter: source,
      summary,
      summarySource,
      results,
      rankSource,
      matchReasons,
      profileBrief: saved?.brief ?? null,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Search failed" }, { status: 500 });
  }
}
