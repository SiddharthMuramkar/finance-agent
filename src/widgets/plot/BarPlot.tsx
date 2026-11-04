import { useRef, type KeyboardEvent } from "react";
import { bandScale, type Scale } from "./scales";
import { PLOT_H, PLOT_W } from "./Axis";

/** The widest a bar may be, in screen pixels: two bars in a wide panel stay bars, not slivers. */
export const BAR_MAX_PX = 48;

export type PlotSeries = { category: string; values: number[] };

/**
 * How series are painted: one or two take the Learner's teal and the sourced amber; three or more take teal in
 * steps of opacity, so no series is told apart by a colour that means something else. Never navy.
 */
export function seriesPaint(i: number, count: number): { color: string; opacity: number } {
  if (count <= 2) return { color: i === 0 ? "var(--you)" : "var(--src)", opacity: 1 };
  return { color: "var(--you)", opacity: [1, 0.65, 0.4, 0.25][i % 4] };
}

const KEYS: Record<string, number> = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };

/**
 * One transparent band per category, over the drawing: the pointer reads the band under it, and the keyboard moves
 * point to point. Only the active band is a tab stop (a roving tabindex), so a long chart is one stop, not thirty.
 */
export function HitBands({ n, x, width, active, onActive, label }: { n: number; x: (i: number) => number; width: number; active: number | null; onActive: (i: number | null) => void; label: (i: number) => string }) {
  const refs = useRef<(SVGRectElement | null)[]>([]);
  const stop = active !== null && active < n ? active : 0;
  const move = (e: KeyboardEvent<SVGRectElement>, i: number) => {
    const to = e.key === "Home" ? 0 : e.key === "End" ? n - 1 : e.key in KEYS ? Math.min(n - 1, Math.max(0, i + KEYS[e.key])) : null;
    if (to === null) return;
    e.preventDefault();
    refs.current[to]?.focus();
  };
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <rect
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          data-testid="plot-hit"
          x={x(i) - width / 2}
          y={0}
          width={width}
          height={PLOT_H}
          fill="transparent"
          tabIndex={i === stop ? 0 : -1}
          aria-label={label(i)}
          onPointerEnter={() => onActive(i)}
          onPointerDown={() => onActive(i)}
          onFocus={() => onActive(i)}
          onKeyDown={(e) => move(e, i)}
          className="cursor-pointer outline-none focus-visible:stroke-[var(--ink)]"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </>
  );
}

/** Bars over a fixed value axis: grouped side by side, or stacked when `stacked`; each capped at BAR_MAX_PX wide and centred in its slot. */
export function BarPlot({ labels, series, stacked, y, ticks, unitsPerPixel, active, onActive, ariaLabel, readAt }: { labels: string[]; series: PlotSeries[]; stacked: boolean; y: Scale; ticks: number[]; unitsPerPixel: number; active: number | null; onActive: (i: number | null) => void; ariaLabel: string; readAt: (i: number) => string }) {
  const n = labels.length;
  const k = series.length;
  const band = bandScale(n, 0, PLOT_W, 0.3, BAR_MAX_PX * unitsPerPixel);
  const zero = y(0);
  const rect = (v: number, base: number) => {
    const top = y(base + v);
    const bottom = y(base);
    return { y: Math.min(top, bottom), height: Math.abs(bottom - top) };
  };
  const [d0] = y.domain;
  return (
    <svg viewBox={`0 0 ${PLOT_W} ${PLOT_H}`} role="img" aria-label={ariaLabel} className="block w-full">
      {ticks.map((t) => (
        <line key={t} x1={0} x2={PLOT_W} y1={y(t)} y2={y(t)} strokeWidth={1} vectorEffect="non-scaling-stroke" className="stroke-[var(--border)]" />
      ))}
      {Array.from({ length: n }, (_, i) => {
        let up = 0;
        let down = 0;
        return (
          <g key={i} opacity={active !== null && active !== i ? 0.6 : 1}>
            {series.map((s, j) => {
              const v = s.values[i] ?? 0;
              const paint = seriesPaint(j, k);
              const w = stacked ? band.bandwidth : band.bandwidth / k;
              const x = stacked ? band.start(i) : band.start(i) + j * w;
              const base = stacked ? (v >= 0 ? up : down) : 0;
              if (stacked && v >= 0) up += v;
              else if (stacked) down += v;
              const r = rect(v, base);
              return <rect key={j} data-testid="plot-bar" x={x} y={r.y} width={Math.max(0, w - (k > 1 && !stacked ? 1 : 0))} height={r.height} fill={paint.color} fillOpacity={paint.opacity} className="transition-all duration-150" />;
            })}
          </g>
        );
      })}
      {d0 < 0 && <line x1={0} x2={PLOT_W} y1={zero} y2={zero} strokeWidth={1} vectorEffect="non-scaling-stroke" className="stroke-[var(--muted)]" />}
      <HitBands n={n} x={band.center} width={band.step} active={active} onActive={onActive} label={readAt} />
    </svg>
  );
}
