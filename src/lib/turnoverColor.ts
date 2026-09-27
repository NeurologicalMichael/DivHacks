/** Shared orange → yellow → green scale for turnover gauges, map dots, and legend. */
export function turnoverScaleColor(score: number): string {
  const t = Math.max(0, Math.min(100, score)) / 100;
  const stops: [number, [number, number, number]][] = [
    [0, [249, 115, 22]], // #F97316
    [0.5, [234, 179, 8]], // #EAB308
    [1, [34, 197, 94]], // #22C55E
  ];
  let i = 0;
  while (i < stops.length - 2 && t > stops[i + 1][0]) i += 1;
  const [t0, c0] = stops[i];
  const [t1, c1] = stops[i + 1];
  const u = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
  const r = Math.round(c0[0] + (c1[0] - c0[0]) * u);
  const g = Math.round(c0[1] + (c1[1] - c0[1]) * u);
  const b = Math.round(c0[2] + (c1[2] - c0[2]) * u);
  return `rgb(${r}, ${g}, ${b})`;
}

export const TURNOVER_GRADIENT = {
  low: "#F97316",
  mid: "#EAB308",
  high: "#22C55E",
} as const;
