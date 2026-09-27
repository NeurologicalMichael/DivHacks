"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { categoryLabel } from "@/lib/catalog";
import { formatDate, formatMeters, formatMoney, titleAddress } from "@/lib/format";
import {
  AREA_HELP,
  METRIC_DEFS,
  SCORE_BREAKDOWN_HELP,
  TIMELINE_HELP,
  WHY_FLAGGED_HELP,
  buildMetricStates,
  enabledTotal,
  type WeightMap,
} from "@/lib/signals";
import { HoverTip } from "./HoverTip";
import type { AdvanceDemand } from "@/lib/plainSummary";
import type { StorefrontDetail } from "@/lib/types";
import { MetricsDonut, ScorePair } from "./MetricsDonut";

const FLAG_SHORT: Record<string, string> = {
  reported_vacant: "Reported vacant",
  dof_sale: "Building sold",
  alteration_permit: "Recent DOB job",
  tenant_activity_changed: "Tenant activity change",
  neighborhood_sales_up: "Sale medians up ≥8%",
  lease_within_6_months: "Lease date near",
  construction_reported: "Construction on filing",
  license_lapsed: "Lapsed DCWP license",
  landlord_opt_in: "Landlord opt-in",
};

const PREVIEW_FLAGS = 3;
const PREVIEW_EVENTS = 2;

function StreetPhoto({ id }: { id: string }) {
  const [state, setState] = useState<"loading" | "ready" | "none" | "unconfigured">("loading");
  const [copyright, setCopyright] = useState("");
  const [date, setDate] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    setState("loading");
    apiFetch(`/api/streetview?id=${encodeURIComponent(id)}`)
      .then((response) => response.json())
      .then((payload: { available?: boolean; reason?: string; copyright?: string; date?: string | null }) => {
        if (cancel) return;
        if (payload.available) {
          setCopyright(payload.copyright || "© Mapillary contributors, CC BY-SA");
          setDate(payload.date ?? null);
          setState("ready");
          return;
        }
        setState(payload.reason === "unconfigured" ? "unconfigured" : "none");
      })
      .catch(() => {
        if (!cancel) setState("none");
      });
    return () => {
      cancel = true;
    };
  }, [id]);

  return (
    <figure className="facade">
      {state === "ready" ? (
        <img src={`/api/streetview/image?id=${encodeURIComponent(id)}`} alt="Street-level photo near this address" />
      ) : (
        <div className="facade-empty">
          {state === "loading"
            ? "Looking up a street photo…"
            : state === "unconfigured"
              ? "Add a free Mapillary token to show a street photo. No credit card."
              : "No nearby street photo is on file for this address."}
        </div>
      )}
      {state === "ready" && (
        <figcaption>
          {copyright}
          {date ? ` · ${date}` : ""}
          {" · sidewalk view, not an interior"}
        </figcaption>
      )}
    </figure>
  );
}

export function DetailPanel({
  detail,
  explanation,
  busy,
  onExplain,
  showAiSummary = true,
  signalWeights,
  demand,
}: {
  detail: StorefrontDetail;
  explanation: { text: string; source: string } | null;
  busy: boolean;
  onExplain: () => void;
  showAiSummary?: boolean;
  signalWeights?: WeightMap;
  demand?: AdvanceDemand;
}) {
  const metrics = useMemo(
    () => buildMetricStates(detail.signals, signalWeights),
    [detail.signals, signalWeights],
  );
  const [showAllFlags, setShowAllFlags] = useState(false);
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [mixOpen, setMixOpen] = useState(true);
  const [areaOpen, setAreaOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [advanceText, setAdvanceText] = useState("");
  const [advanceBusy, setAdvanceBusy] = useState(false);
  const advanceTicket = useRef(0);

  useEffect(() => {
    setShowAllFlags(false);
    setShowFullHistory(false);
    setMixOpen(true);
    setAreaOpen(false);
    setDetailsOpen(false);
    setAdvanceOpen(false);
    setAdvanceText("");
    advanceTicket.current += 1;
  }, [detail.id]);

  async function openAdvance() {
    setAdvanceOpen(true);
    if (advanceText || advanceBusy) return;
    const ticket = ++advanceTicket.current;
    setAdvanceBusy(true);
    try {
      const response = await apiFetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: detail.id,
          category: demand?.category ?? detail.fitCategory,
          advance: true,
          demand,
        }),
      });
      const payload = await response.json();
      if (ticket !== advanceTicket.current) return;
      if (!response.ok) throw new Error(payload.error || "Analysis failed");
      setAdvanceText(payload.text);
    } catch (caught) {
      if (ticket !== advanceTicket.current) return;
      setAdvanceText(caught instanceof Error ? caught.message : "Analysis failed");
    } finally {
      if (ticket === advanceTicket.current) setAdvanceBusy(false);
    }
  }

  // Load the summary as soon as a storefront is selected.
  useEffect(() => {
    if (!showAiSummary || explanation || busy) return;
    onExplain();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.id, showAiSummary]);

  const turnover = enabledTotal(metrics);
  const flagged = useMemo(() => {
    const enabled = metrics.filter((m) => m.enabled && m.found).sort((a, b) => b.weight - a.weight);
    return enabled;
  }, [metrics]);
  const visibleFlags = showAllFlags ? flagged : flagged.slice(0, PREVIEW_FLAGS);

  const buildingEvents = detail.timeline;
  const area = detail.area;
  const areaEvents = useMemo(() => {
    if (!area) return [];
    const rows: { when: string; title: string; source: string; kind: "area" }[] = [];
    for (const trend of area.salesTrend) {
      rows.push({
        when: String(trend.year),
        title: `Commercial sale median ${formatMoney(trend.medianPrice)} (${trend.sales} sales)`,
        source: "DOF Rolling Sales · neighborhood",
        kind: "area",
      });
    }
    for (const trend of area.filingTrend) {
      rows.push({
        when: trend.year,
        title: `${trend.vacantFilings} vacant / ${trend.filings} loaded filings`,
        source: "Storefront Registry · sample",
        kind: "area",
      });
    }
    return rows;
  }, [area]);

  const historyPreview = showFullHistory
    ? buildingEvents
    : buildingEvents.slice(0, PREVIEW_EVENTS);

  const fitName = categoryLabel(detail.fitCategory);
  const title = titleAddress(detail.address);

  return (
    <div className="detail">
      <header className="detail-head">
        <h2>{title}</h2>
        <p className="index-note">Indexes are derived from public filings below…</p>
        <p className="sub">
          {detail.neighborhood} · {detail.borough}
        </p>
        <StreetPhoto id={detail.id} />
      </header>

      <ScorePair turnover={turnover} fit={detail.fitScore} fitCategory={fitName} />

      {showAiSummary && (
        <section className="ai-block">
          <div className="ai-head">
            <span className="ai-star" aria-hidden="true">
              ✦
            </span>
            <strong>Summary</strong>
          </div>
          {explanation ? (
            <p className="summary-text">{explanation.text}</p>
          ) : (
            <p className="muted">{busy ? "Reading the records…" : "Preparing a summary…"}</p>
          )}
          {explanation && (
            <button
              type="button"
              className={advanceOpen ? "advance-link is-open" : "advance-link"}
              onClick={() => void openAdvance()}
            >
              Advance Analysis
            </button>
          )}
          {advanceOpen && (
            <p className="advance-text">{advanceBusy ? "Comparing this filing with your search…" : advanceText}</p>
          )}
        </section>
      )}

      {!mixOpen ? (
        <button type="button" className="more-btn block" onClick={() => setMixOpen(true)}>
          How the score breaks down ▾
        </button>
      ) : (
        <div className="panel-card">
          <header className="section-head">
            <h3>
              <HoverTip tip={SCORE_BREAKDOWN_HELP}>Score breakdown</HoverTip>
            </h3>
            <button type="button" className="text-btn" onClick={() => setMixOpen(false)}>
              Hide ▴
            </button>
          </header>
          <p className="scoring-lead">
            These public-record signals add up to <strong>{turnover}</strong> Store Score points.
          </p>
          <MetricsDonut metrics={metrics} />
        </div>
      )}

      <section className="panel-card">
        <header className="section-head">
          <h3>
            <HoverTip tip={WHY_FLAGGED_HELP}>Why it was flagged</HoverTip>
          </h3>
          <span>{flagged.length} signal{flagged.length === 1 ? "" : "s"}</span>
        </header>
        {flagged.length === 0 && <p className="empty">No Store Score signals for this storefront.</p>}
        <ul className="flag-list">
          {visibleFlags.map((flag) => (
            <li key={flag.id}>
              <span>{FLAG_SHORT[flag.id] ?? METRIC_DEFS.find((d) => d.id === flag.id)?.label ?? flag.id}</span>
              <span className="flag-weight is-positive">+{flag.weight}</span>
            </li>
          ))}
        </ul>
        {flagged.length > PREVIEW_FLAGS && (
          <button type="button" className="more-btn" onClick={() => setShowAllFlags((v) => !v)}>
            {showAllFlags ? "Show fewer" : `Show all ${flagged.length} signals`} ▾
          </button>
        )}
      </section>

      <section className="panel-card">
        <header className="section-head">
          <h3>
            <HoverTip tip={TIMELINE_HELP}>Timeline</HoverTip>
          </h3>
          <span>Since {oldestYear(buildingEvents, areaEvents)}</span>
        </header>
        <p className="section-sub">This building</p>
        <ol className="timeline-list">
          {historyPreview.map((event) => (
            <li key={event.title + event.occurredAt + (event.subjectDate ?? "")}>
                  <time dateTime={event.occurredAt}>{formatDate(event.occurredAt)}</time>
                  <div>
                    <strong>{event.title}</strong>
                    {event.subjectDate && event.subjectDate !== event.occurredAt && (
                      <span className="sub">
                        {/license/i.test(event.title)
                          ? "Expiration on file"
                          : /lease/i.test(event.title)
                            ? "Lease end on file"
                            : "Reported date on file"}
                        : {formatDate(event.subjectDate)}
                      </span>
                    )}
                    <span className="sub">{event.source}</span>
                  </div>
                </li>
              ))}
              {buildingEvents.length === 0 && <li className="empty">No dated events on this building.</li>}
            </ol>
            {buildingEvents.length > PREVIEW_EVENTS && (
              <button type="button" className="more-btn" onClick={() => setShowFullHistory((v) => !v)}>
                {showFullHistory ? "Show less history" : "Show full history"} ▾
              </button>
            )}

            <p className="section-sub" style={{ marginTop: 16 }}>
              Surrounding area · {detail.neighborhood}
            </p>
            {!areaOpen ? (
              <button type="button" className="more-btn" onClick={() => setAreaOpen(true)}>
                Show area history ▾
              </button>
            ) : (
              <>
                {area && (
                  <p className="evidence">
                    Reporting year {area.reportingYear}: {area.vacant.toLocaleString()} vacant filings out of{" "}
                    {area.storefronts.toLocaleString()}
                    {area.vacancyRate != null ? ` (${Math.round(area.vacancyRate * 1000) / 10}%)` : ""}.
                  </p>
                )}
                <ol className="timeline-list">
                  {areaEvents.map((event) => (
                    <li key={event.when + event.title}>
                      <time dateTime={String(event.when)}>{formatDate(String(event.when))}</time>
                  <div>
                    <strong>{event.title}</strong>
                    <span className="sub">{event.source}</span>
                  </div>
                </li>
              ))}
              {areaEvents.length === 0 && <li className="empty">No area trend rows loaded.</li>}
            </ol>
            <button type="button" className="more-btn" onClick={() => setAreaOpen(false)}>
              Hide area history ▴
            </button>
          </>
        )}
      </section>

      <section className="panel-card">
        <header className="section-head">
          <h3>
            <HoverTip tip={AREA_HELP}>More about this area</HoverTip>
          </h3>
          <span>Transit &amp; businesses</span>
        </header>
        <button type="button" className="dropdown-btn" onClick={() => setDetailsOpen((v) => !v)}>
          Transit, businesses, trends {detailsOpen ? "▴" : "▾"}
        </button>
        {detailsOpen && (
          <div className="area-more">
            <p className="section-sub">Transit</p>
            {detail.transit.length === 0 && <p className="empty">No MTA station within 900 m.</p>}
            {detail.transit.map((station) => (
              <div className="row-line" key={station.name}>
                <strong>{station.name}</strong>
                <span className="sub">
                  {station.routes ?? "Routes not listed"} · {formatMeters(station.meters)}
                </span>
              </div>
            ))}
            <p className="section-sub">Nearby businesses</p>
            {detail.nearby.slice(0, 6).map((business) => (
              <div className="row-line" key={`${business.name}-${business.meters}`}>
                <strong>{business.name ? titleAddress(business.name) : business.category}</strong>
                <span className="sub">{formatMeters(business.meters)}</span>
              </div>
            ))}
            {detail.fitBreakdown.length > 0 && (
              <>
                <p className="section-sub">{fitName} fit pieces</p>
                {detail.fitBreakdown.map((item) => (
                  <div className="row-line" key={item.label}>
                    <span>{item.label}</span>
                    <span className="flag-weight is-positive">+{item.points}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function oldestYear(
  building: { occurredAt: string }[],
  area: { when: string }[],
) {
  const years = [
    ...building.map((e) => Number(e.occurredAt?.slice(0, 4))).filter((n) => n > 1900),
    ...area.map((e) => Number(e.when)).filter((n) => n > 1900),
  ];
  if (!years.length) return "—";
  return String(Math.min(...years));
}
