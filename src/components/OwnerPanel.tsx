"use client";

import { formatDate, formatMeters, provenanceLabel, titleAddress } from "@/lib/format";

export type Watch = {
  propertyId: string;
  address: string;
  neighborhood: string;
  borough: string;
  turnoverScore: number;
  nearby: {
    address: string;
    label: string;
    evidence: string;
    observedAt: string | null;
    provenance: string;
    meters: number;
  }[];
};

export function OwnerPanel({
  watches,
  note,
  onOpen,
  onRemove,
}: {
  watches: Watch[];
  note: string;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div>
      <p className="disclaimer">{note || "Watch a storefront from its detail page. The list stays on this browser session and is not part of the public map."}</p>
      {watches.length === 0 && <p className="empty">No private watches yet. Open a storefront and choose Watch privately.</p>}
      {watches.map((watch) => (
        <article className="block" key={watch.propertyId}>
          <button className="back" onClick={() => onOpen(watch.propertyId)}>{titleAddress(watch.address)}</button>
          <div className="sub">{watch.neighborhood} · turnover index {watch.turnoverScore}</div>
          <div className="kicker">Within 500 meters</div>
          {watch.nearby.length === 0 && <p className="empty">No other loaded signals fall inside 500 meters.</p>}
          {watch.nearby.map((item) => (
            <div key={item.address + item.label} style={{ marginBottom: 8 }}>
              <strong>{titleAddress(item.address)}</strong>
              <div className="sub">{item.label} · {formatMeters(item.meters)} · {provenanceLabel(item.provenance)} · {formatDate(item.observedAt)}</div>
              <p className="evidence">{item.evidence}</p>
            </div>
          ))}
          <button className="ghost" onClick={() => onRemove(watch.propertyId)}>Remove watch</button>
        </article>
      ))}
    </div>
  );
}
