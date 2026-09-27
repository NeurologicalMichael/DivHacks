export function titleAddress(value: string) {
  return value
    .toLowerCase()
    .replace(/\b([a-z0-9]+)\b/g, (word) => {
      if (word === "of" || word === "and") return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Normalize any date-ish value to YYYY-MM-DD.
 * Avoids `String(date).slice(0, 10)` which becomes "Wed Dec 30" and drops the year.
 */
export function toIsoDate(value?: unknown): string | null {
  if (value == null || value === "") return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d{4}$/.test(raw)) return `${raw}-01-01`;

  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];

  // Postgres / JS Date string: "Wed Dec 30 2023 19:00:00 GMT-0500 (...)"
  const verbose = raw.match(/^(?:[A-Za-z]{3} )?([A-Za-z]{3}) (\d{1,2}) (\d{4})\b/);
  if (verbose) {
    const month = MONTHS.findIndex((m) => m.toLowerCase() === verbose[1].toLowerCase());
    if (month >= 0) {
      return `${verbose[3]}-${String(month + 1).padStart(2, "0")}-${String(Number(verbose[2])).padStart(2, "0")}`;
    }
  }

  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10);

  return null;
}

/** Display date with an explicit year, e.g. "Dec 31, 2023". */
export function formatDate(value?: string | null) {
  if (!value) return "Date not on file";
  const raw = String(value).trim();
  if (/^\d{4}$/.test(raw)) return raw;

  const iso = toIsoDate(raw);
  if (!iso) return raw;
  const [year, month, day] = iso.split("-");
  const monthName = MONTHS[Number(month) - 1];
  if (!monthName || !year || !day) return iso;
  return `${monthName} ${Number(day)}, ${year}`;
}

export function formatMoney(value?: number | null) {
  if (value == null) return "Not on file";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatMeters(meters: number) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function provenanceLabel(provenance: string) {
  switch (provenance) {
    case "nyc_open_data":
      return "City record";
    case "derived":
      return "Derived";
    case "landlord_opt_in":
      return "Landlord opt-in";
    case "demo_landlord_opt_in":
      return "Demo opt-in";
    case "census_acs":
      return "Census";
    default:
      return provenance;
  }
}
