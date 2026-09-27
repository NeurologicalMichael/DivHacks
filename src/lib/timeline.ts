import { toIsoDate } from "./format";

/** Normalize timeline events so dates reflect when they were reported, not subject dates. */

export type TimelineEvent = {
  occurredAt: string;
  title: string;
  detail: string;
  source: string;
  provenance: string;
  /** Subject date when different from when the event was filed/reported (e.g. lease end, license expiration). */
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

/** App "today" for clamping — ISO calendar date in local time. */
export function timelineToday() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function notAfterToday(iso: string | null | undefined, today = timelineToday()) {
  if (!iso) return null;
  return iso <= today ? iso : null;
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
 * Lease / sale / license rows sometimes stored the subject date (lease end, license
 * expiration) in occurred_at — including far-future dates like 2027–2038.
 * Re-anchor those to when the record was filed/issued and keep the subject date separate.
 */
export function normalizeTimelineEvent(event: RawEvent, today = timelineToday()): TimelineEvent | null {
  const type = str(event.event_type);
  const payload = payloadOf(event);
  const title = str(event.title) || "Event";
  const detail = str(event.detail);
  const source = str(event.source) || "Record";
  const provenance = str(event.provenance) || "nyc_open_data";
  const rawWhen = dateOnly(event.occurred_at ?? event.occurredAt);

  if (type === "lease_date_on_file" || /lease expiration/i.test(title)) {
    const lease =
      dateOnly(payload.lease_expiration) ??
      (/lease expiration/i.test(title) && rawWhen && rawWhen > today ? rawWhen : null) ??
      (/lease expiration/i.test(title) ? rawWhen : null);
    const filed =
      notAfterToday(filingAsOf(payload.reporting_year), today) ??
      notAfterToday(
        rawWhen && rawWhen.endsWith("-12-31") ? rawWhen : null,
        today,
      ) ??
      notAfterToday(filingAsOf(detail.match(/The (\d{4}) filing/)?.[1]), today) ??
      notAfterToday(rawWhen && rawWhen <= today ? rawWhen : null, today);
    if (!filed) return null;
    const subject = lease && lease !== filed ? lease : null;
    return {
      occurredAt: filed,
      title: lease || subject ? "Lease expiration on file" : title,
      detail:
        detail ||
        (lease
          ? `Owner-reported expir_dt_of_most_recent_lease is ${lease}. This is not a confirmed listing.`
          : "Lease date reported on a storefront filing."),
      source,
      provenance,
      subjectDate: subject,
    };
  }

  if (type === "registry_sale_date") {
    const sold = dateOnly(payload.sold_date) ?? notAfterToday(rawWhen, today);
    const filed =
      notAfterToday(filingAsOf(payload.reporting_year), today) ??
      notAfterToday(rawWhen, today);
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
      dateOnly(detail.match(/Expiration on file (\d{4}-\d{2}-\d{2})/i)?.[1]) ??
      // Legacy loads used expiration as occurred_at with a thin payload.
      (rawWhen && rawWhen > today ? rawWhen : null);
    const created =
      dateOnly(payload.created_date) ??
      dateOnly(detail.match(/Issued (\d{4}-\d{2}-\d{2})/i)?.[1]) ??
      null;
    const rawIsExpiration = Boolean(expiration && rawWhen === expiration);
    const occurredAt =
      notAfterToday(created, today) ??
      (!rawIsExpiration ? notAfterToday(rawWhen, today) : null);
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
  const occurredAt = notAfterToday(rawWhen, today);
  if (!occurredAt) {
    // Unknown future-dated event: keep as subject note only if we have no better anchor.
    return null;
  }
  return {
    occurredAt,
    title,
    detail,
    source,
    provenance,
    subjectDate: null,
  };
}

export function normalizeTimeline(events: RawEvent[], today = timelineToday()): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  const seen = new Set<string>();
  for (const event of events) {
    const normalized = normalizeTimelineEvent(event, today);
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
  today = timelineToday(),
): TimelineEvent[] {
  const hasDobOn = new Set(
    timeline
      .filter((e) => /dob/i.test(e.source) || /dob/i.test(e.title))
      .map((e) => e.occurredAt),
  );
  const extra: TimelineEvent[] = [];
  for (const permit of permits) {
    const when = notAfterToday(dateOnly(permit.filing_date), today);
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
