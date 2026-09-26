"use client";

import { categoryLabel } from "@/lib/catalog";
import { formatDate, formatMeters, formatMoney, provenanceLabel, titleAddress } from "@/lib/format";
import type { StorefrontDetail } from "@/lib/types";

function Ring({ value, label, hot }: { value: number; label: string; hot?: boolean }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.max(0, Math.min(100, value)) / 100) * circumference;
  return (
    <div className={`ring${hot ? " hot" : ""}`}>
      <svg viewBox="0 0 72 72" aria-hidden="true">
        <circle className="track" cx="36" cy="36" r={radius} />
        <circle className="value" cx="36" cy="36" r={radius} strokeDasharray={circumference} strokeDashoffset={offset} />
        <text x="36" y="41" textAnchor="middle">{value}</text>
      </svg>
      <span>{label}</span>
    </div>
  );
}

export function DetailPanel({
  detail,
  explanation,
  busy,
  onBack,
  onExplain,
  onGap,
  onWatch,
  onLandlord,
}: {
  detail: StorefrontDetail;
  explanation: { text: string; source: string } | null;
  busy: boolean;
  onBack: () => void;
  onExplain: () => void;
  onGap: () => void;
  onWatch: () => void;
  onLandlord: () => void;
}) {
  const neighborhood = detail.area;
  return (
    <div>
      <button className="back" onClick={onBack}>Back to results</button>
      <h2 className="address">{titleAddress(detail.address)}</h2>
      <div className="sub">{detail.neighborhood} · {detail.borough} · BBL {detail.bbl}</div>
      <p className="avail">{detail.availability.label}</p>
      <p className="disclaimer">{detail.availability.disclaimer}</p>
      {detail.reportingYearNum != null && detail.reportingYearNum < 2024 && (
        <p className="disclaimer">Latest registry filing in this extract: {detail.reportingYear}.</p>
      )}

      <div className="ring-row">
        <Ring value={detail.turnoverScore} label="Turnover index" hot={detail.turnoverScore >= 55} />
        <Ring value={detail.fitScore} label={`${categoryLabel(detail.fitCategory)} fit`} />
      </div>
      <p className="disclaimer">Both numbers are indexes derived from the records below. They are not probabilities and they are not a listing.</p>

      <div className="kicker">Why it was flagged</div>
      {explanation ? (
        <div className="summary-note" style={{ margin: 0 }}>
          <strong>{explanation.source === "gemini" ? "Gemini summary of these records" : "Summary of these records"}.</strong>{" "}
          {explanation.text}
        </div>
      ) : (
        <button className="ghost" onClick={onExplain} disabled={busy}>{busy ? "Reading the records…" : "Summarize the evidence"}</button>
      )}
      {detail.signals.length === 0 && <p className="empty">No turnover signals are stored for this storefront.</p>}
      {detail.signals.map((signal) => (
        <div key={signal.label + signal.evidence.slice(0, 24)}>
          <div className="bar">
            <span>{signal.label}</span>
            <span className={signal.provenance === "demo_landlord_opt_in" ? "tag-demo" : signal.provenance === "derived" ? "tag-derived" : "tag-city"}>
              +{signal.weight} · {provenanceLabel(signal.provenance)}
            </span>
          </div>
          <p className="evidence">{signal.evidence}</p>
          <p className="disclaimer">{signal.source}{signal.observedAt ? ` · ${formatDate(signal.observedAt)}` : ""}</p>
        </div>
      ))}

      <div className="kicker">{categoryLabel(detail.fitCategory)} fit, piece by piece</div>
      {detail.fitBreakdown.map((item) => (
        <div key={item.label}>
          <div className="bar">
            <span>{item.label}</span>
            <span>+{item.points}</span>
            <i><b style={{ width: `${Math.min(100, item.points * 4)}%` }} /></i>
          </div>
          <p className="evidence">{item.evidence} {item.source}.</p>
        </div>
      ))}

      <div className="kicker">Lot facts</div>
      <div className="fact-grid">
        <div className="fact"><b>{detail.activity ?? "Not reported"}</b><span>Latest filed activity</span></div>
        <div className="fact"><b>{detail.buildingClass ?? "Not matched"}</b><span>PLUTO building class</span></div>
        <div className="fact"><b>{detail.zoning ?? "Not matched"}</b><span>Zoning district</span></div>
        <div className="fact"><b>{detail.retailArea != null ? `${Math.round(detail.retailArea).toLocaleString()} sf` : "Not matched"}</b><span>Retail area on the lot</span></div>
        <div className="fact"><b>{detail.yearBuilt ?? "Not matched"}</b><span>Year built</span></div>
        <div className="fact"><b>{formatMoney(detail.assessedTotal)}</b><span>Assessed total, not a sale price</span></div>
      </div>
      <p className="disclaimer">{detail.plutoMatched ? "PLUTO fields describe the tax lot, which can contain more than this storefront." : "PLUTO did not match this BBL, so building facts were left blank."} Source: {detail.sourceDataset}.</p>

      <div className="kicker">Nearby transit</div>
      {detail.transit.length === 0 && <p className="empty">No MTA station in the station file within 900 meters.</p>}
      {detail.transit.map((station) => (
        <div className="block" key={station.name}>
          <strong>{station.name}</strong>
          <div className="sub">{station.routes ?? "Routes not listed"} · {formatMeters(station.meters)} · {station.ada ? "ADA listed" : "ADA not listed as 1 or 2"}</div>
        </div>
      ))}
      <p className="disclaimer">Station locations are from the MTA station file. Ridership volume is not joined.</p>
      {detail.pedestrian && (
        <>
          <div className="kicker">Historical pedestrian count</div>
          <div className="block">
            <strong>{detail.pedestrian.count.toLocaleString()} people</strong>
            <div className="sub">{detail.pedestrian.countLabel} · {detail.pedestrian.location} · {formatMeters(detail.pedestrian.meters)} away</div>
            <p className="disclaimer">{detail.pedestrian.source}. This is the latest count stored for that screenline, not a current foot-traffic estimate.</p>
          </div>
        </>
      )}

      <div className="kicker">Nearby businesses in the loaded sample</div>
      {detail.nearby.length === 0 && <p className="empty">No loaded business falls within 400 meters.</p>}
      {detail.nearby.map((business) => (
        <div className="row" key={`${business.name}-${business.meters}`} style={{ marginBottom: 6 }}>
          <div>
            <strong>{business.name ? titleAddress(business.name) : business.category}</strong>
            <div className="sub">{business.activity} · {business.source}</div>
          </div>
          <span className="sub">{formatMeters(business.meters)}</span>
        </div>
      ))}

      {neighborhood && (
        <>
          <div className="kicker">Neighborhood context</div>
          <p className="evidence">
            In reporting year {neighborhood.reportingYear}, {neighborhood.name} has {neighborhood.vacant.toLocaleString()} vacant filings out of {neighborhood.storefronts.toLocaleString()} ({neighborhood.vacancyRate != null ? `${Math.round(neighborhood.vacancyRate * 1000) / 10}%` : "rate unavailable"}).
            {neighborhood.vacancyRate2023 != null ? ` The 2023 vacancy rate in the same registry was ${Math.round(neighborhood.vacancyRate2023 * 1000) / 10}%.` : ""}
          </p>
          {neighborhood.restaurantCount != null && (
            <p className="evidence">{neighborhood.restaurantCount.toLocaleString()} DOHMH restaurants sit in the 800 meter comparison box. {neighborhood.restaurantNote}</p>
          )}
          {neighborhood.salesTrend.length > 0 && (
            <div>
              {neighborhood.salesTrend.map((trend) => (
                <div className="bar" key={trend.year}>
                  <span>{trend.year} commercial sale median</span>
                  <span>{formatMoney(trend.medianPrice)} · {trend.sales} sales</span>
                </div>
              ))}
              <p className="disclaimer">{neighborhood.salesTrend[0]?.source}</p>
            </div>
          )}
          {neighborhood.filingTrend.length > 0 && (
            <>
              <p className="disclaimer">Filing years below are only the storefronts loaded on the map, aggregated with Tiger Data time_bucket. They are not the full neighborhood census above.</p>
              {neighborhood.filingTrend.map((trend) => (
                <div className="bar" key={trend.year}>
                  <span>{trend.year} loaded filings</span>
                  <span>{trend.vacantFilings} vacant / {trend.filings}</span>
                </div>
              ))}
            </>
          )}
        </>
      )}

      <div className="kicker">Timeline</div>
      <div className="timeline">
        {detail.timeline.map((event) => (
          <article key={event.title + event.occurredAt + event.detail.slice(0, 20)}>
            <div className="sub">{formatDate(event.occurredAt)} · {provenanceLabel(event.provenance)}</div>
            <h3>{event.title}</h3>
            <p className="evidence">{event.detail}</p>
            <div className="sub">{event.source}</div>
          </article>
        ))}
      </div>

      <div className="actions">
        <button className="primary" onClick={onGap}>What should open here?</button>
        <button className="ghost" onClick={onWatch}>Watch privately</button>
      </div>
      <div className="actions">
        <button className="ghost" onClick={onLandlord}>This is my space</button>
      </div>
    </div>
  );
}
