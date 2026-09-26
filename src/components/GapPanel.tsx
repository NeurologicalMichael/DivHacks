"use client";

import type { Gap } from "@/lib/types";

export function GapPanel({
  neighborhoods,
  neighborhood,
  onNeighborhood,
  gaps,
  narrative,
  narrativeSource,
  disclaimer,
  nearbyFood,
}: {
  neighborhoods: { name: string; borough: string }[];
  neighborhood: string;
  onNeighborhood: (name: string) => void;
  gaps: Gap[];
  narrative: string;
  narrativeSource: string;
  disclaimer: string;
  nearbyFood: number | null;
}) {
  return (
    <div className="stack">
      <p className="disclaimer">Gap Finder compares this neighborhood with the other neighborhoods loaded for the same borough. A thinner category is a hypothesis, not proof that a business would succeed.</p>
      <select value={neighborhood} onChange={(event) => onNeighborhood(event.target.value)}>
        {neighborhoods.map((item) => (
          <option key={item.name} value={item.name}>{item.name}</option>
        ))}
      </select>
      <div className="summary-note" style={{ margin: 0 }}>
        <strong>{narrativeSource === "gemini" ? "Gemini, using only these comparisons" : "From the comparisons"}.</strong> {narrative}
      </div>
      {gaps.length === 0 && <p className="empty">No food-density or retail-share gap cleared the threshold against peer neighborhoods.</p>}
      {gaps.map((gap) => (
        <article className="block" key={gap.category}>
          <div className="card-top">
            <strong>{gap.label}</strong>
            <span>{gap.localValue} vs {gap.peerMedian} median</span>
          </div>
          <div className="sub">{gap.unit}</div>
          <p className="evidence">{gap.evidence}</p>
          {gap.caution && <p className="disclaimer">{gap.caution}</p>}
        </article>
      ))}
      {nearbyFood != null && <p className="disclaimer">Loaded food businesses within 400 meters of the selected storefront: {nearbyFood}.</p>}
      <p className="disclaimer">{disclaimer}</p>
    </div>
  );
}
