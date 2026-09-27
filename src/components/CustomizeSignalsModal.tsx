"use client";

import { useEffect, useState, type CSSProperties } from "react";
import {
  METRIC_DEFS,
  defaultWeights,
  type MetricId,
  type WeightMap,
} from "@/lib/signals";

export function CustomizeSignalsModal({
  open,
  weights,
  onClose,
  onApply,
}: {
  open: boolean;
  weights: WeightMap;
  onClose: () => void;
  onApply: (next: WeightMap) => void;
}) {
  const [draft, setDraft] = useState<WeightMap>(weights);

  useEffect(() => {
    if (open) setDraft(weights);
  }, [open, weights]);

  if (!open) return null;

  function setWeight(id: MetricId, value: number) {
    const def = METRIC_DEFS.find((item) => item.id === id);
    if (!def) return;
    setDraft((current) => ({
      ...current,
      [id]: Math.max(def.min, Math.min(def.max, Math.round(value))),
    }));
  }

  return (
    <div className="filter-modal" role="dialog" aria-label="Customize signals" onClick={onClose}>
      <div className="filter-sheet signals-sheet" onClick={(event) => event.stopPropagation()}>
        <header className="filter-sheet-head">
          <div>
            <h2>Customize signals</h2>
            <p className="disclaimer" style={{ margin: "4px 0 0" }}>
              These weights apply to every property’s Store Score.
            </p>
          </div>
          <button type="button" className="text-btn" onClick={onClose}>
            Close
          </button>
        </header>

        <ul className="signal-weight-list">
          {METRIC_DEFS.map((metric) => (
            <li key={metric.id}>
              <div className="signal-weight-head">
                <span className="signal-weight-label" title={metric.rationale}>
                  <i className="metric-swatch" style={{ background: metric.color }} />
                  {metric.label}
                </span>
                <strong className="signal-weight-value">{draft[metric.id]}</strong>
              </div>
              <input
                type="range"
                className="signal-weight-slider"
                min={metric.min}
                max={metric.max}
                step={1}
                value={draft[metric.id]}
                aria-label={`${metric.label} weight`}
                title={metric.rationale}
                style={
                  {
                    "--signal-color": metric.color,
                    "--signal-pct": `${((draft[metric.id] - metric.min) / Math.max(1, metric.max - metric.min)) * 100}%`,
                  } as CSSProperties
                }
                onChange={(event) => setWeight(metric.id, Number(event.target.value))}
              />
              <div className="signal-weight-range">
                <span>{metric.min}</span>
                <span>{metric.max}</span>
              </div>
            </li>
          ))}
        </ul>

        <footer className="filter-sheet-foot">
          <button type="button" className="ghost" onClick={() => setDraft(defaultWeights())}>
            Return to default
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            Apply weights
          </button>
        </footer>
      </div>
    </div>
  );
}
