import "./snapshotDisk";
import { availabilityFor } from "./availability";
import { query } from "./db";
import { normalizeProfile, profileBrief, type RenterProfile } from "./profile";
import {
  snapshotGapAnalysis,
  snapshotGetStorefront,
  snapshotHealth,
  snapshotListNeighborhoods,
  snapshotNearbyCategoryCount,
  snapshotSearch,
} from "./snapshotStore";
import { toIsoDate } from "./format";
import { matchMetric } from "./signals";
import { normalizeTimeline } from "./timeline";
import type { BreakdownItem, Gap, SearchFilters, StorefrontDetail, Summary } from "./types";

type Row = Record<string, unknown>;

let dbDownUntil = 0;

/** Prefer Postgres; fall back to data/snapshot.json when DB is unreachable. */
async function withDb<T>(run: () => Promise<T>, fallback: () => T | Promise<T>): Promise<T> {
  if (Date.now() < dbDownUntil) return fallback();
  try {
    const result = await run();
    dbDownUntil = 0;
    return result;
  } catch {
    dbDownUntil = Date.now() + 30_000;
    return fallback();
  }
}

function date(value: unknown) {
  return toIsoDate(value);
}

function num(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fitScore(components: BreakdownItem[]) {
  return Math.min(100, components.reduce((sum, item) => sum + item.points, 0));
}

function mapSummary(row: Row, category: string): Summary {
  const components = (row.components as BreakdownItem[] | null) ?? [];
  const hasDemoLandlord = Boolean(row.has_demo_landlord);
  const hasLandlordOptIn = Boolean(row.has_landlord_opt_in);
  const vacant = Boolean(row.vacant_on_1231) || Boolean(row.vacant_on_630);
  return {
    id: String(row.id),
    address: String(row.address),
    borough: String(row.borough),
    neighborhood: String(row.neighborhood),
    zip: row.zip ? String(row.zip) : null,
    lat: Number(row.lat),
    lng: Number(row.lng),
    bbl: String(row.bbl),
    activity: row.primary_activity ? String(row.primary_activity) : null,
    activityCategory: row.activity_category ? String(row.activity_category) : null,
    reportingYear: row.reporting_year ? String(row.reporting_year) : null,
    reportingYearNum: num(row.reporting_year_num),
    asOf: date(row.as_of),
    vacant,
    leaseExpiration: date(row.lease_expiration),
    turnoverScore: Number(row.turnover_score ?? 0),
    fitScore: fitScore(components),
    fitCategory: category,
    retailArea: num(row.retail_area),
    signalCount: Number(row.signal_count ?? 0),
    hasDemoLandlord,
    hasLandlordOptIn,
    availability: availabilityFor({
      vacant,
      reportingYear: row.reporting_year ? String(row.reporting_year) : null,
      reportingYearNum: num(row.reporting_year_num),
      asOf: date(row.as_of),
      leaseExpiration: date(row.lease_expiration),
      hasDemoLandlord,
      hasLandlordOptIn,
      landlordWindow: num(row.landlord_window),
    }),
    topSignals: Array.isArray(row.top_signals) ? (row.top_signals as Summary["topSignals"]) : [],
    metricIds: Array.isArray(row.metric_ids)
      ? (row.metric_ids as unknown[]).map(String)
      : Array.isArray(row.top_signals)
        ? [
            ...new Set(
              (row.top_signals as Summary["topSignals"])
                .map((s) => matchMetric(s.label)?.id)
                .filter((id): id is NonNullable<typeof id> => id != null)
                .map(String),
            ),
          ]
        : [],
  };
}

export async function searchStorefronts(filters: SearchFilters) {
  return withDb(() => searchStorefrontsDb(filters), () => snapshotSearch(filters));
}

async function searchStorefrontsDb(filters: SearchFilters) {
  const params: unknown[] = [filters.category ?? "storefront"];
  const where: string[] = [];
  const open =
    filters.boroughs.length === 0 &&
    filters.neighborhoods.length === 0 &&
    !filters.category &&
    filters.months == null &&
    filters.minTurnover <= 0 &&
    !filters.vacantOnly &&
    !filters.nearSubway &&
    !filters.multiSignal &&
    !filters.landlordOnly &&
    !filters.address;

  const placeClauses: string[] = [];
  if (filters.boroughs.length) {
    params.push(filters.boroughs.map((borough) => borough.toLowerCase()));
    placeClauses.push(`lower(p.borough) = ANY($${params.length}::text[])`);
  }
  if (filters.neighborhoods.length) {
    params.push(filters.neighborhoods);
    const neighParam = `$${params.length}::text[]`;
    // Catalog labels are short (e.g. Chinatown); filings use NTAs (Chinatown-Two Bridges).
    placeClauses.push(`EXISTS (
      SELECT 1 FROM unnest(${neighParam}) AS sel(name)
      WHERE lower(p.neighborhood) = lower(sel.name)
         OR lower(p.neighborhood) LIKE lower(sel.name) || '-%'
         OR lower(p.neighborhood) LIKE lower(sel.name) || ' (%'
         OR lower(p.neighborhood) LIKE lower(sel.name) || ' %'
    )`);
  }
  if (placeClauses.length === 1) where.push(placeClauses[0]!);
  else if (placeClauses.length > 1) where.push(`(${placeClauses.join(" OR ")})`);

  if (filters.minTurnover > 0) {
    params.push(filters.minTurnover);
    where.push(`p.turnover_score >= $${params.length}`);
  }
  if (filters.vacantOnly) {
    where.push("(p.vacant_on_1231 OR p.vacant_on_630)");
  }
  if (filters.multiSignal) where.push("p.signal_count >= 2");
  if (filters.landlordOnly) {
    where.push(
      "EXISTS (SELECT 1 FROM landlord_signals l WHERE l.property_id = p.id AND l.active)",
    );
  }
  if (filters.nearSubway) {
    where.push(`EXISTS (
      SELECT 1 FROM transit_stations t
      WHERE ST_DWithin(p.geom::geography, t.geom::geography, 500)
    )`);
  }
  if (filters.address) {
    params.push(`%${filters.address.replace(/[%_]/g, "")}%`);
    where.push(`p.address ILIKE $${params.length}`);
  }
  if (filters.months != null) {
    params.push(filters.months);
    const month = `$${params.length}`;
    where.push(`(
      ((p.vacant_on_1231 OR p.vacant_on_630) AND p.reporting_year_num >= 2024)
      OR (
        p.lease_expiration IS NOT NULL
        AND p.reporting_year_num >= 2023
        AND p.lease_expiration BETWEEN CURRENT_DATE - 120 AND CURRENT_DATE + (${month}::int || ' months')::interval
      )
      OR EXISTS (
        SELECT 1 FROM landlord_signals l
        WHERE l.property_id = p.id AND l.active AND l.window_months <= ${month}::int
      )
    )`);
  }

  params.push(open ? 0 : filters.category ? 40 : 0);
  const fitFloor = `$${params.length}`;
  const limitSql = open ? "" : ` LIMIT $${params.length + 1}`;
  if (!open) params.push(500);

  const rows = await query<Row>(
    `WITH scored AS (
       SELECT p.*,
         fit_components(p.id, $1) AS components,
         (
           SELECT min(window_months) FROM landlord_signals l
           WHERE l.property_id = p.id AND l.active
         ) AS landlord_window,
         (
           SELECT jsonb_agg(jsonb_build_object('label', s.label, 'provenance', s.provenance, 'weight', s.weight) ORDER BY s.weight DESC)
           FROM (
             SELECT label, provenance, weight FROM signals s
             WHERE s.property_id = p.id
             ORDER BY weight DESC
             LIMIT 3
           ) s
         ) AS top_signals,
         (
           SELECT coalesce(jsonb_agg(DISTINCT s.signal_type), '[]'::jsonb)
           FROM signals s
           WHERE s.property_id = p.id
         ) AS metric_ids
       FROM v_storefronts p
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     )
     SELECT * FROM (
       SELECT scored.*,
         LEAST(100, COALESCE((
           SELECT sum((item->>'points')::int) FROM jsonb_array_elements(scored.components) item
         ), 0))::int AS fit_score
       FROM scored
     ) ranked
     WHERE fit_score >= ${fitFloor}
     ORDER BY fit_score DESC, turnover_score DESC, address
     ${limitSql}`,
    params,
  );

  return rows.map((row) => mapSummary(row, filters.category ?? "storefront"));
}

export async function getStorefront(id: string, category: string | null): Promise<StorefrontDetail | null> {
  return withDb(() => getStorefrontDb(id, category), () => snapshotGetStorefront(id, category));
}

async function getStorefrontDb(id: string, category: string | null): Promise<StorefrontDetail | null> {
  const rows = await query<Row>(
    `SELECT p.*,
       fit_components(p.id, $2) AS components,
       (SELECT min(window_months) FROM landlord_signals l WHERE l.property_id = p.id AND l.active) AS landlord_window,
       (
         SELECT jsonb_agg(jsonb_build_object('label', s.label, 'provenance', s.provenance, 'weight', s.weight) ORDER BY s.weight DESC)
         FROM (
           SELECT label, provenance, weight FROM signals s WHERE s.property_id = p.id ORDER BY weight DESC LIMIT 3
         ) s
       ) AS top_signals
     FROM v_storefronts p
     WHERE p.id = $1`,
    [id, category ?? "storefront"],
  );
  const row = rows[0];
  if (!row) return null;
  const summary = mapSummary(row, category ?? "storefront");

  const [signals, timeline, transit, pedestrian, nearby, neighborhood, salesTrend, filingTrend] =
    await Promise.all([
      query<Row>(
        `SELECT label, weight, evidence, source, observed_at, provenance
         FROM signals WHERE property_id = $1 ORDER BY weight DESC, observed_at DESC NULLS LAST`,
        [id],
      ),
      query<Row>(
        `SELECT occurred_at, event_type, title, detail, source, provenance, payload
         FROM property_events WHERE property_id = $1
         ORDER BY occurred_at DESC
         LIMIT 48`,
        [id],
      ),
      query<Row>(
        `SELECT s.name, s.routes, s.ada,
           round(ST_Distance(p.geom::geography, s.geom::geography))::int AS meters
         FROM properties p
         JOIN transit_stations s ON ST_DWithin(p.geom::geography, s.geom::geography, 900)
         WHERE p.id = $1
         ORDER BY meters
         LIMIT 4`,
        [id],
      ),
      query<Row>(
        `SELECT c.location, c.count, c.count_label, c.source,
           round(ST_Distance(p.geom::geography, c.geom::geography))::int AS meters
         FROM properties p
         JOIN pedestrian_counts c ON ST_DWithin(p.geom::geography, c.geom::geography, 700)
         WHERE p.id = $1
         ORDER BY meters
         LIMIT 1`,
        [id],
      ),
      query<Row>(
        `SELECT b.name, b.category, b.activity, b.source,
           round(ST_Distance(p.geom::geography, b.geom::geography))::int AS meters
         FROM properties p
         JOIN businesses b ON ST_DWithin(p.geom::geography, b.geom::geography, 400)
         WHERE p.id = $1
         ORDER BY meters
         LIMIT 8`,
        [id],
      ),
      query<Row>("SELECT * FROM neighborhood_stats WHERE name = $1", [row.neighborhood]),
      query<Row>(
        `SELECT year, sales, median_price, source FROM sales_trends
         WHERE neighborhood = $1 ORDER BY year`,
        [row.neighborhood],
      ),
      query<Row>(
        `SELECT to_char(year_bucket, 'YYYY') AS year, filings, vacant_filings
         FROM v_filing_trends WHERE neighborhood = $1 ORDER BY year_bucket`,
        [row.neighborhood],
      ),
    ]);

  const stats = neighborhood[0];
  const categories = (stats?.categories as Record<string, number> | undefined) ?? {};
  const retailCount = Number(categories.retail ?? 0);
  const storefronts = Number(stats?.storefronts ?? 0);
  const signalRows = signals.map((signal) => ({
    label: String(signal.label),
    weight: Number(signal.weight),
    evidence: String(signal.evidence),
    source: String(signal.source),
    observedAt: date(signal.observed_at),
    provenance: String(signal.provenance),
  }));

  return {
    ...summary,
    unit: row.unit ? String(row.unit) : null,
    zoning: row.zoning ? String(row.zoning) : null,
    buildingClass: row.building_class ? String(row.building_class) : null,
    yearBuilt: num(row.year_built),
    retailArea: num(row.retail_area),
    assessedTotal: num(row.assessed_total),
    plutoMatched: Boolean(row.pluto_matched),
    sourceDataset: String(row.source_dataset),
    signals: signalRows,
    fitBreakdown: (row.components as BreakdownItem[]) ?? [],
    timeline: normalizeTimeline(timeline).slice(0, 24),
    transit: transit.map((station) => ({
      name: String(station.name),
      routes: station.routes ? String(station.routes) : null,
      meters: Number(station.meters),
      ada: Boolean(station.ada),
    })),
    pedestrian: pedestrian[0]
      ? {
          location: String(pedestrian[0].location),
          count: Number(pedestrian[0].count),
          countLabel: String(pedestrian[0].count_label),
          meters: Number(pedestrian[0].meters),
          source: String(pedestrian[0].source),
        }
      : null,
    nearby: nearby.map((business) => ({
      name: business.name ? String(business.name) : null,
      category: String(business.category),
      activity: business.activity ? String(business.activity) : null,
      meters: Number(business.meters),
      source: String(business.source),
    })),
    area: stats
      ? {
          name: String(stats.name),
          reportingYear: String(stats.reporting_year),
          storefronts,
          vacant: Number(stats.vacant ?? 0),
          vacancyRate: num(stats.vacancy_rate),
          vacancyRate2023: num(stats.vacancy_rate_2023),
          retailCount,
          retailShare: storefronts ? retailCount / storefronts : null,
          restaurantCount: num(stats.restaurant_count),
          restaurantNote: stats.restaurant_note ? String(stats.restaurant_note) : null,
          source: String(stats.source),
          salesTrend: salesTrend.map((trend) => ({
            year: Number(trend.year),
            sales: Number(trend.sales),
            medianPrice: Number(trend.median_price),
            source: String(trend.source),
          })),
          filingTrend: filingTrend.map((trend) => ({
            year: String(trend.year),
            filings: Number(trend.filings),
            vacantFilings: Number(trend.vacant_filings),
          })),
        }
      : null,
    whyFlagged: signalRows.map((signal) => signal.evidence),
  };
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export async function gapAnalysis(neighborhood: string, nearbyFood: number | null): Promise<Gap[]> {
  return withDb(
    () => gapAnalysisDb(neighborhood, nearbyFood),
    () => snapshotGapAnalysis(neighborhood, nearbyFood),
  );
}

async function gapAnalysisDb(neighborhood: string, nearbyFood: number | null): Promise<Gap[]> {
  const rows = await query<Row>(
    "SELECT name, borough, storefronts, categories, restaurant_count, restaurant_note FROM neighborhood_stats",
  );
  const focus = rows.find((row) => String(row.name) === neighborhood);
  if (!focus) return [];
  const peers = rows.filter((row) => row.borough === focus.borough);
  const restaurantCounts = peers
    .map((row) => num(row.restaurant_count))
    .filter((value): value is number => value != null);
  const retailShares = peers
    .map((row) => {
      const total = Number(row.storefronts ?? 0);
      const retail = Number((row.categories as Record<string, number> | null)?.retail ?? 0);
      return total ? retail / total : null;
    })
    .filter((value): value is number => value != null);

  const gaps: Gap[] = [];
  const localRestaurants = num(focus.restaurant_count);
  const restaurantMedian = median(restaurantCounts);
  if (localRestaurants != null && restaurantMedian > 0 && localRestaurants < restaurantMedian * 0.72) {
    gaps.push({
      category: "food_and_drink",
      label: "Food and drink",
      localValue: localRestaurants,
      peerMedian: Math.round(restaurantMedian),
      unit: "DOHMH restaurants in an 800 m box",
      evidence: `${neighborhood} has ${localRestaurants} distinct DOHMH restaurant locations in the 800 meter box. The median across loaded ${focus.borough} neighborhoods in this extract is ${Math.round(restaurantMedian)}. ${focus.restaurant_note ?? ""}`,
      caution:
        nearbyFood != null && nearbyFood >= 12
          ? `The neighborhood box is thinner than those peers, but ${nearbyFood} food businesses in the loaded sample still sit within 400 meters of the selected storefront.`
          : null,
    });
  }

  const localRetail = Number((focus.categories as Record<string, number> | null)?.retail ?? 0);
  const localTotal = Number(focus.storefronts ?? 0);
  const localShare = localTotal ? localRetail / localTotal : 0;
  const retailMedian = median(retailShares);
  if (localTotal >= 200 && retailMedian > 0 && localShare < retailMedian * 0.72) {
    gaps.push({
      category: "retail",
      label: "Retail",
      localValue: Math.round(localShare * 1000) / 10,
      peerMedian: Math.round(retailMedian * 1000) / 10,
      unit: "percent of 2024 storefront filings reporting RETAIL",
      evidence: `${localRetail} of ${localTotal} ${neighborhood} filings in reporting year 2024 use the RETAIL activity label (${(localShare * 100).toFixed(1)}%). The median retail share for loaded ${focus.borough} neighborhoods is ${(retailMedian * 100).toFixed(1)}%. This is an owner-reported category, not a count of shops observed on the street.`,
      caution: null,
    });
  }
  return gaps;
}

export async function nearbyCategoryCount(propertyId: string, category: string) {
  return withDb(
    () => nearbyCategoryCountDb(propertyId, category),
    () => snapshotNearbyCategoryCount(propertyId, category),
  );
}

async function nearbyCategoryCountDb(propertyId: string, category: string) {
  const rows = await query<Row>(
    `SELECT count(*)::int AS n
     FROM businesses b
     JOIN properties p ON p.id = $1
     WHERE b.category = $2
       AND ST_DWithin(p.geom::geography, b.geom::geography, 400)`,
    [propertyId, category],
  );
  return Number(rows[0]?.n ?? 0);
}

export async function listNeighborhoods() {
  return withDb(
    () =>
      query<{ name: string; borough: string; storefronts: number; vacant: number; restaurant_count: number | null }>(
        `SELECT name, borough, storefronts, vacant, restaurant_count
         FROM neighborhood_stats ORDER BY borough, name`,
      ),
    () => snapshotListNeighborhoods(),
  );
}

export async function health() {
  return withDb(async () => {
    const rows = await query<Row>(`
      SELECT
        (SELECT count(*) FROM properties)::int AS properties,
        (SELECT count(*) FROM signals)::int AS signals,
        (SELECT count(*) FROM businesses)::int AS businesses,
        (SELECT extversion FROM pg_extension WHERE extname = 'timescaledb') AS timescaledb,
        (SELECT PostGIS_Version()) AS postgis,
        (SELECT count(*) FROM timescaledb_information.hypertables WHERE hypertable_name = 'property_events')::int AS hypertables,
        (SELECT count(*) FROM v_storefronts WHERE signal_count >= 2)::int AS multi_signal
    `);
    return { ...rows[0], mode: "postgres" };
  }, () => snapshotHealth());
}

const memoryWatches = new Map<string, Set<string>>();

export async function createLandlordSignal(input: {
  propertyId: string;
  windowMonths: number;
  note: string | null;
  email: string | null;
}) {
  return withDb(
    async () => {
      const id = `opt-${crypto.randomUUID()}`;
      const rows = await query<Row>(
        `INSERT INTO landlord_signals (id, property_id, window_months, note, contact_email, is_demo)
         SELECT $1, id, $3, $4, $5, FALSE FROM properties WHERE id = $2
         RETURNING id, property_id, window_months`,
        [id, input.propertyId, input.windowMonths, input.note, input.email],
      );
      if (!rows[0]) return null;
      await query("SELECT refresh_signals()");
      return rows[0];
    },
    () => ({
      id: `opt-${crypto.randomUUID()}`,
      property_id: input.propertyId,
      window_months: input.windowMonths,
    }),
  );
}

let profileTableReady = false;

async function ensureProfileTable() {
  if (profileTableReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS renter_profiles (
      session_id TEXT PRIMARY KEY,
      lease_kind TEXT,
      commercial_use TEXT,
      beds TEXT,
      budget TEXT,
      home_budget TEXT,
      size_band TEXT,
      timing TEXT,
      near_subway BOOLEAN,
      boroughs TEXT[] NOT NULL DEFAULT '{}',
      neighborhoods TEXT[] NOT NULL DEFAULT '{}',
      must_haves TEXT[] NOT NULL DEFAULT '{}',
      concept TEXT,
      profile JSONB NOT NULL,
      brief JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`ALTER TABLE renter_profiles ALTER COLUMN lease_kind DROP NOT NULL`);
  profileTableReady = true;
}

export async function saveRenterProfile(sessionId: string, input: unknown) {
  const profile = normalizeProfile(input);
  if (!profile) return null;
  const brief = profileBrief(profile);
  try {
    await ensureProfileTable();
    const rows = await query<Row>(
      `INSERT INTO renter_profiles (
         session_id, lease_kind, commercial_use, beds, budget, home_budget, size_band, timing,
         near_subway, boroughs, neighborhoods, must_haves, concept, profile, brief
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8,
         $9, $10, $11, $12, $13, $14::jsonb, $15::jsonb
       )
       ON CONFLICT (session_id) DO UPDATE SET
         lease_kind = EXCLUDED.lease_kind,
         commercial_use = EXCLUDED.commercial_use,
         beds = EXCLUDED.beds,
         budget = EXCLUDED.budget,
         home_budget = EXCLUDED.home_budget,
         size_band = EXCLUDED.size_band,
         timing = EXCLUDED.timing,
         near_subway = EXCLUDED.near_subway,
         boroughs = EXCLUDED.boroughs,
         neighborhoods = EXCLUDED.neighborhoods,
         must_haves = EXCLUDED.must_haves,
         concept = EXCLUDED.concept,
         profile = EXCLUDED.profile,
         brief = EXCLUDED.brief,
         updated_at = now()
       RETURNING profile, brief, updated_at`,
      [
        sessionId,
        profile.leaseKind,
        profile.use,
        profile.beds,
        profile.budget,
        profile.homeBudget,
        profile.size,
        profile.timing,
        profile.nearSubway,
        profile.boroughs,
        profile.neighborhoods,
        profile.mustHaves,
        profile.concept || null,
        JSON.stringify(profile),
        JSON.stringify(brief),
      ],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      profile: row.profile as RenterProfile,
      brief: row.brief as ReturnType<typeof profileBrief>,
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    };
  } catch {
    return {
      profile,
      brief,
      updatedAt: new Date().toISOString(),
    };
  }
}

export async function loadRenterProfile(sessionId: string) {
  try {
    await ensureProfileTable();
    const rows = await query<Row>(
      `SELECT profile, brief, updated_at FROM renter_profiles WHERE session_id = $1`,
      [sessionId],
    );
    const row = rows[0];
    if (!row) return null;
    const profile = normalizeProfile(row.profile);
    if (!profile) return null;
    return {
      profile,
      brief: profileBrief(profile),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    };
  } catch {
    return null;
  }
}

export async function watchProperty(sessionId: string, propertyId: string) {
  return withDb(
    async () => {
      const id = `watch-${crypto.randomUUID()}`;
      const rows = await query<Row>(
        `INSERT INTO owner_watches (id, session_id, property_id)
         SELECT $1, $2, id FROM properties WHERE id = $3
         ON CONFLICT (session_id, property_id) DO UPDATE SET created_at = owner_watches.created_at
         RETURNING id, property_id`,
        [id, sessionId, propertyId],
      );
      return rows[0] ?? null;
    },
    () => {
      const set = memoryWatches.get(sessionId) ?? new Set<string>();
      set.add(propertyId);
      memoryWatches.set(sessionId, set);
      return { id: `watch-${propertyId}`, property_id: propertyId };
    },
  );
}

export async function unwatchProperty(sessionId: string, propertyId: string) {
  return withDb(
    async () => {
      await query("DELETE FROM owner_watches WHERE session_id = $1 AND property_id = $2", [
        sessionId,
        propertyId,
      ]);
    },
    () => {
      memoryWatches.get(sessionId)?.delete(propertyId);
    },
  );
}

export async function ownerRadar(sessionId: string) {
  return withDb(
    () => ownerRadarDb(sessionId),
    () => ownerRadarSnapshot(sessionId),
  );
}

async function ownerRadarDb(sessionId: string) {
  const watches = await query<Row>(
    `SELECT w.property_id, p.address, p.neighborhood, p.borough, p.lat, p.lng, p.turnover_score
     FROM owner_watches w
     JOIN v_storefronts p ON p.id = w.property_id
     WHERE w.session_id = $1
     ORDER BY w.created_at DESC`,
    [sessionId],
  );
  const results = [];
  for (const watch of watches) {
    const nearby = await query<Row>(
      `SELECT p.address, p.neighborhood, s.label, s.evidence, s.observed_at, s.provenance,
         round(ST_Distance(origin.geom::geography, p.geom::geography))::int AS meters
       FROM properties origin
       JOIN properties p ON p.id <> origin.id
       JOIN signals s ON s.property_id = p.id
       WHERE origin.id = $1
         AND ST_DWithin(origin.geom::geography, p.geom::geography, 500)
       ORDER BY s.observed_at DESC NULLS LAST
       LIMIT 12`,
      [watch.property_id],
    );
    results.push({
      propertyId: String(watch.property_id),
      address: String(watch.address),
      neighborhood: String(watch.neighborhood),
      borough: String(watch.borough),
      lat: Number(watch.lat),
      lng: Number(watch.lng),
      turnoverScore: Number(watch.turnover_score),
      nearby: nearby.map((row) => ({
        address: String(row.address),
        neighborhood: String(row.neighborhood),
        label: String(row.label),
        evidence: String(row.evidence),
        observedAt: date(row.observed_at),
        provenance: String(row.provenance),
        meters: Number(row.meters),
      })),
    });
  }
  return results;
}

function ownerRadarSnapshot(sessionId: string) {
  const ids = [...(memoryWatches.get(sessionId) ?? [])];
  return ids.map((propertyId) => {
    const detail = snapshotGetStorefront(propertyId, "storefront");
    return {
      propertyId,
      address: detail?.address ?? propertyId,
      neighborhood: detail?.neighborhood ?? "",
      borough: detail?.borough ?? "",
      lat: detail?.lat ?? 0,
      lng: detail?.lng ?? 0,
      turnoverScore: detail?.turnoverScore ?? 0,
      nearby: (detail?.nearby ?? []).slice(0, 6).map((row) => ({
        address: row.name ?? row.category,
        neighborhood: detail?.neighborhood ?? "",
        label: row.category,
        evidence: row.activity ?? "",
        observedAt: null as string | null,
        provenance: "nyc_open_data",
        meters: row.meters,
      })),
    };
  });
}
