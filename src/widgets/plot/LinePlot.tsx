import { HitBands, seriesPaint, type PlotSeries } from "./BarPlot";
import { PLOT_H, PLOT_W } from "./Axis";
import type { Scale } from "./scales";

/** The path of a line through points: straight segments, or steps when `step`. */
function pathOf(pts: [number, number][], step: boolean): string {
  return pts
    .map(([px, py], i) => {
      if (i === 0) return `M${px},${py}`;
      return step ? `H${px}V${py}` : `L${px},${py}`;
    })
    .join("");
}

/**
 * Lines over a fixed value axis, at the x positions given (band centres, or dates on a time axis). Areas never
 * stack: the first series is a filled area and the rest are lines, unless `stacked`, which piles the series up.
 */
export function LinePlot({ series, xs, y, ticks, fill, stacked, step, active, onActive, ariaLabel, readAt }: { series: PlotSeries[]; xs: number[]; y: Scale; ticks: number[]; fill: boolean; stacked: boolean; step: boolean; active: number | null; onActive: (i: number | null) => void; ariaLabel: string; readAt: (i: number) => string }) {
  const n = xs.length;
  const k = series.length;
  const base = y(Math.max(y.domain[0], Math.min(0, y.domain[1])));
  // The values each series is drawn at: its own, or the running total when stacked.
  const drawn = series.map((s, j) => xs.map((_, i) => (stacked ? series.slice(0, j + 1).reduce((sum, t) => sum + (t.values[i] ?? 0), 0) : (s.values[i] ?? 0))));
  const gap = n > 1 ? Math.min(...xs.slice(1).map((v, i) => v - xs[i])) : PLOT_W;
  return (
    <svg viewBox={`0 0 ${PLOT_W} ${PLOT_H}`} role="img" aria-label={ariaLabel} className="block w-full overflow-visible">
      {ticks.map((t) => (
        <line key={t} x1={0} x2={PLOT_W} y1={y(t)} y2={y(t)} strokeWidth={1} vectorEffect="non-scaling-stroke" className="stroke-[var(--border)]" />
      ))}
      {series.map((s, j) => {
        const paint = seriesPaint(j, k);
        const pts = xs.map((px, i) => [px, y(drawn[j][i])] as [number, number]);
        const line = pathOf(pts, step);
        const filled = (fill && j === 0) || (fill && stacked);
        return (
          <g key={j}>
            {filled && n > 1 && (
              <path
                data-testid="plot-area"
                d={`${line}L${pts[n - 1][0]},${base}L${pts[0][0]},${base}Z`}
                fill={paint.color}
                fillOpacity={0.15 * paint.opacity}
                stroke="none"
              />
            )}
            <path data-testid="plot-line" d={line} fill="none" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" stroke={paint.color} strokeOpacity={paint.opacity} />
            {pts.map(([px, py], i) => (
              <circle key={i} cx={px} cy={py} r={n > 30 ? 1.5 : 3} fill={paint.color} fillOpacity={paint.opacity} />
            ))}
          </g>
        );
      })}
      {active !== null && active < n && <line x1={xs[active]} x2={xs[active]} y1={0} y2={PLOT_H} strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" className="stroke-[var(--muted)]" />}
      <HitBands n={n} x={(i) => xs[i]} width={Math.max(12, gap)} active={active} onActive={onActive} label={readAt} />
    </svg>
  );
}
