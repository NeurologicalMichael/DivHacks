import { NextResponse } from "next/server";
import { streetViewInfo } from "@/lib/streetview";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id || id.length > 200) return NextResponse.json({ error: "id is required" }, { status: 400 });
  try {
    const info = await streetViewInfo(id);
    if (!info.available && info.reason === "missing") {
      return NextResponse.json({ error: "Storefront not found" }, { status: 404 });
    }
    return NextResponse.json(info);
  } catch {
    return NextResponse.json({ available: false, reason: "none" });
  }
}
