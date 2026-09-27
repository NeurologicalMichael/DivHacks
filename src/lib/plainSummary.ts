import type { StorefrontDetail } from "./types";
import { titleAddress } from "./format";

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
