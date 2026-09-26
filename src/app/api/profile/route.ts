import { NextResponse } from "next/server";
import { loadRenterProfile, saveRenterProfile } from "@/lib/queries";

export const dynamic = "force-dynamic";

function sessionOf(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().slice(0, 80);
  return /^[A-Za-z0-9_-]+$/.test(trimmed) ? trimmed : "";
}

export async function GET(request: Request) {
  const sessionId = sessionOf(new URL(request.url).searchParams.get("sessionId"));
  if (!sessionId) return NextResponse.json({ profile: null, brief: null });
  try {
    const saved = await loadRenterProfile(sessionId);
    return NextResponse.json(saved ?? { profile: null, brief: null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load profile" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { sessionId?: string; profile?: unknown };
    const sessionId = sessionOf(body.sessionId);
    if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    const saved = await saveRenterProfile(sessionId, body.profile);
    if (!saved) return NextResponse.json({ error: "Profile is missing a lease type, place, use, or timing." }, { status: 400 });
    return NextResponse.json(saved);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save profile" }, { status: 500 });
  }
}
