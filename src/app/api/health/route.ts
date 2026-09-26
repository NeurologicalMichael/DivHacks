import { NextResponse } from "next/server";
import { geminiConfigured } from "@/lib/gemini";
import { health } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await health();
    return NextResponse.json({
      ok: true,
      ...status,
      gemini: geminiConfigured(),
      asOf: "2026-09-26",
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Database unavailable" }, { status: 500 });
  }
}
