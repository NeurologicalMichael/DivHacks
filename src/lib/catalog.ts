export const NEIGHBORHOODS = [
  "Williamsburg",
  "Greenpoint",
  "Bushwick",
  "Park Slope",
  "Carroll Gardens",
  "DUMBO",
  "Brooklyn Heights",
  "Fort Greene",
  "Clinton Hill",
  "Bed-Stuy",
  "Crown Heights",
  "Prospect Heights",
  "Astoria",
  "Long Island City",
  "Chinatown",
  "SoHo",
  "Sunnyside",
  "Woodside",
];

export const BOROUGHS = ["Brooklyn", "Manhattan", "Queens", "Bronx", "Staten Island"];

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
  Sunnyside: "Queens",
  Woodside: "Queens",
  Chinatown: "Manhattan",
  SoHo: "Manhattan",
};

export const CATEGORIES = [
  { id: "restaurant", label: "Restaurant", patterns: [/restaurant/, /cafe/, /coffee/, /\bbar\b/, /food/] },
  { id: "retail", label: "Retail", patterns: [/retail/, /shop/, /boutique/, /storefront/] },
  { id: "grocery", label: "Grocery", patterns: [/grocery/, /bodega/, /supermarket/] },
  { id: "fitness", label: "Fitness", patterns: [/fitness/, /\bgym\b/, /yoga/] },
  { id: "personal_services", label: "Personal services", patterns: [/salon/, /beauty/, /barber/] },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export function categoryLabel(id: string | null | undefined) {
  return CATEGORIES.find((category) => category.id === id)?.label ?? "Storefront";
}

/** True when a property NTA/neighborhood matches a selected catalog label (prefix-safe). */
export function neighborhoodMatches(actual: string, selected: string): boolean {
  const a = actual.trim().toLowerCase();
  const s = selected.trim().toLowerCase();
  if (!a || !s) return false;
  if (a === s) return true;
  if (a.startsWith(`${s}-`) || a.startsWith(`${s} (`) || a.startsWith(`${s} `)) return true;
  const head = a.split(/[-/(]/)[0]?.trim() ?? a;
  return head === s;
}

export function matchesAnyNeighborhood(actual: string, selected: string[]): boolean {
  return selected.some((name) => neighborhoodMatches(actual, name));
}

/**
 * Place filter:
 * - boroughs only → borough must match
 * - neighborhoods only → neighborhood must match (fuzzy)
 * - both → property matches if its neighborhood matches a selection OR its borough is selected
 *   (union of selected places). Neighborhood labels that belong to an unselected borough
 *   still match via the neighborhood branch.
 */
export function matchesPlaceFilter(
  borough: string,
  neighborhood: string,
  boroughs: string[],
  neighborhoods: string[],
): boolean {
  const boroughHit =
    boroughs.length > 0 && boroughs.some((item) => item.toLowerCase() === borough.toLowerCase());
  const neighborhoodHit = neighborhoods.length > 0 && matchesAnyNeighborhood(neighborhood, neighborhoods);
  if (boroughs.length && neighborhoods.length) return boroughHit || neighborhoodHit;
  if (boroughs.length) return boroughHit;
  if (neighborhoods.length) return neighborhoodHit;
  return true;
}
