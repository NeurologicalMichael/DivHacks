import { toIsoDate } from "./format";

/** Normalize timeline events so dates reflect when they were reported, not subject dates. */

export type TimelineEvent = {
  occurredAt: string;
  title: string;
  detail: string;
  source: string;
  provenance: string;
  /** Subject date when different from when the event was filed/reported (e.g. lease end). */
  subjectDate?: string | null;
};

type RawEvent = {
  occurred_at?: unknown;
  occurredAt?: unknown;
  event_type?: unknown;
  title?: unknown;
  detail?: unknown;
  source?: unknown;
  provenance?: unknown;
  payload?: unknown;
};

function str(value: unknown) {
  return value == null ? "" : String(value);
}

function dateOnly(value: unknown) {
  return toIsoDate(value);
}

function filingAsOf(reportingYear: unknown) {
  const year = Number(String(reportingYear ?? "").match(/\d{4}/)?.[0] ?? NaN);
  if (!Number.isFinite(year) || year < 1990) return null;
  return `${year}-12-31`;
}

function payloadOf(event: RawEvent) {
  const payload = event.payload;
  if (!payload || typeof payload !== "object") return {} as Record<string, unknown>;
  return payload as Record<string, unknown>;
}

/**
 * Lease / sale-on-filing events historically stored the subject date in occurred_at,
 * which floated far-future lease ends (e.g. 2038) to the top of the timeline.
 * Re-anchor those to the filing as-of date and keep the subject date separate.
 */
export function normalizeTimelineEvent(event: RawEvent): TimelineEvent | null {
  const type = str(event.event_type);
  const payload = payloadOf(event);
  const title = str(event.title) || "Event";
  const detail = str(event.detail);
  const source = str(event.source) || "Record";
  const provenance = str(event.provenance) || "nyc_open_data";
  const rawWhen = dateOnly(event.occurred_at ?? event.occurredAt);

  if (type === "lease_date_on_file" || /lease expiration/i.test(title)) {
    const lease = dateOnly(payload.lease_expiration) ?? (/lease expiration/i.test(title) ? rawWhen : null);
    const filed =
      filingAsOf(payload.reporting_year) ??
      // If occurred_at was already a filing year-end, keep it; else fall back carefully.
      (rawWhen && rawWhen.endsWith("-12-31") && Number(rawWhen.slice(0, 4)) <= new Date().getFullYear() + 1
        ? rawWhen
        : null) ??
      filingAsOf(detail.match(/The (\d{4}) filing/)?.[1]) ??
      rawWhen;
    if (!filed) return null;
    return {
      occurredAt: filed,
      title: lease ? "Lease expiration on file" : title,
      detail:
        detail ||
        (lease
          ? `Owner-reported expir_dt_of_most_recent_lease is ${lease}. This is not a confirmed listing.`
          : "Lease date reported on a storefront filing."),
      source,
      provenance,
      subjectDate: lease && lease !== filed ? lease : null,
    };
  }

  if (type === "registry_sale_date") {
    const sold = dateOnly(payload.sold_date) ?? rawWhen;
    const filed = filingAsOf(payload.reporting_year) ?? rawWhen;
    if (!filed) return null;
    return {
      occurredAt: filed,
      title: "Sale date on storefront filing",
      detail: detail || (sold ? `Filing includes sold_date ${sold}.` : "Sale date on filing."),
      source,
      provenance,
      subjectDate: sold && sold !== filed ? sold : null,
    };
  }

  if (type === "license" || /dcwp license/i.test(title)) {
    const expiration =
      dateOnly(payload.expiration_date) ??
      dateOnly(detail.match(/Expiration on file (\d{4}-\d{2}-\d{2})/)?.[1]) ??
      rawWhen;
    const created =
      dateOnly(payload.created_date) ??
      dateOnly(detail.match(/Issued (\d{4}-\d{2}-\d{2})/)?.[1]) ??
      null;
    const occurredAt =
      created ??
      (rawWhen && Number(rawWhen.slice(0, 4)) <= new Date().getFullYear() + 1 ? rawWhen : null) ??
      expiration;
    if (!occurredAt) return null;
    return {
      occurredAt,
      title,
      detail,
      source,
      provenance,
      subjectDate: expiration && expiration !== occurredAt ? expiration : null,
    };
  }

  if (!rawWhen) return null;
  return {
    occurredAt: rawWhen,
    title,
    detail,
    source,
    provenance,
    subjectDate: null,
  };
}

export function normalizeTimeline(events: RawEvent[]): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  const seen = new Set<string>();
  for (const event of events) {
    const normalized = normalizeTimelineEvent(event);
    if (!normalized) continue;
    const key = `${normalized.occurredAt}|${normalized.title}|${normalized.subjectDate ?? ""}|${normalized.detail.slice(0, 48)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

/** Drop permit rows that duplicate an existing DOB timeline entry on the same day. */
export function mergePermitEvents(
  timeline: TimelineEvent[],
  permits: { filing_date?: unknown; description?: unknown; job_type?: unknown; source?: unknown }[],
): TimelineEvent[] {
  const hasDobOn = new Set(
    timeline
      .filter((e) => /dob/i.test(e.source) || /dob/i.test(e.title))
      .map((e) => e.occurredAt),
  );
  const extra: TimelineEvent[] = [];
  for (const permit of permits) {
    const when = dateOnly(permit.filing_date);
    if (!when || hasDobOn.has(when)) continue;
    extra.push({
      occurredAt: when,
      title: "Alteration permit filed",
      detail: str(permit.description).slice(0, 180),
      source: str(permit.source) || "DOB permits",
      provenance: "nyc_open_data",
    });
    hasDobOn.add(when);
  }
  return [...timeline, ...extra].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}
