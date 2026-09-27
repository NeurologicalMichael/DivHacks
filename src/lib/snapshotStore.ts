import fs from "node:fs";
import path from "node:path";
import { availabilityFor } from "./availability";
import { toIsoDate } from "./format";
import { mergePermitEvents, normalizeTimeline } from "./timeline";
import type { BreakdownItem, Gap, SearchFilters, Signal, StorefrontDetail, Summary } from "./types";

type Prop = Record<string, unknown>;
type Snapshot = {
  meta?: { counts?: Record<string, number>; app_as_of?: string };
  properties: Prop[];
  events: Prop[];
  businesses: Prop[];
  stations: Prop[];
  pedestrians: Prop[];
  permits: Prop[];
  sales: Prop[];
  licenses: Prop[];
  neighborhoods: Prop[];
  sales_trends: Prop[];
};

let cache: Snapshot | null = null;
let cacheMtime = 0;

function loadSnapshot(): Snapshot {
  const file = path.join(process.cwd(), "data", "snapshot.json");
  const mtime = fs.statSync(file).mtimeMs;
  if (cache && cacheMtime === mtime) return cache;
  cache = JSON.parse(fs.readFileSync(file, "utf8")) as Snapshot;
  cacheMtime = mtime;
  return cache;
}

function num(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function str(value: unknown) {
  return value == null ? "" : String(value);
}

function dateStr(value: unknown) {
  return toIsoDate(value);
}

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function daysFromToday(iso: string | null) {
  if (!iso) return null;
  const t = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  return Math.round((t - Date.now()) / 86400000);
}

function buildSignals(property: Prop, snap: Snapshot): Signal[] {
  const id = str(property.id);
  const signals: Signal[] = [];
  const vacant1231 = Boolean(property.vacant_on_1231);
  const vacant630 = Boolean(property.vacant_on_630);
  if (vacant1231 || vacant630) {
    signals.push({
      label: "Reported vacant",
      weight: vacant1231 && vacant630 ? 44 : 36,
      evidence: `Storefront Registry reporting year ${property.reporting_year}. Vacant on Dec 31: ${vacant1231 ? "YES" : "NO"}. Vacant on Jun 30 or date sold: ${vacant630 ? "YES" : "NO"}.`,
      source: "NYC Storefront Registry (Local Law 157)",
      observedAt: dateStr(property.as_of),
      provenance: "nyc_open_data",
    });
  }

  const lease = dateStr(property.lease_expiration);
  const leaseDays = daysFromToday(lease);
  if (lease && leaseDays != null && leaseDays >= -180 && leaseDays <= 365) {
    const near = leaseDays >= -120 && leaseDays <= 180;
    signals.push({
      label: "Lease date on file",
      weight: near ? 28 : 14,
      evidence: `The latest storefront filing includes expir_dt_of_most_recent_lease = ${lease}.`,
      source: "NYC Storefront Registry",
      observedAt: dateStr(property.as_of) ?? lease,
      provenance: "nyc_open_data",
    });
  }

  const sold = dateStr(property.sold_date);
  const sale = snap.sales
    .filter((row) => str(row.property_id) === id || str(row.bbl) === str(property.bbl))
    .sort((a, b) => str(b.sale_date).localeCompare(str(a.sale_date)))[0];
  if (sale && num(sale.sale_price) != null && (num(sale.sale_price) ?? 0) >= 100000) {
    signals.push({
      label: "Building sold on a DOF filing",
      weight: 18,
      evidence: `DOF Rolling Calendar Sales records a sale on ${sale.sale_date} for $${Number(sale.sale_price).toLocaleString()}.`,
      source: str(sale.source) || "DOF Rolling Calendar Sales",
      observedAt: dateStr(sale.sale_date),
      provenance: "nyc_open_data",
    });
  } else if (sold) {
    const soldDays = daysFromToday(sold);
    if (soldDays != null && soldDays >= -730) {
      signals.push({
        label: "Sale date on the storefront filing",
        weight: 16,
        evidence: `The ${property.reporting_year} storefront filing includes sold_date ${sold}.`,
        source: "NYC Storefront Registry",
        observedAt: sold,
        provenance: "nyc_open_data",
      });
    }
  }

  if (property.construction_reported) {
    signals.push({
      label: "Construction reported on the filing",
      weight: 8,
      evidence: `The ${property.reporting_year} storefront filing has construction_reported = YES.`,
      source: "NYC Storefront Registry",
      observedAt: dateStr(property.as_of),
      provenance: "nyc_open_data",
    });
  }

  const permit = snap.permits
    .filter((row) => str(row.property_id) === id)
    .sort((a, b) => str(b.filing_date).localeCompare(str(a.filing_date)))[0];
  if (permit) {
    const filedDays = daysFromToday(dateStr(permit.filing_date));
    // Only treat filings in the last ~3 years as a turnover signal.
    // Match SQL refresh_signals: only filings in the last 18 months.
    if (filedDays != null && filedDays >= -548) {
      const desc = str(permit.description).toLowerCase();
      const job = str(permit.job_type).toLowerCase();
      let weight = 14;
      let label = "Recent DOB job filing";
      if (job.includes("demol")) weight = 16;
      else if (desc.includes("sidewalk shed") || desc.includes("scaffold")) {
        weight = 5;
        label = "Recent sidewalk shed or scaffold filing";
      } else if (job.includes("new building")) weight = 12;
      signals.push({
        label,
        weight,
        evidence: `DOB NOW job ${permit.job_number} (${permit.job_type}) was filed ${permit.filing_date}. Status: ${permit.status}.`,
        source: str(permit.source) || "DOB NOW",
        observedAt: dateStr(permit.filing_date),
        provenance: "nyc_open_data",
      });
    }
  }

  const license = snap.licenses
    .filter((row) => str(row.property_id) === id || str(row.bbl) === str(property.bbl))
    .sort((a, b) => str(b.expiration_date).localeCompare(str(a.expiration_date)))[0];
  if (license) {
    const exp = dateStr(license.expiration_date);
    const days = daysFromToday(exp);
    const status = str(license.status).toLowerCase();
    if (exp && days != null && days >= -540 && days <= 0 && status !== "active") {
      signals.push({
        label: "DCWP license expiration on file",
        weight: 12,
        evidence: `${license.business_name ?? "A licensed business"} shows status ${license.status} and expiration ${exp}.`,
        source: str(license.source) || "DCWP",
        observedAt: exp,
        provenance: "nyc_open_data",
      });
    }
  }

  if (property.churn_detail) {
    signals.push({
      label: "Historical activity changed",
      weight: 10,
      evidence: str(property.churn_detail),
      source: "NYC Storefront Registry filings for this address",
      observedAt: dateStr(property.as_of),
      provenance: "derived",
    });
  }

  const trends = snap.sales_trends
    .filter((row) => str(row.neighborhood).toLowerCase() === str(property.neighborhood).toLowerCase())
    .sort((a, b) => Number(b.year) - Number(a.year));
  if (trends.length >= 2) {
    const [latest, prior] = trends;
    const late = num(latest.median_price) ?? 0;
    const early = num(prior.median_price) ?? 0;
    if (early > 0 && late >= early * 1.08 && (num(latest.sales) ?? 0) >= 8) {
      signals.push({
        label: "Nearby commercial sale prices are higher",
        weight: 6,
        evidence: `DOF commercial sale median in ${property.neighborhood} rose from $${early.toLocaleString()} (${prior.year}) to $${late.toLocaleString()} (${latest.year}).`,
        source: str(latest.source) || "DOF Rolling Calendar Sales",
        observedAt: `${latest.year}-01-01`,
        provenance: "derived",
      });
    }
  }

  return signals.sort((a, b) => b.weight - a.weight);
}

function fitComponents(property: Prop, category: string, snap: Snapshot): BreakdownItem[] {
  const items: BreakdownItem[] = [
    {
      label: "Registered storefront",
      points: 20,
      evidence: "This row is a storefront filing in the NYC Storefront Registry.",
      source: "NYC Storefront Registry",
    },
  ];
  const activity = str(property.activity_category);
  let usePoints = 4;
  if ((category === "restaurant" || category === "cafe" || category === "food") && activity === "food_and_drink") usePoints = 18;
  else if ((category === "restaurant" || category === "cafe" || category === "food") && activity === "grocery") usePoints = 12;
  else if ((category === "restaurant" || category === "cafe" || category === "food") && activity === "retail") usePoints = 10;
  else if (category === "retail" && activity === "retail") usePoints = 18;
  else if (category === "grocery" && ["grocery", "food_and_drink", "retail"].includes(activity)) usePoints = 16;
  else if (category === "fitness" && ["fitness", "retail", "vacant_or_unidentified"].includes(activity)) usePoints = 14;
  else if (category === "personal_services" && ["personal_services", "retail"].includes(activity)) usePoints = 16;
  else if (activity === "vacant_or_unidentified") usePoints = 6;
  else if (activity === "retail") usePoints = 8;
  items.push({
    label: "Latest filed use",
    points: usePoints,
    evidence: `Latest filing activity is "${property.primary_activity ?? "not reported"}" (mapped to ${activity || "n/a"}).`,
    source: "NYC Storefront Registry",
  });

  const lat = Number(property.lat);
  const lng = Number(property.lng);
  let subwayM: number | null = null;
  for (const station of snap.stations) {
    const meters = haversineMeters(lat, lng, Number(station.lat), Number(station.lng));
    if (meters <= 1200 && (subwayM == null || meters < subwayM)) subwayM = meters;
  }
  const subwayPoints = subwayM == null ? 0 : subwayM <= 400 ? 16 : subwayM <= 800 ? 10 : 4;
  items.push({
    label: "Subway access",
    points: subwayPoints,
    evidence: subwayM == null ? "No MTA station within 1.2 km." : `Nearest station is about ${Math.round(subwayM)} meters away.`,
    source: "MTA Subway Stations",
  });

  const building = str(property.building_class);
  let classPoints = 3;
  if (!building) classPoints = 0;
  else if (building.toUpperCase().startsWith("K")) classPoints = 14;
  else if (building.toUpperCase().startsWith("S")) classPoints = 10;
  else if (/^[CDL]/i.test(building)) classPoints = 8;
  items.push({
    label: "Building class",
    points: classPoints,
    evidence: property.pluto_matched ? `PLUTO building class ${building || "blank"}.` : "PLUTO did not match this BBL.",
    source: "PLUTO",
  });

  const retail = num(property.retail_area);
  items.push({
    label: "Retail floor area",
    points: retail == null ? 0 : retail >= 400 ? 10 : retail > 0 ? 6 : 0,
    evidence: retail == null ? "Retail area blank." : `PLUTO retail area ${Math.round(retail).toLocaleString()} sq ft.`,
    source: "PLUTO",
  });

  const zoning = str(property.zoning);
  items.push({
    label: "Zoning district",
    points: !zoning ? 0 : /^[CM]/i.test(zoning) ? 8 : 2,
    evidence: zoning ? `PLUTO zoning district is ${zoning}.` : "Zoning not available.",
    source: "PLUTO",
  });

  const vacant = Boolean(property.vacant_on_1231) || Boolean(property.vacant_on_630);
  const leaseDays = daysFromToday(dateStr(property.lease_expiration));
  const available =
    vacant || (leaseDays != null && leaseDays >= -180 && leaseDays <= 365);
  items.push({
    label: "Availability evidence",
    points: available ? 8 : 0,
    evidence: "Points only when vacancy or an in-window lease date is on file.",
    source: "Derived from stored signals",
  });

  return items;
}

function toSummary(property: Prop, category: string, snap: Snapshot): Summary {
  const signals = buildSignals(property, snap);
  const components = fitComponents(property, category, snap);
  const vacant = Boolean(property.vacant_on_1231) || Boolean(property.vacant_on_630);
  const turnoverScore = Math.min(100, signals.reduce((sum, s) => sum + s.weight, 0));
  const fitScore = Math.min(100, components.reduce((sum, item) => sum + item.points, 0));
  return {
    id: str(property.id),
    address: str(property.address),
    borough: str(property.borough),
    neighborhood: str(property.neighborhood),
    zip: property.zip ? str(property.zip) : null,
    lat: Number(property.lat),
    lng: Number(property.lng),
    bbl: str(property.bbl),
    activity: property.primary_activity ? str(property.primary_activity) : null,
    activityCategory: property.activity_category ? str(property.activity_category) : null,
    reportingYear: property.reporting_year ? str(property.reporting_year) : null,
    reportingYearNum: num(property.reporting_year_num),
    asOf: dateStr(property.as_of),
    vacant,
    leaseExpiration: dateStr(property.lease_expiration),
    turnoverScore,
    fitScore,
    fitCategory: category,
    retailArea: num(property.retail_area),
    signalCount: signals.length,
    hasDemoLandlord: false,
    hasLandlordOptIn: false,
    availability: availabilityFor({
      vacant,
      reportingYear: property.reporting_year ? str(property.reporting_year) : null,
      reportingYearNum: num(property.reporting_year_num),
      asOf: dateStr(property.as_of),
      leaseExpiration: dateStr(property.lease_expiration),
      hasDemoLandlord: false,
      hasLandlordOptIn: false,
      landlordWindow: null,
    }),
    topSignals: signals.slice(0, 3).map((s) => ({
      label: s.label,
      provenance: s.provenance,
      weight: s.weight,
    })),
  };
}

export function snapshotHealth() {
  const snap = loadSnapshot();
  return {
    properties: snap.properties.length,
    signals: snap.properties.reduce((n, p) => n + buildSignals(p, snap).length, 0),
    businesses: snap.businesses.length,
    timescaledb: "snapshot",
    postgis: "haversine-fallback",
    hypertables: 0,
    multi_signal: snap.properties.filter((p) => buildSignals(p, snap).length >= 2).length,
    mode: "snapshot" as const,
    asOf: str(snap.meta?.app_as_of) || null,
  };
}

export function snapshotSearch(filters: SearchFilters): Summary[] {
  const snap = loadSnapshot();
  const category = filters.category ?? "storefront";
  const fitFloor = filters.category ? 40 : 0;
  let rows = snap.properties.map((p) => toSummary(p, category, snap));

  if (filters.boroughs.length && filters.neighborhoods.length) {
    const boroughs = new Set(filters.boroughs.map((b) => b.toLowerCase()));
    const neighborhoods = new Set(filters.neighborhoods.map((n) => n.toLowerCase()));
    rows = rows.filter(
      (r) => boroughs.has(r.borough.toLowerCase()) || neighborhoods.has(r.neighborhood.toLowerCase()),
    );
  } else if (filters.boroughs.length) {
    const set = new Set(filters.boroughs.map((b) => b.toLowerCase()));
    rows = rows.filter((r) => set.has(r.borough.toLowerCase()));
  } else if (filters.neighborhoods.length) {
    const set = new Set(filters.neighborhoods.map((n) => n.toLowerCase()));
    rows = rows.filter((r) => set.has(r.neighborhood.toLowerCase()));
  }
  if (filters.minTurnover > 0) rows = rows.filter((r) => r.turnoverScore >= filters.minTurnover);
  if (filters.vacantOnly) rows = rows.filter((r) => r.vacant);
  if (filters.multiSignal) rows = rows.filter((r) => r.signalCount >= 2);
  if (filters.address) {
    const needle = filters.address.toLowerCase();
    rows = rows.filter((r) => r.address.toLowerCase().includes(needle));
  }
  if (filters.nearSubway) {
    rows = rows.filter((r) =>
      snap.stations.some(
        (s) => haversineMeters(r.lat, r.lng, Number(s.lat), Number(s.lng)) <= 500,
      ),
    );
  }
  if (filters.months != null) {
    const months = filters.months;
    rows = rows.filter((r) => {
      if (r.vacant && (r.reportingYearNum ?? 0) >= 2024) return true;
      if (r.leaseExpiration && (r.reportingYearNum ?? 0) >= 2023) {
        const days = daysFromToday(r.leaseExpiration);
        if (days != null && days >= -120 && days <= months * 30) return true;
      }
      return false;
    });
  }

  return rows
    .filter((r) => r.fitScore >= fitFloor)
    .sort((a, b) => b.fitScore - a.fitScore || b.turnoverScore - a.turnoverScore)
    .slice(0, 70);
}

export function snapshotGetStorefront(id: string, category: string | null): StorefrontDetail | null {
  const snap = loadSnapshot();
  const property = snap.properties.find((p) => str(p.id) === id);
  if (!property) return null;
  const cat = category ?? "storefront";
  const summary = toSummary(property, cat, snap);
  const signals = buildSignals(property, snap);
  const components = fitComponents(property, cat, snap);
  const lat = summary.lat;
  const lng = summary.lng;

  const timeline = mergePermitEvents(
    normalizeTimeline(snap.events.filter((e) => str(e.property_id) === id)),
    snap.permits.filter((p) => str(p.property_id) === id).slice(0, 6),
  ).slice(0, 24);

  const transit = snap.stations
    .map((s) => ({
      name: str(s.name),
      routes: s.routes ? str(s.routes) : null,
      meters: Math.round(haversineMeters(lat, lng, Number(s.lat), Number(s.lng))),
      ada: Boolean(s.ada),
    }))
    .filter((s) => s.meters <= 900)
    .sort((a, b) => a.meters - b.meters)
    .slice(0, 4);

  const ped = snap.pedestrians
    .map((c) => ({
      location: str(c.location),
      count: Number(c.count),
      countLabel: str(c.count_label),
      meters: Math.round(haversineMeters(lat, lng, Number(c.lat), Number(c.lng))),
      source: str(c.source),
    }))
    .filter((c) => c.meters <= 700)
    .sort((a, b) => a.meters - b.meters)[0] ?? null;

  const nearby = snap.businesses
    .map((b) => ({
      name: b.name ? str(b.name) : null,
      category: str(b.category),
      activity: b.activity ? str(b.activity) : null,
      meters: Math.round(haversineMeters(lat, lng, Number(b.lat), Number(b.lng))),
      source: str(b.source),
    }))
    .filter((b) => b.meters <= 400)
    .sort((a, b) => a.meters - b.meters)
    .slice(0, 8);

  const stats = snap.neighborhoods.find((n) => str(n.name) === summary.neighborhood);
  const categories = (stats?.categories as Record<string, number> | undefined) ?? {};
  const storefronts = Number(stats?.storefronts ?? 0);
  const retailCount = Number(categories.retail ?? 0);
  const salesTrend = snap.sales_trends
    .filter((t) => str(t.neighborhood) === summary.neighborhood)
    .sort((a, b) => Number(a.year) - Number(b.year))
    .map((t) => ({
      year: Number(t.year),
      sales: Number(t.sales),
      medianPrice: Number(t.median_price),
      source: str(t.source),
    }));

  const filingByYear = new Map<string, { filings: number; vacantFilings: number }>();
  for (const event of snap.events.filter(
    (e) =>
      str(e.event_type) === "storefront_filing" &&
      snap.properties.find((p) => str(p.id) === str(e.property_id) && str(p.neighborhood) === summary.neighborhood),
  )) {
    const year = str(event.occurred_at).slice(0, 4);
    if (!year) continue;
    const row = filingByYear.get(year) ?? { filings: 0, vacantFilings: 0 };
    row.filings += 1;
    if ((event.payload as { vacant?: boolean } | undefined)?.vacant) row.vacantFilings += 1;
    filingByYear.set(year, row);
  }

  return {
    ...summary,
    unit: property.unit ? str(property.unit) : null,
    zoning: property.zoning ? str(property.zoning) : null,
    buildingClass: property.building_class ? str(property.building_class) : null,
    yearBuilt: num(property.year_built),
    retailArea: num(property.retail_area),
    assessedTotal: num(property.assessed_total),
    plutoMatched: Boolean(property.pluto_matched),
    sourceDataset: str(property.source_dataset),
    signals,
    fitBreakdown: components,
    timeline: timeline.slice(0, 24),
    transit,
    pedestrian: ped,
    nearby,
    area: stats
      ? {
          name: str(stats.name),
          reportingYear: str(stats.reporting_year),
          storefronts,
          vacant: Number(stats.vacant ?? 0),
          vacancyRate: num(stats.vacancy_rate),
          vacancyRate2023: num(stats.vacancy_rate_2023),
          retailCount,
          retailShare: storefronts ? retailCount / storefronts : null,
          restaurantCount: num(stats.restaurant_count),
          restaurantNote: stats.restaurant_note ? str(stats.restaurant_note) : null,
          source: str(stats.source),
          salesTrend,
          filingTrend: [...filingByYear.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([year, row]) => ({ year, filings: row.filings, vacantFilings: row.vacantFilings })),
        }
      : null,
    whyFlagged: signals.map((s) => s.evidence),
  };
}

export function snapshotListNeighborhoods() {
  return loadSnapshot().neighborhoods.map((n) => ({
    name: str(n.name),
    borough: str(n.borough),
    storefronts: Number(n.storefronts ?? 0),
    vacant: Number(n.vacant ?? 0),
    restaurant_count: num(n.restaurant_count),
  }));
}

export function snapshotGapAnalysis(neighborhood: string, nearbyFood: number | null): Gap[] {
  const rows = loadSnapshot().neighborhoods;
  const focus = rows.find((row) => str(row.name) === neighborhood);
  if (!focus) return [];
  const peers = rows.filter((row) => str(row.borough) === str(focus.borough));
  const restaurantCounts = peers
    .map((row) => num(row.restaurant_count))
    .filter((value): value is number => value != null)
    .sort((a, b) => a - b);
  const mid = (values: number[]) =>
    !values.length
      ? 0
      : values.length % 2
        ? values[Math.floor(values.length / 2)]
        : (values[values.length / 2 - 1] + values[values.length / 2]) / 2;

  const gaps: Gap[] = [];
  const localRestaurants = num(focus.restaurant_count);
  const restaurantMedian = mid(restaurantCounts);
  if (localRestaurants != null && restaurantMedian > 0 && localRestaurants < restaurantMedian * 0.72) {
    gaps.push({
      category: "food_and_drink",
      label: "Food and drink",
      localValue: localRestaurants,
      peerMedian: Math.round(restaurantMedian),
      unit: "DOHMH restaurants in an 800 m box",
      evidence: `${neighborhood} has ${localRestaurants} distinct DOHMH restaurant locations in the 800 meter box.`,
      caution:
        nearbyFood != null && nearbyFood >= 12
          ? `The neighborhood box is thinner than those peers, but ${nearbyFood} food businesses still sit nearby.`
          : null,
    });
  }
  return gaps;
}

export function snapshotNearbyCategoryCount(propertyId: string, category: string) {
  const snap = loadSnapshot();
  const property = snap.properties.find((p) => str(p.id) === propertyId);
  if (!property) return 0;
  const lat = Number(property.lat);
  const lng = Number(property.lng);
  return snap.businesses.filter(
    (b) =>
      str(b.category) === category &&
      haversineMeters(lat, lng, Number(b.lat), Number(b.lng)) <= 400,
  ).length;
}
