import { query } from "./db";

type Place = { address: string; borough: string; zip: string | null; lat: number; lng: number };

export type StreetViewInfo =
  | { available: false; reason: "unconfigured" | "missing" | "none" }
  | { available: true; copyright: string; date: string | null };

type MetaHit = { at: number; info: StreetViewInfo; imageUrl?: string };
type ImageHit = { at: number; body: Buffer; contentType: string };
type MapillaryImage = {
  id?: string;
  thumb_1024_url?: string;
  captured_at?: number;
  creator?: { username?: string };
  computed_geometry?: { coordinates?: [number, number] };
  geometry?: { coordinates?: [number, number] };
};

const TTL = 12 * 60 * 60 * 1000;
const metaCache = new Map<string, MetaHit>();
const imageCache = new Map<string, ImageHit>();

function fresh(at: number) {
  return Date.now() - at < TTL;
}

function meters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

async function loadPlace(id: string): Promise<Place | null> {
  const rows = await query<Place>(
    `SELECT address, borough, zip, lat, lng FROM properties WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

function point(image: MapillaryImage) {
  return image.computed_geometry?.coordinates ?? image.geometry?.coordinates;
}

async function nearestImage(place: Place, token: string): Promise<MapillaryImage | null> {
  const url = new URL("https://graph.mapillary.com/images");
  url.searchParams.set("fields", "id,thumb_1024_url,captured_at,computed_geometry,geometry,creator");
  url.searchParams.set("lat", String(place.lat));
  url.searchParams.set("lng", String(place.lng));
  url.searchParams.set("radius", "50");
  url.searchParams.set("limit", "8");
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Authorization: `OAuth ${token}` },
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { data?: MapillaryImage[] };
  const images = (payload.data ?? []).filter((image) => image.thumb_1024_url);
  if (!images.length) return null;
  images.sort((a, b) => {
    const aPoint = point(a);
    const bPoint = point(b);
    const aMeters = aPoint ? meters(place.lat, place.lng, aPoint[1], aPoint[0]) : 9999;
    const bMeters = bPoint ? meters(place.lat, place.lng, bPoint[1], bPoint[0]) : 9999;
    return aMeters - bMeters;
  });
  return images[0];
}

function credit(image: MapillaryImage) {
  const who = image.creator?.username ? `${image.creator.username} on Mapillary` : "Mapillary contributors";
  return `© ${who}, CC BY-SA`;
}

function captured(image: MapillaryImage) {
  if (!image.captured_at) return null;
  const date = new Date(image.captured_at);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

async function resolve(id: string): Promise<MetaHit> {
  const cached = metaCache.get(id);
  if (cached && fresh(cached.at)) return cached;
  const token = process.env.MAPILLARY_TOKEN;
  if (!token) return { at: Date.now(), info: { available: false, reason: "unconfigured" } };
  const place = await loadPlace(id);
  if (!place || !Number.isFinite(Number(place.lat)) || !Number.isFinite(Number(place.lng))) {
    const miss: MetaHit = { at: Date.now(), info: { available: false, reason: place ? "none" : "missing" } };
    metaCache.set(id, miss);
    return miss;
  }
  const image = await nearestImage(place, token);
  const hit: MetaHit = image?.thumb_1024_url
    ? {
        at: Date.now(),
        imageUrl: image.thumb_1024_url,
        info: { available: true, copyright: credit(image), date: captured(image) },
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
  const resolved = await resolve(id);
  if (!resolved.info.available || !resolved.imageUrl) return null;
  const response = await fetch(resolved.imageUrl, { cache: "no-store" });
  if (!response.ok) {
    metaCache.delete(id);
    return null;
  }
  const contentType = response.headers.get("content-type") || "image/jpeg";
  if (!contentType.startsWith("image/")) return null;
  const body = Buffer.from(await response.arrayBuffer());
  imageCache.set(id, { at: Date.now(), body, contentType });
  return { body, contentType };
}
