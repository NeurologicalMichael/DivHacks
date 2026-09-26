import { NextResponse } from "next/server";
import { getStorefront } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const category = new URL(request.url).searchParams.get("category");
    const detail = await getStorefront(decodeURIComponent(id), category);
    if (!detail) return NextResponse.json({ error: "Storefront not found" }, { status: 404 });
    return NextResponse.json(detail);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load storefront" }, { status: 500 });
  }
}
