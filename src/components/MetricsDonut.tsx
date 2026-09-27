"use client";

import { useId, useState } from "react";
import {
  METRIC_DEFS,
  clampWeightChange,
  enabledTotal,
  fitLabel,
  toggleMetric,
  turnoverLabel,
  type MetricState,
} from "@/lib/signals";

function SemiGauge({
  value,
  label,
  gradient,
}: {
  value: number;
  label: string;
  gradient?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const r = 42;
  const c = 2 * Math.PI * r;
  const half = c / 2;
  const offset = half - (clamped / 100) * half;
  const gradId = useId();
  return (
    <div className="gauge">
      <svg viewBox="0 0 108 68" aria-hidden="true">
        <defs>
          {gradient && (
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#F97316" />
              <stop offset="50%" stopColor="#EAB308" />
              <stop offset="100%" stopColor="#22C55E" />
            </linearGradient>
          )}
        </defs>
        <path
          className="gauge-track"
          d="M 12 58 A 42 42 0 0 1 96 58"
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          className="gauge-value"
          d="M 12 58 A 42 42 0 0 1 96 58"
          fill="none"
          stroke={gradient ? `url(#${gradId})` : "currentColor"}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${half} ${c}`}
          strokeDashoffset={offset}
        />
        <text x="54" y="52" textAnchor="middle" className="gauge-num">
          {Math.round(clamped)}
        </text>
      </svg>
      <span className="gauge-label">{label}</span>
    </div>
  );
}

/** Multi-segment donut of enabled metric weights (total capped at 100). */
export function MetricsDonut({
  metrics,
  onChange,
}: {
  metrics: MetricState[];
  onChange: (next: MetricState[]) => void;
}) {
  const total = enabledTotal(metrics);
  const size = 160;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  let cursor = 0;
  const enabled = metrics.filter((m) => m.enabled && m.weight > 0);

  return (
    <div className="donut-wrap">
      <svg viewBox={`0 0 ${size} ${size}`} className="donut" aria-label={`Turnover score ${total} of 100`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E8E8E8" strokeWidth={stroke} />
        {enabled.map((metric) => {
          const def = METRIC_DEFS.find((d) => d.id === metric.id)!;
          const len = (metric.weight / 100) * circ;
          const dash = `${len} ${circ - len}`;
          const rot = (cursor / 100) * 360 - 90;
          cursor += metric.weight;
          return (
            <circle
              key={metric.id}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={def.color}
              strokeWidth={stroke}
              strokeDasharray={dash}
              strokeLinecap="butt"
              transform={`rotate(${rot} ${size / 2} ${size / 2})`}
            />
          );
        })}
        <text x={size / 2} y={size / 2 - 4} textAnchor="middle" className="donut-num">
          {total}
        </text>
        <text x={size / 2} y={size / 2 + 14} textAnchor="middle" className="donut-sub">
          of 100
        </text>
      </svg>
      <p className="donut-caption">{turnoverLabel(total)}</p>
      {total >= 100 && <p className="donut-warn">Total is at the 100-point cap. Lower a weight or turn a metric off to free room.</p>}
      <ul className="donut-legend">
        {metrics.map((metric) => {
          const def = METRIC_DEFS.find((d) => d.id === metric.id)!;
          return (
            <li key={metric.id} className={!metric.enabled ? "is-off" : ""}>
              <button
                type="button"
                className="legend-toggle"
                title={def.rationale}
                aria-pressed={metric.enabled}
                onClick={() => onChange(toggleMetric(metrics, metric.id, !metric.enabled))}
              >
                <i style={{ background: metric.enabled ? def.color : "#D4D4D4" }} />
                <span>{def.label}</span>
              </button>
              <label className="weight-tip" title={def.rationale}>
                <input
                  type="number"
                  min={def.min}
                  max={def.max}
                  disabled={!metric.enabled}
                  value={metric.weight}
                  onChange={(event) => onChange(clampWeightChange(metrics, metric.id, Number(event.target.value) || 0))}
                />
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ScorePair({
  turnover,
  fit,
  fitCategory,
}: {
  turnover: number;
  fit: number;
  fitCategory: string;
}) {
  return (
    <div className="score-pair-row">
      <div className="score-card">
        <p className="score-card-kicker">Turnover</p>
        <SemiGauge value={turnover} label={turnoverLabel(turnover)} gradient />
      </div>
      <div className="score-card">
        <p className="score-card-kicker">Fit for a {fitCategory.toLowerCase()}</p>
        <SemiGauge value={fit} label={fitLabel(fit)} />
      </div>
    </div>
  );
}

export function ScoringMethod({
  metrics,
  onChange,
  onClose,
}: {
  metrics: MetricState[];
  onChange: (next: MetricState[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(metrics.find((m) => m.found)?.id ?? metrics[0]?.id ?? null);
  const total = enabledTotal(metrics);
  const foundCount = metrics.filter((m) => m.found).length;
  const active = metrics.find((m) => m.id === selected);
  const def = METRIC_DEFS.find((d) => d.id === selected);

  return (
    <div className="scoring-method">
      <header className="section-head">
        <h3>How the score was built</h3>
        <span>{METRIC_DEFS.length} possible signals</span>
      </header>
      <p className="scoring-lead">
        LeaseLens checked {METRIC_DEFS.length} signals and found {foundCount} for this space, adding up to {total} of 100
        points.
      </p>
      <div className="score-bar" aria-hidden="true">
        {metrics
          .filter((m) => m.enabled && m.weight > 0)
          .map((m) => {
            const color = METRIC_DEFS.find((d) => d.id === m.id)?.color ?? "#999";
            return <i key={m.id} style={{ width: `${m.weight}%`, background: color }} />;
          })}
      </div>
      <ul className="signal-check-grid">
        {metrics.map((m) => {
          const item = METRIC_DEFS.find((d) => d.id === m.id)!;
          return (
            <li key={m.id}>
              <button
                type="button"
                className={selected === m.id ? "signal-check is-selected" : "signal-check"}
                onClick={() => setSelected(m.id)}
              >
                <i style={{ background: m.found || m.enabled ? item.color : "#D4D4D4" }} />
                <span className={!m.found && !m.enabled ? "muted" : ""}>{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {active && def && (
        <div className="signal-detail">
          <div className="signal-detail-head">
            <i style={{ background: def.color }} />
            <div>
              <strong>{def.label}</strong>
              <p className={active.found ? "status-found" : "status-miss"}>
                {active.found ? "Found" : "Not found for this space"}
                {active.observedAt ? `, ${active.observedAt.slice(0, 4)} filing` : ""}
              </p>
            </div>
            <label className="include-toggle" title={def.rationale}>
              <input
                type="checkbox"
                checked={active.enabled}
                onChange={(event) => onChange(toggleMetric(metrics, active.id, event.target.checked))}
              />
              Include
            </label>
          </div>
          <p className="evidence">{active.evidence || def.rationale}</p>
          {active.source && <p className="disclaimer">Source: {active.source}</p>}
          <div className="weight-row">
            <span>Weight</span>
            <div className="stepper">
              <button
                type="button"
                aria-label="Decrease weight"
                disabled={!active.enabled}
                onClick={() => onChange(clampWeightChange(metrics, active.id, active.weight - 1))}
              >
                −
              </button>
              <span title={def.rationale}>{active.weight}</span>
              <button
                type="button"
                aria-label="Increase weight"
                disabled={!active.enabled || total >= 100}
                onClick={() => onChange(clampWeightChange(metrics, active.id, active.weight + 1))}
              >
                +
              </button>
            </div>
            <span className="disclaimer">
              Default {def.defaultWeight}, range {def.min}–{def.max}
            </span>
          </div>
          <div className="weight-actions">
            <button
              type="button"
              className="text-btn"
              onClick={() => onChange(clampWeightChange(metrics, active.id, def.defaultWeight))}
            >
              Reset to default
            </button>
            <button type="button" className="ghost collapse-btn" onClick={onClose}>
              Hide scoring method ▴
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export { SemiGauge };
