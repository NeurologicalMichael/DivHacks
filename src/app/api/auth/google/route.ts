import { findGoogleAccount, googleClientId, saveGoogleAccount, verifyGoogleCredential } from "@/lib/googleAuth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!googleClientId()) {
    return NextResponse.json({ error: "Google sign-in is not configured." }, { status: 503 });
  }
  let body: { credential?: unknown; business?: unknown; name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Google did not return a valid sign-in." }, { status: 400 });
  }
  const credential = typeof body.credential === "string" ? body.credential.trim() : "";
  if (credential.length < 20 || credential.length > 8000) {
    return NextResponse.json({ error: "Google did not return a valid sign-in." }, { status: 400 });
  }
  let identity;
  try {
    identity = await verifyGoogleCredential(credential);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Google sign-in failed.";
    return NextResponse.json({ error: message }, { status: 401 });
  }
  const business = typeof body.business === "string" ? body.business.trim().slice(0, 80) : "";
  const typedName = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  const name = identity.name.length >= 2 ? identity.name : typedName;
  if (business.length < 2) {
    const existing = await findGoogleAccount(identity.sub);
    if (existing) return NextResponse.json({ account: existing, stored: true });
    return NextResponse.json({ name, email: identity.email, needsBusiness: true });
  }
  if (name.length < 2) {
    return NextResponse.json({ error: "Enter your name.", email: identity.email, needsBusiness: true }, { status: 400 });
  }
  const saved = await saveGoogleAccount({ ...identity, name }, business);
  return NextResponse.json(saved);
}
