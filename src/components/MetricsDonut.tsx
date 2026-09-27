"use client";

import { useId, useState } from "react";
import {
  METRIC_DEFS,
  clampWeightChange,
  enabledTotal,
  fitLabel,
  metricLabel,
  toggleMetric,
  turnoverLabel,
  type MetricState,
} from "@/lib/signals";

const EXTRA_COLORS = ["#64748B", "#0EA5E9", "#A855F7", "#F43F5E", "#14B8A6"];

function colorFor(metric: MetricState, index = 0) {
  return METRIC_DEFS.find((d) => d.id === metric.id)?.color ?? EXTRA_COLORS[index % EXTRA_COLORS.length];
}

function rationaleFor(metric: MetricState) {
  return (
    METRIC_DEFS.find((d) => d.id === metric.id)?.rationale ??
    metric.evidence ??
    "Weight from a recorded signal for this storefront."
  );
}

function SemiGauge({
  value,
  label,
  gradient,
}: {
  value: number;
  label: string;
  gradient?: boolean;
}) {
  const display = Math.max(0, value);
  // Arc fills relative to 100; values above 100 show full arc but the number is uncapped.
  const fill = Math.min(100, display);
  const r = 42;
  const c = 2 * Math.PI * r;
  const half = c / 2;
  const offset = half - (fill / 100) * half;
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
          {Math.round(display)}
        </text>
      </svg>
      <span className="gauge-label">{label}</span>
    </div>
  );
}

/** Multi-segment donut of enabled metric weights (totals may exceed 100). */
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
  const scale = Math.max(total, 1);
  let cursor = 0;
  const enabled = metrics.filter((m) => m.enabled && m.weight > 0);

  return (
    <div className="donut-wrap">
      <svg viewBox={`0 0 ${size} ${size}`} className="donut" aria-label={`Turnover score ${total} points`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E8E8E8" strokeWidth={stroke} />
        {enabled.map((metric, index) => {
          const len = (metric.weight / scale) * circ;
          const dash = `${len} ${circ - len}`;
          const rot = (cursor / scale) * 360 - 90;
          cursor += metric.weight;
          return (
            <circle
              key={metric.id}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={colorFor(metric, index)}
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
          points
        </text>
      </svg>
      <p className="donut-caption">{turnoverLabel(total)}</p>
      <ul className="donut-legend">
        {metrics.map((metric, index) => {
          const label = metricLabel(metric);
          const tip = rationaleFor(metric);
          const def = METRIC_DEFS.find((d) => d.id === metric.id);
          return (
            <li key={metric.id} className={!metric.enabled ? "is-off" : ""}>
              <button
                type="button"
                className="legend-toggle"
                title={tip}
                aria-pressed={metric.enabled}
                onClick={() => onChange(toggleMetric(metrics, metric.id, !metric.enabled))}
              >
                <i style={{ background: metric.enabled ? colorFor(metric, index) : "#D4D4D4" }} />
                <span>{label}</span>
              </button>
              <label className="weight-tip" title={tip}>
                <input
                  type="number"
                  min={0}
                  max={def?.max ?? 200}
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
  const barScale = Math.max(total, 1);

  return (
    <div className="scoring-method">
      <header className="section-head">
        <h3>How the score was built</h3>
        <span>{metrics.length} signals listed</span>
      </header>
      <p className="scoring-lead">
        LeaseLens found {foundCount} signal{foundCount === 1 ? "" : "s"} for this space. Enabled weights add up to{" "}
        <strong>{total}</strong> points{total > 100 ? " (past 100 is allowed)" : ""}.
      </p>
      <div className="score-bar" aria-hidden="true">
        {metrics
          .filter((m) => m.enabled && m.weight > 0)
          .map((m, index) => (
            <i
              key={m.id}
              style={{ width: `${(m.weight / barScale) * 100}%`, background: colorFor(m, index) }}
            />
          ))}
      </div>
      <ul className="signal-check-grid">
        {metrics.map((m, index) => (
          <li key={m.id}>
            <button
              type="button"
              className={selected === m.id ? "signal-check is-selected" : "signal-check"}
              onClick={() => setSelected(m.id)}
            >
              <i style={{ background: m.found || m.enabled ? colorFor(m, index) : "#D4D4D4" }} />
              <span className={!m.found && !m.enabled ? "muted" : ""}>{metricLabel(m)}</span>
            </button>
          </li>
        ))}
      </ul>

      {active && (
        <div className="signal-detail">
          <div className="signal-detail-head">
            <i style={{ background: colorFor(active) }} />
            <div>
              <strong>{metricLabel(active)}</strong>
              <p className={active.found ? "status-found" : "status-miss"}>
                {active.found ? "Found" : "Not found for this space"}
                {active.observedAt ? `, ${active.observedAt.slice(0, 4)} filing` : ""}
              </p>
            </div>
            <label className="include-toggle" title={rationaleFor(active)}>
              <input
                type="checkbox"
                checked={active.enabled}
                onChange={(event) => onChange(toggleMetric(metrics, active.id, event.target.checked))}
              />
              Include
            </label>
          </div>
          <p className="evidence">{active.evidence || rationaleFor(active)}</p>
          {active.source && <p className="disclaimer">Source: {active.source}</p>}
          <div className="weight-row">
            <span>Weight</span>
            <div className="stepper">
              <button
                type="button"
                aria-label="Decrease weight"
                disabled={!active.enabled || active.weight <= 0}
                onClick={() => onChange(clampWeightChange(metrics, active.id, active.weight - 1))}
              >
                −
              </button>
              <span title={rationaleFor(active)}>{active.weight}</span>
              <button
                type="button"
                aria-label="Increase weight"
                disabled={!active.enabled}
                onClick={() => onChange(clampWeightChange(metrics, active.id, active.weight + 1))}
              >
                +
              </button>
            </div>
            {def && (
              <span className="disclaimer">
                Default {def.defaultWeight}, suggested range {def.min}–{def.max}
              </span>
            )}
          </div>
          <div className="weight-actions">
            {def && (
              <button
                type="button"
                className="text-btn"
                onClick={() => onChange(clampWeightChange(metrics, active.id, def.defaultWeight))}
              >
                Reset to default
              </button>
            )}
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
