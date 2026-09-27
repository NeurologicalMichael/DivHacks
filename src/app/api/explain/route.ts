import { NextResponse } from "next/server";
import { summarizeRecords } from "@/lib/gemini";
import { buildPlainSummary } from "@/lib/plainSummary";
import { getStorefront } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { propertyId?: string; category?: string | null };
    if (!body.propertyId) return NextResponse.json({ error: "propertyId is required" }, { status: 400 });
    const detail = await getStorefront(body.propertyId, body.category ?? null);
    if (!detail) return NextResponse.json({ error: "Storefront not found" }, { status: 404 });

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
