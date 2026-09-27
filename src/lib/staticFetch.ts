import { describeFilters, emptyFilters, parseQuery } from "./parseQuery";
import { buildAdvanceAnalysis, buildPlainSummary, demandUse, type AdvanceDemand } from "./plainSummary";
import {
  setSnapshotData,
  snapshotGapAnalysis,
  snapshotGetStorefront,
  snapshotListNeighborhoods,
  snapshotNearbyCategoryCount,
  snapshotSearch,
} from "./snapshotStore";
import type { SearchFilters } from "./types";

const base = process.env.NEXT_PUBLIC_BASE_PATH || "";

let ready: Promise<void> | null = null;

function prime() {
  if (!ready) {
    ready = fetch(`${base}/snapshot.json`)
      .then((response) => {
        if (!response.ok) throw new Error("Could not load the published filings");
        return response.json();
      })
      .then((data) => {
        setSnapshotData(data);
      });
  }
  return ready;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function cleanFilters(input: Partial<SearchFilters> | undefined, fallback: SearchFilters): SearchFilters {
  if (!input) return fallback;
  return {
    boroughs: Array.isArray(input.boroughs) ? input.boroughs.map(String) : fallback.boroughs,
    neighborhoods: Array.isArray(input.neighborhoods) ? input.neighborhoods.map(String) : fallback.neighborhoods,
    category: typeof input.category === "string" ? input.category : input.category === null ? null : fallback.category,
    months: typeof input.months === "number" ? input.months : input.months === null ? null : fallback.months,
    minTurnover: typeof input.minTurnover === "number" ? input.minTurnover : fallback.minTurnover,
    vacantOnly: typeof input.vacantOnly === "boolean" ? input.vacantOnly : fallback.vacantOnly,
    nearSubway: typeof input.nearSubway === "boolean" ? input.nearSubway : fallback.nearSubway,
    multiSignal: typeof input.multiSignal === "boolean" ? input.multiSignal : fallback.multiSignal,
    landlordOnly: typeof input.landlordOnly === "boolean" ? input.landlordOnly : fallback.landlordOnly,
    address: typeof input.address === "string" ? input.address : input.address === null ? null : fallback.address,
  };
}

function readDemand(value: unknown): AdvanceDemand {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const list = (item: unknown) => (Array.isArray(item) ? item.filter((entry): entry is string => typeof entry === "string") : []);
  return {
    query: typeof raw.query === "string" ? raw.query : "",
    boroughs: list(raw.boroughs),
    neighborhoods: list(raw.neighborhoods),
    category: typeof raw.category === "string" ? raw.category : null,
    months: typeof raw.months === "number" ? raw.months : null,
    nearSubway: raw.nearSubway === true,
    vacantOnly: raw.vacantOnly === true,
    minTurnover: typeof raw.minTurnover === "number" ? raw.minTurnover : 0,
    concept: typeof raw.concept === "string" ? raw.concept : "",
  };
}

export async function staticFetch(input: string, init?: RequestInit) {
  await prime();
  const url = new URL(input, "https://leaselens.local");
  const path = url.pathname;

  if (path === "/api/search" && init?.method === "POST") {
    const body = JSON.parse(String(init.body || "{}")) as {
      query?: string;
      filters?: Partial<SearchFilters>;
      preferFilters?: boolean;
    };
    let filters = emptyFilters();
    if (body.preferFilters && body.filters) filters = cleanFilters(body.filters, emptyFilters());
    else if (body.query?.trim()) filters = cleanFilters(body.filters, parseQuery(body.query.trim()));
    else if (body.filters) filters = cleanFilters(body.filters, emptyFilters());
    const results = snapshotSearch(filters);
    return json({
      filters,
      interpretation: describeFilters(filters, results.length),
      interpreter: "local",
      summary: null,
      summarySource: null,
      results,
      rankSource: null,
      matchReasons: {},
      profileBrief: null,
    });
  }

  const storefront = path.match(/^\/api\/storefronts\/(.+)$/);
  if (storefront) {
    const id = decodeURIComponent(storefront[1]);
    const detail = snapshotGetStorefront(id, url.searchParams.get("category"));
    if (!detail) return json({ error: "Storefront not found" }, 404);
    return json(detail);
  }

  if (path === "/api/explain" && init?.method === "POST") {
    const body = JSON.parse(String(init.body || "{}")) as {
      propertyId?: string;
      category?: string | null;
      advance?: boolean;
      demand?: unknown;
    };
    if (!body.propertyId) return json({ error: "propertyId is required" }, 400);
    const demand = body.advance ? readDemand(body.demand) : null;
    const category = demand ? (demandUse(demand) ?? body.category ?? null) : (body.category ?? null);
    const detail = snapshotGetStorefront(body.propertyId, category);
    if (!detail) return json({ error: "Storefront not found" }, 404);
    const text = demand ? buildAdvanceAnalysis(detail, demand) : buildPlainSummary(detail);
    return json({ text, source: "template" });
  }

  if (path === "/api/gap") {
    const neighborhood = url.searchParams.get("neighborhood");
    if (!neighborhood) return json({ neighborhoods: snapshotListNeighborhoods() });
    const propertyId = url.searchParams.get("propertyId");
    const nearbyFood = propertyId ? snapshotNearbyCategoryCount(propertyId, "food_and_drink") : null;
    const gaps = snapshotGapAnalysis(neighborhood, nearbyFood);
    const narrative = gaps.length
      ? gaps.map((gap) => `${gap.label}: ${gap.evidence}${gap.caution ? ` ${gap.caution}` : ""}`).join(" ")
      : `${neighborhood} is not thinner than peer neighborhoods on the comparisons in this extract.`;
    return json({
      neighborhood,
      gaps,
      nearbyFood,
      narrative,
      narrativeSource: "template",
      disclaimer:
        "These comparisons are hypotheses from public filings and inspection locations. They are not a recommendation and they do not measure sales, rent, or unmet demand.",
    });
  }

  if (path === "/api/streetview") return json({ available: false, reason: "unconfigured" });
  if (path === "/api/owner") return json({ watches: [], note: "" });
  if (path === "/api/profile") return json({ profile: null });

  return json(
    { error: "That action needs the app server. The published site can search and explain the filings already loaded." },
    400,
  );
}
