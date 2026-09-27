"use client";

import { useId } from "react";
import {
  METRIC_DEFS,
  FIT_HELP,
  STORE_SCORE_HELP,
  STORE_SCORE_LABEL,
  enabledTotal,
  fitLabel,
  metricLabel,
  turnoverLabel,
  type MetricState,
} from "@/lib/signals";
import { TURNOVER_GRADIENT } from "@/lib/turnoverColor";
import { HoverTip } from "./HoverTip";

const EXTRA_COLORS = ["#64748B", "#0EA5E9", "#A855F7", "#F43F5E", "#14B8A6"];

export function colorFor(metric: MetricState, index = 0) {
  return METRIC_DEFS.find((d) => d.id === metric.id)?.color ?? EXTRA_COLORS[index % EXTRA_COLORS.length];
}

function rationaleFor(metric: MetricState) {
  return (
    METRIC_DEFS.find((d) => d.id === metric.id)?.rationale ??
    metric.evidence ??
    "Weight from a recorded signal for this storefront."
  );
}

/** Semi-circle gauge. Uses the same orange→yellow→green scale as map dots. */
function SemiGauge({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  const display = Math.max(0, value);
  const fill = Math.min(100, display) / 100;
  const gradId = useId();

  return (
    <div className="gauge">
      <svg viewBox="0 0 108 68" aria-hidden="true">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={TURNOVER_GRADIENT.low} />
            <stop offset="50%" stopColor={TURNOVER_GRADIENT.mid} />
            <stop offset="100%" stopColor={TURNOVER_GRADIENT.high} />
          </linearGradient>
        </defs>
        <path
          className="gauge-track"
          d="M 12 58 A 42 42 0 0 1 96 58"
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="100 100"
        />
        <path
          className="gauge-value"
          d="M 12 58 A 42 42 0 0 1 96 58"
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth="8"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${fill * 100} 100`}
          strokeDashoffset={0}
        />
        <text x="54" y="52" textAnchor="middle" className="gauge-num">
          {Math.round(display)}
        </text>
      </svg>
      <span className="gauge-label">{label}</span>
    </div>
  );
}

/** Read-only donut of metric weights (totals may exceed 100). */
export function MetricsDonut({ metrics }: { metrics: MetricState[] }) {
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
      <svg viewBox={`0 0 ${size} ${size}`} className="donut" aria-label={`${STORE_SCORE_LABEL} ${total} points`}>
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
      <ul className="donut-legend is-readonly">
        {metrics.map((metric, index) => {
          const applies = metric.found && metric.enabled && metric.weight > 0;
          return (
            <li key={metric.id} className={applies ? undefined : "is-off"}>
              <span className="legend-toggle" title={rationaleFor(metric)}>
                <i style={{ background: applies ? colorFor(metric, index) : "#D4D4D4" }} />
                <span>{metricLabel(metric)}</span>
              </span>
              {applies ? (
                <span className="flag-weight is-positive">+{metric.weight}</span>
              ) : (
                <span className="metric-na">Not on file</span>
              )}
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
        <p className="score-card-kicker">
          <HoverTip tip={STORE_SCORE_HELP}>{STORE_SCORE_LABEL}</HoverTip>
        </p>
        <SemiGauge value={turnover} label={turnoverLabel(turnover)} />
      </div>
      <div className="score-card">
        <p className="score-card-kicker">
          <HoverTip tip={FIT_HELP}>Fit for a {fitCategory.toLowerCase()}</HoverTip>
        </p>
        <SemiGauge value={fit} label={fitLabel(fit)} />
      </div>
    </div>
  );
}

export { SemiGauge };
