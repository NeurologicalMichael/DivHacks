import { query } from "./db";

type Place = { address: string; borough: string; zip: string | null; lat: number; lng: number };

export type StreetViewInfo =
  | { available: false; reason: "unconfigured" | "missing" | "none" }
  | { available: true; copyright: string; date: string | null };

type MetaHit = { at: number; info: StreetViewInfo; location?: string };
type ImageHit = { at: number; body: Buffer; contentType: string };

const TTL = 12 * 60 * 60 * 1000;
const metaCache = new Map<string, MetaHit>();
const imageCache = new Map<string, ImageHit>();

function fresh(at: number) {
  return Date.now() - at < TTL;
}

function addressLocation(place: Place) {
  const zip = place.zip ? ` ${place.zip}` : "";
  return `${place.address}, ${place.borough}, NY${zip}`;
}

async function loadPlace(id: string): Promise<Place | null> {
  const rows = await query<Place>(
    `SELECT address, borough, zip, lat, lng FROM properties WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

async function metadata(location: string, key: string) {
  const url = new URL("https://maps.googleapis.com/maps/api/streetview/metadata");
  url.searchParams.set("location", location);
  url.searchParams.set("source", "outdoor");
  url.searchParams.set("key", key);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;
  const payload = (await response.json()) as { status?: string; copyright?: string; date?: string };
  return payload;
}

async function resolve(id: string): Promise<MetaHit> {
  const cached = metaCache.get(id);
  if (cached && fresh(cached.at)) return cached;
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return { at: Date.now(), info: { available: false, reason: "unconfigured" } };
  const place = await loadPlace(id);
  if (!place) return { at: Date.now(), info: { available: false, reason: "missing" } };

  let location = addressLocation(place);
  let meta = await metadata(location, key);
  if (meta?.status !== "OK" && Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lng))) {
    location = `${place.lat},${place.lng}`;
    meta = await metadata(location, key);
  }

  const hit: MetaHit =
    meta?.status === "OK"
      ? {
          at: Date.now(),
          location,
          info: { available: true, copyright: meta.copyright || "© Google", date: meta.date ?? null },
        }
      : { at: Date.now(), info: { available: false, reason: "none" } };
  metaCache.set(id, hit);
  return hit;
}

export async function streetViewInfo(id: string): Promise<StreetViewInfo> {
  return (await resolve(id)).info;
}

export async function streetViewImage(id: string): Promise<{ body: Buffer; contentType: string } | null> {
  const cached = imageCache.get(id);
  if (cached && fresh(cached.at)) return { body: cached.body, contentType: cached.contentType };
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  const resolved = await resolve(id);
  if (!resolved.info.available || !resolved.location) return null;

  const url = new URL("https://maps.googleapis.com/maps/api/streetview");
  url.searchParams.set("size", "640x400");
  url.searchParams.set("location", resolved.location);
  url.searchParams.set("source", "outdoor");
  url.searchParams.set("return_error_code", "true");
  url.searchParams.set("key", key);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type") || "image/jpeg";
  if (!contentType.startsWith("image/")) return null;
  const body = Buffer.from(await response.arrayBuffer());
  imageCache.set(id, { at: Date.now(), body, contentType });
  return { body, contentType };
}
