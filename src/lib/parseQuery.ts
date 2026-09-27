import { BOROUGHS, CATEGORIES, NEIGHBORHOODS } from "./catalog";
import type { SearchFilters } from "./types";

export function emptyFilters(): SearchFilters {
  return {
    boroughs: [],
    neighborhoods: [],
    category: null,
    months: null,
    minTurnover: 0,
    vacantOnly: false,
    nearSubway: false,
    multiSignal: false,
    landlordOnly: false,
    address: null,
  };
}

export function parseQuery(input: string): SearchFilters {
  const filters = emptyFilters();
  const text = input.toLowerCase().replace(/bed stuy/g, "bed-stuy");

  for (const neighborhood of [...NEIGHBORHOODS].sort((a, b) => b.length - a.length)) {
    if (text.includes(neighborhood.toLowerCase())) filters.neighborhoods.push(neighborhood);
  }

  for (const borough of BOROUGHS) {
    const token = borough.toLowerCase();
    if (token === "brooklyn" && filters.neighborhoods.some((name) => name.toLowerCase().includes("brooklyn"))) {
      filters.boroughs.push(borough);
      continue;
    }
    if (text.includes(token)) filters.boroughs.push(borough);
  }

  for (const category of CATEGORIES) {
    if (category.patterns.some((pattern) => pattern.test(text))) {
      filters.category = category.id;
      break;
    }
  }

  const months = text.match(/(\d+)\s*month/);
  if (months) filters.months = Math.min(24, Math.max(1, Number(months[1])));
  if (/next six months|within six months/.test(text)) filters.months = 6;

  filters.vacantOnly = /\bvacant\b/.test(text) && filters.months == null;
  filters.nearSubway = /subway|transit|train/.test(text);
  filters.multiSignal = /multiple signals|several signals/.test(text);
  filters.landlordOnly = /landlord/.test(text);
  if (/high turnover/.test(text)) filters.minTurnover = 50;

  const address = input.match(/\b\d{1,5}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,3}/);
  if (address && !/\bmonths?\b/i.test(address[0]) && !/\bnext\b/i.test(address[0])) {
    filters.address = address[0].replace(/[.,]$/, "");
  }

  return filters;
}

export function describeFilters(filters: SearchFilters, count: number) {
  const parts = [`${count} storefront${count === 1 ? "" : "s"}`];
  if (filters.neighborhoods.length && filters.boroughs.length) {
    parts.push(`in ${filters.boroughs.join(", ")} or ${filters.neighborhoods.join(", ")}`);
  } else if (filters.neighborhoods.length) {
    parts.push(`in ${filters.neighborhoods.join(", ")}`);
  } else if (filters.boroughs.length) {
    parts.push(`in ${filters.boroughs.join(", ")}`);
  }
  if (filters.category) parts.push(`scored for ${filters.category.replaceAll("_", " ")} fit`);
  if (filters.months) {
    parts.push(
      `with vacancy on a 2024 or 2025 filing, a lease date on file inside ${filters.months} months, or a landlord opt-in in that window`,
    );
  } else if (filters.vacantOnly) {
    parts.push("marked vacant on the latest filing");
  }
  if (filters.nearSubway) parts.push("within 500 meters of a subway station");
  if (filters.minTurnover) parts.push(`turnover index at least ${filters.minTurnover}`);
  return `${parts.join(" ")}. Filters describe records already loaded. They are not a forecast.`;
}
