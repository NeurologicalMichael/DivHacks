export function titleAddress(value: string) {
  return value
    .toLowerCase()
    .replace(/\b([a-z0-9]+)\b/g, (word) => {
      if (word === "of" || word === "and") return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    });
}

export function formatDate(value?: string | null) {
  if (!value) return "Date not on file";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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
