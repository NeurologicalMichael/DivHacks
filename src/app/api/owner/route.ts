import { NextResponse } from "next/server";
import { ownerRadar, unwatchProperty, watchProperty } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ watches: [] });
  try {
    const watches = await ownerRadar(sessionId.slice(0, 80));
    return NextResponse.json({
      watches,
      note: "This watchlist is stored for this browser session only. It is not published on the public map.",
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load watches" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { sessionId?: string; propertyId?: string };
    if (!body.sessionId || !body.propertyId) {
      return NextResponse.json({ error: "sessionId and propertyId are required" }, { status: 400 });
    }
    const watch = await watchProperty(body.sessionId.slice(0, 80), body.propertyId);
    if (!watch) return NextResponse.json({ error: "Storefront not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save watch" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");
  const propertyId = url.searchParams.get("propertyId");
  if (!sessionId || !propertyId) return NextResponse.json({ error: "Missing ids" }, { status: 400 });
  await unwatchProperty(sessionId.slice(0, 80), propertyId);
  return NextResponse.json({ ok: true });
}
