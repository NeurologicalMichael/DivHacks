export type Availability = {
  kind: "reported_vacant" | "lease_on_file" | "landlord_opt_in" | "historical_vacancy" | "no_date";
  label: string;
  disclaimer: string;
};

export type Signal = {
  label: string;
  weight: number;
  evidence: string;
  source: string;
  observedAt: string | null;
  provenance: string;
};

export type BreakdownItem = {
  label: string;
  points: number;
  evidence: string;
  source: string;
};

export type Summary = {
  id: string;
  address: string;
  borough: string;
  neighborhood: string;
  zip: string | null;
  lat: number;
  lng: number;
  bbl: string;
  activity: string | null;
  activityCategory: string | null;
  reportingYear: string | null;
  reportingYearNum: number | null;
  asOf: string | null;
  vacant: boolean;
  leaseExpiration: string | null;
  turnoverScore: number;
  fitScore: number;
  fitCategory: string;
  retailArea: number | null;
  signalCount: number;
  hasDemoLandlord: boolean;
  hasLandlordOptIn: boolean;
  availability: Availability;
  topSignals: { label: string; provenance: string; weight: number }[];
};

export type StorefrontDetail = Summary & {
  unit: string | null;
  zoning: string | null;
  buildingClass: string | null;
  yearBuilt: number | null;
  retailArea: number | null;
  assessedTotal: number | null;
  plutoMatched: boolean;
  sourceDataset: string;
  signals: Signal[];
  fitBreakdown: BreakdownItem[];
  timeline: {
    occurredAt: string;
    title: string;
    detail: string;
    source: string;
    provenance: string;
    subjectDate?: string | null;
  }[];
  transit: { name: string; routes: string | null; meters: number; ada: boolean }[];
  pedestrian: {
    location: string;
    count: number;
    countLabel: string;
    meters: number;
    source: string;
  } | null;
  nearby: {
    name: string | null;
    category: string;
    activity: string | null;
    meters: number;
    source: string;
  }[];
  area: {
    name: string;
    reportingYear: string;
    storefronts: number;
    vacant: number;
    vacancyRate: number | null;
    vacancyRate2023: number | null;
    retailCount: number;
    retailShare: number | null;
    restaurantCount: number | null;
    restaurantNote: string | null;
    source: string;
    salesTrend: { year: number; sales: number; medianPrice: number; source: string }[];
    filingTrend: { year: string; filings: number; vacantFilings: number }[];
  } | null;
  whyFlagged: string[];
};

export type SearchFilters = {
  boroughs: string[];
  neighborhoods: string[];
  category: string | null;
  months: number | null;
  minTurnover: number;
  vacantOnly: boolean;
  nearSubway: boolean;
  multiSignal: boolean;
  landlordOnly: boolean;
  address: string | null;
};

export type Gap = {
  category: string;
  label: string;
  localValue: number;
  peerMedian: number;
  unit: string;
  evidence: string;
  caution: string | null;
};
