import { NextResponse } from "next/server";
import { createLandlordSignal } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      propertyId?: string;
      windowMonths?: number;
      note?: string;
      email?: string;
    };
    if (!body.propertyId) return NextResponse.json({ error: "Choose a storefront." }, { status: 400 });
    if (![3, 6, 12].includes(body.windowMonths ?? 0)) {
      return NextResponse.json({ error: "Window must be 3, 6, or 12 months." }, { status: 400 });
    }
    const created = await createLandlordSignal({
      propertyId: body.propertyId,
      windowMonths: body.windowMonths as number,
      note: body.note?.slice(0, 500) || null,
      email: body.email?.slice(0, 160) || null,
    });
    if (!created) return NextResponse.json({ error: "That storefront is not in this extract." }, { status: 404 });
    return NextResponse.json({
      ok: true,
      publicSignal: `Anonymous landlord signal: possible availability within ${body.windowMonths} months. Your note and email are not shown to entrepreneurs.`,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save opt-in" }, { status: 500 });
  }
}
