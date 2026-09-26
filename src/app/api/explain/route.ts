import { NextResponse } from "next/server";
import { summarizeRecords } from "@/lib/gemini";
import { getStorefront } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { propertyId?: string; category?: string | null };
    if (!body.propertyId) return NextResponse.json({ error: "propertyId is required" }, { status: 400 });
    const detail = await getStorefront(body.propertyId, body.category ?? null);
    if (!detail) return NextResponse.json({ error: "Storefront not found" }, { status: 404 });
    const records = {
      address: detail.address,
      neighborhood: detail.neighborhood,
      reportingYear: detail.reportingYear,
      availability: detail.availability,
      turnoverScore: detail.turnoverScore,
      fitScore: detail.fitScore,
      fitCategory: detail.fitCategory,
      signals: detail.signals.map((signal) => ({
        label: signal.label,
        weight: signal.weight,
        evidence: signal.evidence,
        source: signal.source,
        provenance: signal.provenance,
      })),
      transit: detail.transit,
      pedestrian: detail.pedestrian,
    };
    const gemini = await summarizeRecords(
      "Explain why this storefront was flagged. Use the score only as an index derived from the signals. Never turn a signal into a confirmed availability date.",
      records,
    );
    const template = detail.signals.length
      ? `Flagged from ${detail.signals.length} stored signal${detail.signals.length === 1 ? "" : "s"}. ${detail.availability.label}. ${detail.availability.disclaimer}`
      : `${detail.availability.label}. ${detail.availability.disclaimer}`;
    return NextResponse.json({
      text: gemini ?? template,
      source: gemini ? "gemini" : "template",
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Explanation failed" }, { status: 500 });
  }
}
