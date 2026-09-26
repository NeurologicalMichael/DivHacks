import { NextResponse } from "next/server";
import { summarizeRecords } from "@/lib/gemini";
import { gapAnalysis, listNeighborhoods, nearbyCategoryCount } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const neighborhood = new URL(request.url).searchParams.get("neighborhood");
  if (!neighborhood) {
    const neighborhoods = await listNeighborhoods();
    return NextResponse.json({ neighborhoods });
  }
  try {
    const propertyId = new URL(request.url).searchParams.get("propertyId");
    const nearbyFood = propertyId ? await nearbyCategoryCount(propertyId, "food_and_drink") : null;
    const gaps = await gapAnalysis(neighborhood, nearbyFood);
    const records = { neighborhood, gaps, nearbyFoodWithin400m: nearbyFood };
    const gemini = await summarizeRecords(
      "Explain the gap hypotheses for a person deciding what business might be underserved. Call them hypotheses. Do not claim demand, rent, or foot traffic that is not in the JSON.",
      records,
    );
    const template = gaps.length
      ? gaps.map((gap) => `${gap.label}: ${gap.evidence}${gap.caution ? ` ${gap.caution}` : ""}`).join(" ")
      : `${neighborhood} is not thinner than peer neighborhoods on the food-density or retail-share comparisons in this extract. That is not evidence that every category is well served.`;
    return NextResponse.json({
      neighborhood,
      gaps,
      nearbyFood,
      narrative: gemini ?? template,
      narrativeSource: gemini ? "gemini" : "template",
      disclaimer:
        "These comparisons are hypotheses from public filings and inspection locations. They are not a recommendation and they do not measure sales, rent, or unmet demand.",
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gap analysis failed" }, { status: 500 });
  }
}
