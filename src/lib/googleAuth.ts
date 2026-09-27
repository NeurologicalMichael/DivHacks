import { createPublicKey, createVerify, type JsonWebKey as CryptoJsonWebKey } from "crypto";
import { query } from "./db";
import type { DeskAccount } from "./desk";

export type GoogleIdentity = { sub: string; email: string; name: string };

type GoogleKey = JsonWebKey & { kid: string };

const globalCerts = globalThis as unknown as { leaselensGoogleCerts?: { keys: GoogleKey[]; at: number } };

export function googleClientId() {
  return (process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "").trim();
}

function decodePart(part: string): unknown {
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    throw new Error("Google did not return a valid sign-in.");
  }
}

async function googleKeys(): Promise<GoogleKey[]> {
  const cached = globalCerts.leaselensGoogleCerts;
  if (cached && Date.now() - cached.at < 60 * 60 * 1000) return cached.keys;
  const response = await fetch("https://www.googleapis.com/oauth2/v3/certs", { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("Google sign-in could not be checked. Try again.");
  const body = (await response.json()) as { keys?: GoogleKey[] };
  if (!body.keys?.length) throw new Error("Google sign-in could not be checked. Try again.");
  globalCerts.leaselensGoogleCerts = { keys: body.keys, at: Date.now() };
  return body.keys;
}

export async function verifyGoogleCredential(credential: string): Promise<GoogleIdentity> {
  const parts = credential.split(".");
  if (parts.length !== 3) throw new Error("Google did not return a valid sign-in.");
  const header = decodePart(parts[0]) as { alg?: string; kid?: string };
  if (header.alg !== "RS256" || !header.kid) throw new Error("Google did not return a valid sign-in.");
  const jwk = (await googleKeys()).find((key) => key.kid === header.kid);
  if (!jwk) throw new Error("Google sign-in could not be checked. Try again.");
  const key = createPublicKey({ key: jwk as unknown as CryptoJsonWebKey, format: "jwk" });
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${parts[0]}.${parts[1]}`);
  if (!verifier.verify(key, Buffer.from(parts[2], "base64url"))) {
    throw new Error("Google sign-in could not be checked.");
  }
  const payload = decodePart(parts[1]) as {
    aud?: string;
    iss?: string;
    exp?: number;
    email?: string;
    email_verified?: boolean | string;
    name?: string;
    given_name?: string;
    sub?: string;
  };
  const clientId = googleClientId();
  if (!clientId || payload.aud !== clientId) throw new Error("This Google sign-in is for a different app.");
  if (payload.iss !== "accounts.google.com" && payload.iss !== "https://accounts.google.com") {
    throw new Error("Google sign-in could not be checked.");
  }
  if (!payload.exp || payload.exp * 1000 < Date.now() - 60_000) throw new Error("Google sign-in expired. Try again.");
  if (!payload.sub || !payload.email) throw new Error("Google did not share an email.");
  if (payload.email_verified !== true && payload.email_verified !== "true") {
    throw new Error("Google has not verified that email.");
  }
  const name = (payload.name || payload.given_name || "").trim().slice(0, 80);
  return { sub: payload.sub, email: payload.email.trim().slice(0, 120), name };
}

async function ensureAccounts() {
  await query(
    `CREATE TABLE IF NOT EXISTS user_accounts (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      google_sub TEXT UNIQUE,
      name TEXT NOT NULL,
      business TEXT NOT NULL,
      email TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
  );
}

export async function findGoogleAccount(sub: string): Promise<DeskAccount | null> {
  try {
    await ensureAccounts();
    const rows = await query<{ name: string; business: string; email: string }>(
      `SELECT name, business, email FROM user_accounts WHERE google_sub = $1`,
      [sub],
    );
    const row = rows[0];
    if (!row?.name || !row.business || !row.email) return null;
    return { name: row.name, business: row.business, email: row.email, provider: "google" };
  } catch {
    return null;
  }
}

export async function saveGoogleAccount(identity: GoogleIdentity, business: string): Promise<{ account: DeskAccount; stored: boolean }> {
  const account: DeskAccount = {
    name: identity.name,
    business,
    email: identity.email,
    provider: "google",
  };
  try {
    await ensureAccounts();
    await query(
      `INSERT INTO user_accounts (id, provider, google_sub, name, business, email)
       VALUES ($1, 'google', $2, $3, $4, $5)
       ON CONFLICT (google_sub) DO UPDATE
         SET name = EXCLUDED.name, business = EXCLUDED.business, email = EXCLUDED.email`,
      [`google:${identity.sub}`, identity.sub, identity.name, business, identity.email],
    );
    return { account, stored: true };
  } catch {
    return { account, stored: false };
  }
}
