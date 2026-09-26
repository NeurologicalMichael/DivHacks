import { BOROUGHS, NEIGHBORHOODS, categoryLabel } from "./catalog";
import type { SearchFilters, Summary } from "./types";

export const PROFILE_KEY = "leaselens-renter-profile";
export const PROFILE_SKIP_KEY = "leaselens-onboarding-skipped";

export const NEIGHBORHOOD_BOROUGH: Record<string, string> = {
  Williamsburg: "Brooklyn",
  Greenpoint: "Brooklyn",
  Bushwick: "Brooklyn",
  "Park Slope": "Brooklyn",
  "Carroll Gardens": "Brooklyn",
  DUMBO: "Brooklyn",
  "Brooklyn Heights": "Brooklyn",
  "Fort Greene": "Brooklyn",
  "Clinton Hill": "Brooklyn",
  "Bed-Stuy": "Brooklyn",
  "Crown Heights": "Brooklyn",
  "Prospect Heights": "Brooklyn",
  Astoria: "Queens",
  "Long Island City": "Queens",
  Chinatown: "Manhattan",
  SoHo: "Manhattan",
};

export type LeaseKind = "commercial" | "residential" | "both";
export type CommercialUse =
  | "restaurant"
  | "retail"
  | "grocery"
  | "fitness"
  | "personal_services"
  | "office"
  | "medical"
  | "industrial"
  | "other";
export type BudgetBand =
  | "c1"
  | "c2"
  | "c3"
  | "c4"
  | "c5"
  | "r1"
  | "r2"
  | "r3"
  | "r4"
  | "r5"
  | "unsure";
export type SizeBand = "under_800" | "800_1500" | "1500_3000" | "over_3000" | "unsure";
export type Timing = "now" | "6" | "12" | "browsing";
export type Beds = "studio" | "1" | "2" | "3" | "4plus";
export type Household = "solo" | "couple" | "family" | "roommates";
export type Pets = "none" | "cat" | "dog" | "other";

export type RenterProfile = {
  version: 1;
  leaseKind: LeaseKind | null;
  use: CommercialUse | null;
  concept: string;
  beds: Beds | null;
  household: Household | null;
  pets: Pets | null;
  budget: BudgetBand | null;
  homeBudget: BudgetBand | null;
  size: SizeBand | null;
  timing: Timing | null;
  boroughs: string[];
  neighborhoods: string[];
  nearSubway: boolean | null;
  mustHaves: string[];
  savedAt: string;
};

export const LEASE_KINDS: { id: LeaseKind; label: string; hint: string }[] = [
  { id: "commercial", label: "Commercial", hint: "Storefront, office, or other business space" },
  { id: "residential", label: "Residential", hint: "A home" },
  { id: "both", label: "Both", hint: "A business space and a home" },
];

export const COMMERCIAL_USES: { id: CommercialUse; label: string }[] = [
  { id: "restaurant", label: "Restaurant or bar" },
  { id: "retail", label: "Retail" },
  { id: "grocery", label: "Grocery" },
  { id: "fitness", label: "Fitness" },
  { id: "personal_services", label: "Salon or personal services" },
  { id: "office", label: "Office" },
  { id: "medical", label: "Medical or clinic" },
  { id: "industrial", label: "Warehouse or industrial" },
  { id: "other", label: "Other business" },
];

export const COMMERCIAL_BUDGETS: { id: BudgetBand; label: string }[] = [
  { id: "c1", label: "Under $5,000 / mo" },
  { id: "c2", label: "$5,000–$10,000" },
  { id: "c3", label: "$10,000–$20,000" },
  { id: "c4", label: "$20,000–$40,000" },
  { id: "c5", label: "Over $40,000" },
  { id: "unsure", label: "Not sure yet" },
];

export const HOME_BUDGETS: { id: BudgetBand; label: string }[] = [
  { id: "r1", label: "Under $2,500 / mo" },
  { id: "r2", label: "$2,500–$4,000" },
  { id: "r3", label: "$4,000–$6,000" },
  { id: "r4", label: "$6,000–$10,000" },
  { id: "r5", label: "Over $10,000" },
  { id: "unsure", label: "Not sure yet" },
];

export const SIZE_BANDS: { id: SizeBand; label: string; min: number | null; max: number | null }[] = [
  { id: "under_800", label: "Under 800 sq ft", min: 0, max: 800 },
  { id: "800_1500", label: "800–1,500 sq ft", min: 800, max: 1500 },
  { id: "1500_3000", label: "1,500–3,000 sq ft", min: 1500, max: 3000 },
  { id: "over_3000", label: "Over 3,000 sq ft", min: 3000, max: null },
  { id: "unsure", label: "Not sure yet", min: null, max: null },
];

export const TIMINGS: { id: Timing; label: string; months: number | null }[] = [
  { id: "now", label: "As soon as possible", months: 3 },
  { id: "6", label: "Within 6 months", months: 6 },
  { id: "12", label: "Within 12 months", months: 12 },
  { id: "browsing", label: "Just looking", months: null },
];

export const BEDS: { id: Beds; label: string }[] = [
  { id: "studio", label: "Studio" },
  { id: "1", label: "1 bed" },
  { id: "2", label: "2 beds" },
  { id: "3", label: "3 beds" },
  { id: "4plus", label: "4+ beds" },
];

export const HOUSEHOLDS: { id: Household; label: string }[] = [
  { id: "solo", label: "Just me" },
  { id: "couple", label: "Couple" },
  { id: "family", label: "Family" },
  { id: "roommates", label: "Roommates" },
];

export const PETS: { id: Pets; label: string }[] = [
  { id: "none", label: "No pets" },
  { id: "cat", label: "Cat" },
  { id: "dog", label: "Dog" },
  { id: "other", label: "Other pet" },
];

export const COMMERCIAL_MUSTS = [
  { id: "foot_traffic", label: "Foot traffic matters" },
  { id: "vented_kitchen", label: "Vented kitchen" },
  { id: "outdoor", label: "Outdoor space" },
  { id: "loading", label: "Loading or parking" },
];

export const HOME_MUSTS = [
  { id: "laundry", label: "Laundry in the building" },
  { id: "elevator", label: "Elevator" },
  { id: "outdoor_home", label: "Outdoor space" },
  { id: "pets_ok", label: "Pet friendly" },
];

const FIT_USES = new Set(["restaurant", "retail", "grocery", "fitness", "personal_services"]);

export function emptyDraft(): RenterProfile {
  return {
    version: 1,
    leaseKind: null,
    use: null,
    concept: "",
    beds: null,
    household: null,
    pets: null,
    budget: null,
    homeBudget: null,
    size: null,
    timing: null,
    boroughs: [],
    neighborhoods: [],
    nearSubway: null,
    mustHaves: [],
    savedAt: "",
  };
}

export function wantsCommercial(profile: Pick<RenterProfile, "leaseKind">) {
  return profile.leaseKind === "commercial" || profile.leaseKind === "both";
}

export function wantsHome(profile: Pick<RenterProfile, "leaseKind">) {
  return profile.leaseKind === "residential" || profile.leaseKind === "both";
}

export function loadProfile(): RenterProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RenterProfile;
    if (parsed?.version !== 1 || !parsed.leaseKind) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveProfile(profile: RenterProfile) {
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export type ProfileUse = "filter" | "compare" | "context";

export type ProfilePriority = {
  rank: number;
  field: string;
  value: string;
  use: ProfileUse;
};

export type ProfileBrief = {
  version: 1;
  leaseKind: string;
  concept: string | null;
  priorities: ProfilePriority[];
};

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

const MUST_IDS = new Set([...COMMERCIAL_MUSTS, ...HOME_MUSTS].map((item) => item.id));

export function normalizeProfile(input: unknown): RenterProfile | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const leaseKind = oneOf(raw.leaseKind, ["commercial", "residential", "both"] as const);
  if (!leaseKind) return null;
  const boroughs = stringList(raw.boroughs).filter((borough) => BOROUGHS.includes(borough));
  if (!boroughs.length) return null;
  const allowedNeighborhoods = new Set<string>(neighborhoodsFor(boroughs));
  const draft: RenterProfile = {
    version: 1,
    leaseKind,
    use: oneOf(raw.use, COMMERCIAL_USES.map((item) => item.id)),
    concept: typeof raw.concept === "string" ? raw.concept.trim().slice(0, 80) : "",
    beds: oneOf(raw.beds, BEDS.map((item) => item.id)),
    household: oneOf(raw.household, HOUSEHOLDS.map((item) => item.id)),
    pets: oneOf(raw.pets, PETS.map((item) => item.id)),
    budget: oneOf(raw.budget, [...COMMERCIAL_BUDGETS, ...HOME_BUDGETS].map((item) => item.id)),
    homeBudget: oneOf(raw.homeBudget, HOME_BUDGETS.map((item) => item.id)),
    size: oneOf(raw.size, SIZE_BANDS.map((item) => item.id)),
    timing: oneOf(raw.timing, TIMINGS.map((item) => item.id)),
    boroughs,
    neighborhoods: stringList(raw.neighborhoods).filter((name) => allowedNeighborhoods.has(name)),
    nearSubway: typeof raw.nearSubway === "boolean" ? raw.nearSubway : null,
    mustHaves: stringList(raw.mustHaves).filter((id) => MUST_IDS.has(id)),
    savedAt: new Date().toISOString(),
  };
  if (!wantsCommercial(draft)) {
    draft.use = null;
    draft.size = null;
    draft.concept = "";
  }
  if (!wantsHome(draft)) {
    draft.beds = null;
    draft.household = null;
    draft.pets = null;
    draft.homeBudget = null;
  }
  if (leaseKind !== "both") draft.homeBudget = null;
  if (wantsCommercial(draft) && !draft.use) return null;
  if (wantsHome(draft) && !draft.beds) return null;
  if (!draft.timing) return null;
  if (wantsCommercial(draft) && !draft.budget) return null;
  if (leaseKind === "residential" && !draft.budget) return null;
  if (leaseKind === "both" && !draft.homeBudget) return null;
  return draft;
}

export function profileBrief(profile: RenterProfile): ProfileBrief {
  const rows: Omit<ProfilePriority, "rank">[] = [];
  const push = (field: string, value: string | null | undefined, use: ProfileUse) => {
    if (!value) return;
    rows.push({ field, value, use });
  };
  push("lease", labelOf(LEASE_KINDS, profile.leaseKind), "context");
  if (wantsCommercial(profile)) {
    push("business use", labelOf(COMMERCIAL_USES, profile.use), profile.use && FIT_USES.has(profile.use) ? "filter" : "context");
  }
  if (wantsHome(profile)) push("bedrooms", labelOf(BEDS, profile.beds), "context");
  push("neighborhoods", profile.neighborhoods.join(", "), profile.neighborhoods.length ? "filter" : "context");
  push("boroughs", profile.boroughs.join(", "), "filter");
  const timing = TIMINGS.find((item) => item.id === profile.timing);
  push(
    "timing",
    timing ? (timing.months ? `${timing.label} (${timing.months} months)` : timing.label) : null,
    timing?.months ? "filter" : "context",
  );
  if (profile.nearSubway === true) push("subway", "Near a subway", "filter");
  else if (profile.nearSubway === false) push("subway", "No subway preference", "context");
  if (profile.size && profile.size !== "unsure") push("size", labelOf(SIZE_BANDS, profile.size), "compare");
  const businessBudgets = profile.leaseKind === "residential" ? HOME_BUDGETS : COMMERCIAL_BUDGETS;
  if (profile.budget && profile.budget !== "unsure") push("budget", labelOf(businessBudgets, profile.budget), "context");
  if (profile.homeBudget && profile.homeBudget !== "unsure") push("home budget", labelOf(HOME_BUDGETS, profile.homeBudget), "context");
  push("household", labelOf(HOUSEHOLDS, profile.household), "context");
  push("pets", labelOf(PETS, profile.pets), "context");
  push("concept", profile.concept.trim(), "context");
  const musts = [...COMMERCIAL_MUSTS, ...HOME_MUSTS].filter((item) => profile.mustHaves.includes(item.id)).map((item) => item.label);
  push("must-haves", musts.join(", "), "context");
  return {
    version: 1,
    leaseKind: profile.leaseKind ?? "",
    concept: profile.concept.trim() || null,
    priorities: rows.map((row, index) => ({ rank: index + 1, ...row })),
  };
}

export function sortByProfile<T extends Summary>(profile: RenterProfile, results: T[]) {
  return [...results].sort((a, b) => profileRank(profile, b) - profileRank(profile, a));
}

export function applySuggestedOrder<T extends { id: string }>(fallback: T[], order: string[]) {
  const byId = new Map(fallback.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const ordered: T[] = [];
  for (const id of order) {
    const item = byId.get(id);
    if (!item || seen.has(id)) continue;
    seen.add(id);
    ordered.push(item);
  }
  for (const item of fallback) {
    if (!seen.has(item.id)) ordered.push(item);
  }
  return ordered;
}

export function stepError(profile: RenterProfile, step: number): string {
  if (step === 0 && !profile.leaseKind) return "Choose what you are leasing.";
  if (step === 1) {
    if (wantsCommercial(profile) && !profile.use) return "Choose the kind of business space.";
    if (wantsHome(profile) && !profile.beds) return "Choose how many bedrooms you need.";
  }
  if (step === 2) {
    if (wantsCommercial(profile) && !profile.budget) return "Choose a rent range, or Not sure yet.";
    if (wantsHome(profile) && !(profile.leaseKind === "both" ? profile.homeBudget : profile.budget)) {
      return "Choose a rent range, or Not sure yet.";
    }
    if (!profile.timing) return "Choose when you need the space.";
  }
  if (step === 3 && profile.boroughs.length === 0) return "Choose at least one borough.";
  return "";
}

function labelOf<T extends string>(options: { id: T; label: string }[], id: T | null | undefined) {
  return options.find((option) => option.id === id)?.label ?? "";
}

export function profileToFilters(profile: RenterProfile): SearchFilters {
  const use = wantsCommercial(profile) && profile.use && FIT_USES.has(profile.use) ? profile.use : null;
  const timing = TIMINGS.find((item) => item.id === profile.timing);
  return {
    boroughs: profile.boroughs.filter((borough) => BOROUGHS.includes(borough)),
    neighborhoods: profile.neighborhoods.filter((name) => NEIGHBORHOODS.includes(name as (typeof NEIGHBORHOODS)[number])),
    category: use,
    months: timing?.months ?? null,
    minTurnover: 0,
    vacantOnly: false,
    nearSubway: profile.nearSubway === true,
    multiSignal: false,
    landlordOnly: false,
    address: null,
  };
}

export function profileSentence(profile: RenterProfile): string {
  const filters = profileToFilters(profile);
  const place = filters.neighborhoods.length
    ? filters.neighborhoods.join(", ")
    : filters.boroughs.join(", ");
  const use = filters.category ? categoryLabel(filters.category).toLowerCase() : "storefront";
  const when = filters.months ? ` that may become available in the next ${filters.months} months` : "";
  const transit = filters.nearSubway ? " near a subway" : "";
  if (profile.leaseKind === "residential") {
    return `Storefront filings in ${place}${when}${transit}`;
  }
  return `${use} storefronts in ${place}${when}${transit}`;
}

export function profileHeadline(profile: RenterProfile): string {
  const parts: string[] = [];
  if (wantsCommercial(profile) && profile.use) parts.push(labelOf(COMMERCIAL_USES, profile.use));
  if (wantsHome(profile) && profile.beds) parts.push(labelOf(BEDS, profile.beds));
  if (profile.neighborhoods.length) parts.push(profile.neighborhoods.join(", "));
  else if (profile.boroughs.length) parts.push(profile.boroughs.join(", "));
  const timing = labelOf(TIMINGS, profile.timing);
  if (timing) parts.push(timing.toLowerCase());
  if (profile.nearSubway) parts.push("near subway");
  return parts.join(" · ");
}

export function profileLimits(profile: RenterProfile): string {
  const saved = [...COMMERCIAL_MUSTS, ...HOME_MUSTS]
    .filter((item) => profile.mustHaves.includes(item.id))
    .map((item) => item.label.toLowerCase());
  const extra = saved.length ? ` Saved preferences: ${saved.join(", ")}.` : "";
  if (profile.leaseKind === "residential") {
    return `Bedrooms, household, pets, and budget stay on this profile. The map is commercial storefront filings, not apartments. Results use your boroughs, neighborhoods, timing, and subway choice only.${extra}`;
  }
  const size = "Size is compared only when PLUTO has a retail area.";
  const budget = "Rent is not in these filings, so budget does not remove a result.";
  if (profile.leaseKind === "both") {
    return `Business matches come first. Home details are saved and are not in these filings. ${budget} ${size}${extra}`;
  }
  const unmapped = profile.use && !FIT_USES.has(profile.use)
    ? " This use has no separate fit index yet, so results are storefronts in your area."
    : "";
  return `${budget} ${size}${unmapped}${extra}`;
}

function sizeFits(band: SizeBand | null, area: number | null): "in" | "out" | "unknown" | "skip" {
  if (!band || band === "unsure") return "skip";
  if (area == null) return "unknown";
  const spec = SIZE_BANDS.find((item) => item.id === band);
  if (!spec) return "skip";
  if (spec.min != null && area < spec.min) return "out";
  if (spec.max != null && area > spec.max) return "out";
  return "in";
}

export function profileNotes(profile: RenterProfile, result: Summary): string[] {
  const notes: string[] = [];
  if (profile.neighborhoods.includes(result.neighborhood)) notes.push(`In ${result.neighborhood}, a neighborhood you chose`);
  else if (profile.boroughs.includes(result.borough)) notes.push(`In ${result.borough}`);
  if (profile.leaseKind === "residential") notes.push("Commercial filing, not a home listing");
  if (wantsCommercial(profile) && profile.size && profile.size !== "unsure") {
    const fit = sizeFits(profile.size, result.retailArea);
    if (fit === "in" && result.retailArea != null) notes.push(`Retail area ${Math.round(result.retailArea).toLocaleString()} sq ft is inside your size`);
    if (fit === "out" && result.retailArea != null) notes.push(`Retail area ${Math.round(result.retailArea).toLocaleString()} sq ft is outside your size`);
    if (fit === "unknown") notes.push("Retail area is not on this filing");
  }
  return notes;
}

export function profileRank(profile: RenterProfile, result: Summary): number {
  let score = result.fitScore / 5 + result.turnoverScore / 10;
  if (profile.neighborhoods.includes(result.neighborhood)) score += 40;
  else if (profile.boroughs.includes(result.borough)) score += 15;
  const fit = sizeFits(profile.size, result.retailArea);
  if (fit === "in") score += 25;
  if (fit === "out") score -= 20;
  return score;
}

export function neighborhoodsFor(boroughs: string[]) {
  return NEIGHBORHOODS.filter((name) => boroughs.length === 0 || boroughs.includes(NEIGHBORHOOD_BOROUGH[name] ?? ""));
}
