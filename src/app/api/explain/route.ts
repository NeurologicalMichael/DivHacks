import { NextResponse } from "next/server";
import { advanceAnalysis, summarizeRecords } from "@/lib/gemini";
import { buildAdvanceAnalysis, buildPlainSummary, demandUse, type AdvanceDemand } from "@/lib/plainSummary";
import { getStorefront } from "@/lib/queries";

function readDemand(value: unknown): AdvanceDemand {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const list = (item: unknown) => (Array.isArray(item) ? item.filter((entry): entry is string => typeof entry === "string") : []);
  return {
    query: typeof raw.query === "string" ? raw.query : "",
    boroughs: list(raw.boroughs),
    neighborhoods: list(raw.neighborhoods),
    category: typeof raw.category === "string" ? raw.category : null,
    months: typeof raw.months === "number" ? raw.months : null,
    nearSubway: raw.nearSubway === true,
    vacantOnly: raw.vacantOnly === true,
    minTurnover: typeof raw.minTurnover === "number" ? raw.minTurnover : 0,
    concept: typeof raw.concept === "string" ? raw.concept : "",
  };
}

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { propertyId?: string; category?: string | null; advance?: boolean; demand?: unknown };
    if (!body.propertyId) return NextResponse.json({ error: "propertyId is required" }, { status: 400 });
    const demand = body.advance ? readDemand(body.demand) : null;
    const category = demand ? (demandUse(demand) ?? body.category ?? null) : (body.category ?? null);
    const detail = await getStorefront(body.propertyId, category);
    if (!detail) return NextResponse.json({ error: "Storefront not found" }, { status: 404 });

    if (demand) {
      const template = buildAdvanceAnalysis(detail, demand);
      const records = {
        address: detail.address,
        neighborhood: detail.neighborhood,
        borough: detail.borough,
        activity: detail.activity,
        vacant: detail.vacant,
        availability: detail.availability.label,
        turnoverScore: detail.turnoverScore,
        fitScore: detail.fitScore,
        fitCategory: detail.fitCategory,
        nearestStation: detail.transit[0]
          ? { name: detail.transit[0].name, meters: detail.transit[0].meters }
          : null,
        topSignals: detail.signals.slice(0, 6).map((signal) => signal.label),
      };
      const gemini = await advanceAnalysis(demand, records, template);
      return NextResponse.json({
        text: gemini ?? template,
        source: gemini ? "gemini" : "template",
      });
    }

    const template = buildPlainSummary(detail);
    const records = {
      address: detail.address,
      neighborhood: detail.neighborhood,
      borough: detail.borough,
      reportingYear: detail.reportingYear,
      availability: detail.availability.label,
      turnoverScore: detail.turnoverScore,
      fitScore: detail.fitScore,
      topSignals: detail.signals.slice(0, 4).map((signal) => signal.label),
    };
    const gemini = await summarizeRecords(
      `Write 2 short sentences a non-expert can understand.
Sentence 1: where the storefront is and why it was flagged (use the topSignals labels in plain words).
Sentence 2: what the availability note means, and that this is public-record evidence not a for-rent listing.
No jargon. No bullet points. Max 55 words. Do not invent facts.`,
      records,
    );
    return NextResponse.json({
      text: gemini ?? template,
      source: gemini ? "gemini" : "template",
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Explanation failed" }, { status: 500 });
  }
}
