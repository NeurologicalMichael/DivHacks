import { CATEGORIES, categoryLabel, matchesAnyNeighborhood } from "./catalog";
import { formatMeters, titleAddress } from "./format";
import type { StorefrontDetail } from "./types";

export type AdvanceDemand = {
  query: string;
  boroughs: string[];
  neighborhoods: string[];
  category: string | null;
  months: number | null;
  nearSubway: boolean;
  vacantOnly: boolean;
  minTurnover: number;
  concept: string;
};

/** Short, plain-language summary for the detail panel (no AI required). */
export function buildPlainSummary(detail: StorefrontDetail): string {
  const place = `${titleAddress(detail.address)} in ${detail.neighborhood}`;
  const top = detail.signals
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((s) => s.label.replace(/\s+on (a |the )?filing$/i, "").replace(/\s+filing$/i, "").trim());

  const why =
    top.length === 0
      ? "No strong turnover signals are on file for this space."
      : top.length === 1
        ? `Main reason it stands out: ${top[0].toLowerCase()}.`
        : `Main reasons it stands out: ${top.slice(0, -1).map((t) => t.toLowerCase()).join(", ")}, and ${top[top.length - 1].toLowerCase()}.`;

  const avail = detail.availability.label.replace(/\.$/, "");
  const year = detail.reportingYear ? ` Latest storefront filing on record: ${detail.reportingYear}.` : "";

  return `${place}. ${why} ${avail}.${year} These scores come from public city records — not a listing or a guarantee the space is available.`;
}

/** Prefer a specific use named in the search sentence over the broad “storefront” match. */
export function demandUse(demand: AdvanceDemand): string | null {
  const text = demand.query.toLowerCase();
  for (const category of CATEGORIES) {
    if (category.id === "retail") continue;
    if (category.patterns.some((pattern) => pattern.test(text))) return category.id;
  }
  return demand.category;
}

function spoken(value: string) {
  return value.trim().toLowerCase().replace(/_/g, " ");
}

function joinClauses(parts: string[]) {
  const clean = parts.filter(Boolean);
  if (clean.length <= 1) return clean[0] ?? "";
  return `${clean.slice(0, -1).join(", ")}, and ${clean[clean.length - 1]}`;
}

function buildingKind(code: string) {
  const letter = code[0]?.toUpperCase();
  if (letter === "K") return "a store building";
  if (letter === "S") return "a building that mixes shops and homes";
  if (letter === "C" || letter === "D") return "a walk-up with a ground-floor space";
  if (letter === "L") return "a loft building";
  return "the building on file";
}

/** Plain reasons behind the fit number, taken only from pieces that scored. */
function fitReasons(detail: StorefrontDetail, useName: string) {
  const reasons: string[] = [];
  const byLabel = new Map(detail.fitBreakdown.map((item) => [item.label, item]));
  const filed = byLabel.get("Latest filed use");
  const activity = detail.activity?.trim() ? spoken(detail.activity) : "";

  if (filed && filed.points > 0) {
    const namesTheUse =
      activity.includes(useName) || (useName === "restaurant" && /food|restaurant/.test(activity));
    if (!activity || detail.activityCategory === "vacant_or_unidentified") {
      reasons.push(`the latest filing does not name a tenant, so a past ${useName} is not on record`);
    } else if (filed.points >= 16 && namesTheUse) {
      reasons.push(`the latest filing says ${activity}, which lines up with a ${useName}`);
    } else if (filed.points >= 10) {
      reasons.push(`the latest filing says ${activity}, which still counts as a close use for a ${useName}`);
    } else {
      reasons.push(`the latest filing says ${activity}, a weaker match for a ${useName}`);
    }
  }

  const station = detail.transit[0];
  const subway = byLabel.get("Subway access");
  if (subway && subway.points > 0 && station) {
    const walk =
      station.meters <= 400 ? "a short walk" : station.meters <= 800 ? "a longer walk" : "farther than a short walk";
    const stationName = /station/i.test(station.name) ? station.name : `the ${station.name} subway station`;
    reasons.push(`${stationName} is about ${Math.round(station.meters)} meters away, ${walk}`);
  }

  const building = byLabel.get("Building class");
  if (building && building.points >= 8 && detail.buildingClass) {
    reasons.push(`it is ${buildingKind(detail.buildingClass)} (class ${detail.buildingClass})`);
  }

  const floor = byLabel.get("Retail floor area");
  if (floor && floor.points > 0 && detail.retailArea) {
    reasons.push(
      `the tax lot lists about ${Math.round(detail.retailArea).toLocaleString("en-US")} square feet of retail space`,
    );
  }

  const zoning = byLabel.get("Zoning district");
  if (zoning && zoning.points >= 8 && detail.zoning) {
    reasons.push(`zoning ${detail.zoning} is a commercial district`);
  }

  if (reasons.length < 2 && (byLabel.get("Registered storefront")?.points ?? 0) > 0) {
    reasons.push("it is a registered ground-floor storefront");
  }

  return reasons.slice(0, 3);
}

function plainSignal(label: string) {
  const text = label.toLowerCase();
  if (text.includes("vacant")) return "the filing says the space was vacant";
  if (text.includes("neighborhood")) return "sale prices in this neighborhood have been rising";
  if (text.includes("sold") || text.includes("sale")) return "the building changed hands in a recorded sale";
  if (text.includes("dob") || text.includes("permit") || text.includes("job")) return "a recent buildings permit is on file";
  if (text.includes("activity")) return "the filed business use changed from one year to the next";
  if (text.includes("lease")) return "a lease date on file falls in the near window";
  if (text.includes("construction")) return "the filing mentions construction";
  if (text.includes("license")) return "a business license here has lapsed";
  if (text.includes("landlord") || text.includes("opt-in") || text.includes("opt in")) return "the owner marked this space as available";
  return "";
}

/** Compare one filing with the search the user already set. No invented facts. */
export function buildAdvanceAnalysis(detail: StorefrontDetail, demand: AdvanceDemand): string {
  const address = titleAddress(detail.address);
  const lines: string[] = [];
  if (demand.query.trim()) lines.push(`Your search was “${demand.query.trim()}”.`);

  const boroughOk =
    !demand.boroughs.length || demand.boroughs.some((borough) => borough.toLowerCase() === detail.borough.toLowerCase());
  const neighborhoodOk =
    !demand.neighborhoods.length || matchesAnyNeighborhood(detail.neighborhood, demand.neighborhoods);
  const here = `${detail.neighborhood}, ${detail.borough}`;

  if (boroughOk && neighborhoodOk) {
    lines.push(`This ${address} is perfectly in ${here}.`);
  } else if (boroughOk && demand.neighborhoods.length) {
    lines.push(
      `This ${address} is in ${here}. You asked for ${demand.neighborhoods.join(" or ")}, and this filing is in ${detail.neighborhood}, still in ${detail.borough}.`,
    );
  } else if (boroughOk) {
    lines.push(`This ${address} is in ${here}.`);
  } else {
    const asked = [...demand.neighborhoods, ...demand.boroughs].join(" / ");
    lines.push(`This ${address} is in ${here}, outside ${asked || "the place you asked for"}.`);
  }

  const useId = demandUse(demand);
  const useName = useId ? categoryLabel(useId).toLowerCase() : "";
  const reasons = useName ? fitReasons(detail, useName) : fitReasons(detail, "storefront");
  if (useName && reasons.length) {
    lines.push(`You asked for a ${useName} space. Fit for that use is ${detail.fitScore} because ${joinClauses(reasons)}.`);
  } else if (useName) {
    lines.push(`You asked for a ${useName} space. Fit for that use is ${detail.fitScore}.`);
  } else if (reasons.length) {
    lines.push(`Fit for a storefront is ${detail.fitScore} because ${joinClauses(reasons)}.`);
  }

  if (demand.months) {
    if (detail.vacant) {
      lines.push(
        `You want it within ${demand.months} months. The filing marks the space vacant, so there is a public record it was empty. That is the closest sign it may be open. It is not a for-rent listing.`,
      );
    } else if (detail.leaseExpiration) {
      lines.push(
        `You want it within ${demand.months} months. A lease date on file is ${detail.leaseExpiration}. That date is a filing, not a confirmed move-out.`,
      );
    } else {
      lines.push(
        `You want it within ${demand.months} months. Nothing on this filing shows the space will be empty in that window.`,
      );
    }
  } else if (demand.vacantOnly) {
    lines.push(
      detail.vacant
        ? "You asked for a vacant filing, and this one is marked vacant."
        : "You asked for a vacant filing. This one is not marked vacant.",
    );
  }

  if (demand.nearSubway && detail.transit[0] && !reasons.some((reason) => reason.includes(detail.transit[0].name))) {
    const station = detail.transit[0];
    lines.push(
      `You asked to be near a subway. ${station.name} is about ${formatMeters(station.meters).replace(" m", " meters")} away.`,
    );
  } else if (demand.nearSubway && !detail.transit[0]) {
    lines.push("You asked to be near a subway. No station within range is on file.");
  }

  if (demand.minTurnover > 0) {
    lines.push(
      detail.turnoverScore >= demand.minTurnover
        ? `Store Score is ${detail.turnoverScore}, which clears your minimum of ${demand.minTurnover}.`
        : `Store Score is ${detail.turnoverScore}, under your minimum of ${demand.minTurnover}.`,
    );
  }

  const extras = detail.signals
    .map((signal) => (signal.weight > 0 ? plainSignal(signal.label) : ""))
    .filter((line) => line && !(demand.months && detail.vacant && line.includes("vacant")))
    .slice(0, 2);
  if (extras.length) {
    lines.push(`Other records on this building: ${joinClauses(extras)}.`);
  }

  if (useId === "restaurant") {
    const food = detail.nearby.filter((place) => /food|restaurant/i.test(`${place.category} ${place.activity ?? ""}`));
    if (food.length) {
      const named = food.find((place) => place.name);
      lines.push(
        named
          ? `${food.length} food ${food.length === 1 ? "business is" : "businesses are"} on file within a short walk, including ${named.name}.`
          : `${food.length} food ${food.length === 1 ? "business is" : "businesses are"} on file within a short walk.`,
      );
    }
  }

  if (detail.pedestrian && detail.pedestrian.count > 0) {
    lines.push(
      `A street count nearby recorded ${detail.pedestrian.count.toLocaleString("en-US")} people (${detail.pedestrian.countLabel}).`,
    );
  }

  if (demand.concept.trim()) {
    lines.push(`Your note “${demand.concept.trim()}” is a wish. The filings do not confirm that concept.`);
  }

  if (!demand.months) {
    lines.push("This reads the public filing against your search. It is not a promise the space is for rent.");
  }
  return lines.join(" ");
}
