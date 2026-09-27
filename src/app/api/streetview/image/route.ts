import { NextResponse } from "next/server";
import { streetViewImage } from "@/lib/streetview";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id || id.length > 200) return NextResponse.json({ error: "id is required" }, { status: 400 });
  try {
    const image = await streetViewImage(id);
    if (!image) return NextResponse.json({ error: "No street photo" }, { status: 404 });
    return new NextResponse(new Uint8Array(image.body), {
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": "private, max-age=43200",
      },
    });
  } catch {
    return NextResponse.json({ error: "No street photo" }, { status: 404 });
  }
}
