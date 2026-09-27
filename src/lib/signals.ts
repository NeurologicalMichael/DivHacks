/** Catalog of turnover signals. Defaults mirror sql/schema.sql refresh_signals(). */

export type MetricId =
  | "reported_vacant"
  | "dof_sale"
  | "alteration_permit"
  | "tenant_activity_changed"
  | "neighborhood_sales_up"
  | "lease_within_6_months"
  | "construction_reported"
  | "license_lapsed"
  | "landlord_opt_in";

export type MetricDef = {
  id: MetricId;
  label: string;
  defaultWeight: number;
  min: number;
  max: number;
  color: string;
  rationale: string;
  /** Labels / types from the API that map to this metric */
  aliases: string[];
};

export const METRIC_DEFS: MetricDef[] = [
  {
    id: "reported_vacant",
    label: "Reported vacant",
    defaultWeight: 40,
    min: 36,
    max: 44,
    color: "#3B82F6",
    rationale: "A filed vacancy on the Storefront Registry is the strongest public signal the space is empty now.",
    aliases: ["Reported vacant", "reported_vacant"],
  },
  {
    id: "dof_sale",
    label: "DOF / registry sale",
    defaultWeight: 16,
    min: 12,
    max: 20,
    color: "#22C55E",
    rationale: "A recent lot sale often precedes a new tenant or renovation, so it scores as turnover evidence.",
    aliases: ["Building sold on a DOF filing", "Sale date on the storefront filing", "Building sold", "dof_sale", "registry_sold_date"],
  },
  {
    id: "alteration_permit",
    label: "Recent DOB job",
    defaultWeight: 14,
    min: 5,
    max: 16,
    color: "#EF4444",
    rationale: "Alteration or new-building filings suggest the space is being prepared for a different use.",
    aliases: ["Recent DOB job filing", "Recent sidewalk shed or scaffold filing", "alteration_permit"],
  },
  {
    id: "tenant_activity_changed",
    label: "Tenant activity change",
    defaultWeight: 10,
    min: 6,
    max: 14,
    color: "#EC4899",
    rationale: "Activity category shifting across filings is a soft hint the prior tenant has left or changed.",
    aliases: ["Historical activity changed", "Tenant activity change", "tenant_activity_changed"],
  },
  {
    id: "neighborhood_sales_up",
    label: "Neighborhood sale medians up ≥8%",
    defaultWeight: 6,
    min: 4,
    max: 10,
    color: "#84CC16",
    rationale: "Rising commercial sale medians nearby can mean landlords are repositioning space.",
    aliases: ["Nearby commercial sale prices are higher", "neighborhood_sales_up"],
  },
  {
    id: "lease_within_6_months",
    label: "Lease date in near window",
    defaultWeight: 28,
    min: 14,
    max: 28,
    color: "#8B5CF6",
    rationale: "A lease expiration date in the filing near now is evidence the tenancy may turn, not that it is listed.",
    aliases: ["Lease date on file", "lease_within_6_months", "lease_within_12_months"],
  },
  {
    id: "construction_reported",
    label: "Construction on filing",
    defaultWeight: 8,
    min: 4,
    max: 12,
    color: "#F59E0B",
    rationale: "The registry flagged construction on this filing, which often accompanies a forthcoming free-up.",
    aliases: ["Construction reported on the filing", "construction_reported"],
  },
  {
    id: "license_lapsed",
    label: "Lapsed DCWP license",
    defaultWeight: 12,
    min: 8,
    max: 16,
    color: "#06B6D4",
    rationale: "An expired business license on the lot is weak evidence of vacancy, kept lower because the join is by tax lot.",
    aliases: ["DCWP license expiration on file", "license_lapsed"],
  },
  {
    id: "landlord_opt_in",
    label: "Landlord opt-in",
    defaultWeight: 18,
    min: 10,
    max: 22,
    color: "#64748B",
    rationale: "A private early-availability signal from a landlord. Higher weight only because it is intentional, not inferred.",
    aliases: ["Anonymous early-availability signal", "landlord_opt_in"],
  },
];

export function matchMetric(labelOrType: string): MetricDef | undefined {
  const needle = labelOrType.toLowerCase();
  return METRIC_DEFS.find(
    (def) =>
      def.id === needle ||
      def.label.toLowerCase() === needle ||
      def.aliases.some((alias) => alias.toLowerCase() === needle || needle.includes(alias.toLowerCase())),
  );
}

export type MetricState = {
  id: string;
  label?: string;
  enabled: boolean;
  weight: number;
  found: boolean;
  evidence?: string;
  source?: string;
  observedAt?: string | null;
};

export type WeightMap = Record<MetricId, number>;

export function metricLabel(metric: MetricState) {
  if (metric.label) return metric.label;
  return METRIC_DEFS.find((d) => d.id === metric.id)?.label ?? metric.id;
}

export function metricDef(id: string) {
  return METRIC_DEFS.find((d) => d.id === id);
}

export function buildMetricStates(
  signals: { label: string; weight: number; evidence?: string; source?: string; observedAt?: string | null }[],
  weights?: WeightMap,
): MetricState[] {
  const foundById = new Map<MetricId, (typeof signals)[number]>();
  const unmatched: MetricState[] = [];
  for (const signal of signals) {
    const def = matchMetric(signal.label);
    if (def) {
      if (!foundById.has(def.id)) foundById.set(def.id, signal);
      continue;
    }
    unmatched.push({
      id: `extra:${signal.label}`,
      label: signal.label,
      enabled: true,
      weight: signal.weight,
      found: true,
      evidence: signal.evidence,
      source: signal.source,
      observedAt: signal.observedAt,
    });
  }
  const catalog = METRIC_DEFS.map((def) => {
    const found = foundById.get(def.id);
    const custom = weights?.[def.id];
    return {
      id: def.id,
      label: def.label,
      enabled: Boolean(found),
      weight: found ? (custom ?? found.weight ?? def.defaultWeight) : (custom ?? def.defaultWeight),
      found: Boolean(found),
      evidence: found?.evidence,
      source: found?.source,
      observedAt: found?.observedAt,
    };
  });
  return [...catalog, ...unmatched];
}

export function enabledTotal(metrics: MetricState[]) {
  return metrics.filter((m) => m.enabled).reduce((sum, m) => sum + m.weight, 0);
}

export const SIGNAL_WEIGHTS_KEY = "leaselens-signal-weights";

export function defaultWeights(): WeightMap {
  return Object.fromEntries(METRIC_DEFS.map((def) => [def.id, def.defaultWeight])) as WeightMap;
}

export function loadWeights(): WeightMap {
  if (typeof window === "undefined") return defaultWeights();
  try {
    const raw = window.localStorage.getItem(SIGNAL_WEIGHTS_KEY);
    if (!raw) return defaultWeights();
    const parsed = JSON.parse(raw) as Partial<Record<MetricId, number>>;
    const defaults = defaultWeights();
    for (const def of METRIC_DEFS) {
      const value = parsed[def.id];
      if (typeof value === "number" && Number.isFinite(value)) {
        defaults[def.id] = Math.max(def.min, Math.min(def.max, Math.round(value)));
      }
    }
    return defaults;
  } catch {
    return defaultWeights();
  }
}

export function saveWeights(weights: WeightMap) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SIGNAL_WEIGHTS_KEY, JSON.stringify(weights));
}

export function weightsAreDefault(weights: WeightMap) {
  return METRIC_DEFS.every((def) => weights[def.id] === def.defaultWeight);
}

export function scoreMetricIds(metricIds: string[], weights: WeightMap) {
  return metricIds.reduce((sum, id) => {
    const def = metricDef(id);
    if (!def) return sum;
    return sum + (weights[def.id] ?? def.defaultWeight);
  }, 0);
}

export function scoreFromSignals(
  signals: { label: string; weight: number }[],
  weights: WeightMap,
) {
  return signals.reduce((sum, signal) => {
    const def = matchMetric(signal.label);
    if (!def) return sum + signal.weight;
    return sum + (weights[def.id] ?? def.defaultWeight);
  }, 0);
}

/** Adjust a metric weight. Totals may exceed 100. */
export function clampWeightChange(metrics: MetricState[], id: string, nextWeight: number): MetricState[] {
  const current = metrics.find((m) => m.id === id);
  if (!current) return metrics;
  const weight = Math.max(0, Math.round(nextWeight));
  return metrics.map((m) => (m.id === id ? { ...m, weight } : m));
}

export function toggleMetric(metrics: MetricState[], id: string, enabled: boolean): MetricState[] {
  return metrics.map((m) => (m.id === id ? { ...m, enabled } : m));
}

export function fitLabel(score: number) {
  if (score >= 75) return "Strong fit";
  if (score >= 50) return "Moderate fit";
  if (score >= 25) return "Weak fit";
  return "Low fit";
}

export function turnoverLabel(score: number) {
  if (score >= 70) return "Likely to open";
  if (score >= 45) return "Possible opening";
  if (score >= 25) return "Some evidence";
  return "Little evidence";
}

/** User-facing name + hover copy for the composite public-record score. */
export const STORE_SCORE_LABEL = "Store Score";
export const STORE_SCORE_HELP =
  "How strongly public records suggest this storefront may turn over or open soon — vacancy filings, lease dates, licenses, sales, and permits, weighted by your signal settings.";
