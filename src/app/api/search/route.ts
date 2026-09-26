import { NextResponse } from "next/server";
import { describeFilters, emptyFilters } from "@/lib/parseQuery";
import { interpretSearch, summarizeRecords } from "@/lib/gemini";
import { searchStorefronts } from "@/lib/queries";
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
    const body = (await request.json()) as { query?: string; filters?: Partial<SearchFilters>; summarize?: boolean };
    let source: "gemini" | "local" | "filters" = "filters";
    let filters = emptyFilters();
    if (body.query?.trim()) {
      const interpreted = await interpretSearch(body.query.trim());
      filters = interpreted.filters;
      source = interpreted.source;
    }
    filters = cleanFilters(body.filters, filters);
    const results = await searchStorefronts(filters);
    const interpretation = describeFilters(filters, results.length);
    let summary: string | null = null;
    let summarySource: "gemini" | "template" | null = null;
    if (body.summarize && results.length) {
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
    return NextResponse.json({ filters, interpretation, interpreter: source, summary, summarySource, results });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Search failed" }, { status: 500 });
  }
}
