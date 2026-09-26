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
];

export const BOROUGHS = ["Brooklyn", "Manhattan", "Queens", "Bronx", "Staten Island"];

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
