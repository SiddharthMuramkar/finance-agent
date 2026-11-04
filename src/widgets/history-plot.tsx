"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { XAxis, YAxis, type XMark } from "./plot/Axis";
import { dateMs, logTicks, niceTicks, timeMarks } from "./plot/scales";

// The interactive part of a Case Data line chart. It is a client component of its own because the module
// that frames it (case-data-view.tsx) is also imported by server components, which may not use React state.

/** One sourced point as the plot draws it: its date, its value, and that value in full and as a short label. */
export type PlotPoint = { date: string; value: number; text: string; short: string };

/** A label on the value axis: the value it marks, in short. */
export type PlotTick = { value: number; text: string };

/** The value axis' two scales; a log axis shows ratios, so growth at a steady rate runs straight. */
export type PlotScale = "linear" | "log";

const W = 600;
const H = 180;
const PAD_X = 10;
const PAD_Y = 12;
/** Up to this many points, each is a large dot to tab to; a longer line is one stop, read with the arrow keys. */
const DENSE = 30;
/** Up to this many points, each value is printed above its point. */
const LABELLED = 12;
const KEY_STEPS: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 };
const THREE_YEARS = 3 * 365.25 * 86_400_000;

const share = (part: number, whole: number) => `${(part / whole) * 100}%`;

/**
 * The radii of a line's dots and of the ring round the point read, in drawing units, for a drawing shown at
 * `unitsPerPixel` units to a screen pixel (1 on the server, where nothing is measured). The line scales with the
 * panel, but its dots keep a 4px radius and the ring 7px, so a narrow panel never shrinks them to specks. Where
 * points crowd, a dot takes at most 40% of the gap to its neighbour, so dots never merge; a long line keeps its
 * small dots, since the line itself carries it.
 */
export function pointSizes(n: number, unitsPerPixel: number): { dot: number; ring: number } {
  const ring = 7 * unitsPerPixel;
  if (n > DENSE) return { dot: 1.75, ring };
  const gap = n > 1 ? (W - 2 * PAD_X) / (n - 1) : W;
  return { dot: Math.min(4 * unitsPerPixel, 0.4 * gap), ring };
}

/** Drawing units per screen pixel of the plot's SVG, kept up to date as the panel resizes; 1 until measured. */
function useUnitsPerPixel(svg: RefObject<SVGSVGElement | null>): number {
  const [unitsPerPixel, setUnitsPerPixel] = useState(1);
  useEffect(() => {
    const el = svg.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const width = el.getBoundingClientRect().width;
      if (width > 0) setUnitsPerPixel(W / width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [svg]);
  return unitsPerPixel;
}

/** Eases between the linear (0) and log (1) drawing of a line over about 200 ms; jumps when motion is reduced. */
function useScaleMix(target: PlotScale): number {
  const goal = target === "log" ? 1 : 0;
  const [mix, setMix] = useState(goal);
  const current = useRef(goal);
  // With reduced motion the line jumps: no easing, so the mix is the goal itself.
  const reduced = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    const start = current.current;
    if (start === goal || reduced || typeof requestAnimationFrame === "undefined") return;
    const began = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - began) / 200);
      current.current = start + (goal - start) * t;
      setMix(current.current);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [goal, reduced]);
  return reduced ? goal : mix;
}

/**
 * A sourced line readable at any width: values at the left (round-number ticks), dates below, each value above its
 * point when there are 12 or fewer, and a readout line. The line is spaced by time, so a decade between two points
 * is a decade wide; with `format` and values above zero, a "Log scale" switch re-draws it on a log axis. Hovering,
 * tapping or focusing a point reads it as "<date>: <value>". The labels are page text beside the drawing, so they
 * keep their size while the drawing scales to the panel. Drawn on the server with no point read yet.
 */
export function HistoryPlot({
  label,
  unit,
  points,
  ticks,
  format,
  scale = "linear",
}: {
  label: string;
  unit?: string;
  points: PlotPoint[];
  ticks: PlotTick[];
  /** How a tick value reads; with it the value axis gets round-number ticks and, above zero, a Log scale switch. */
  format?: (value: number) => string;
  /** Which scale to start on. */
  scale?: PlotScale;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const [chosen, setChosen] = useState<PlotScale>(scale);
  const svg = useRef<SVGSVGElement>(null);
  const n = points.length;
  const values = points.map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const canLog = !!format && n >= 2 && lo > 0;
  const mode: PlotScale = canLog ? chosen : "linear";
  const mix = useScaleMix(mode);

  // Linear and log axes, each with round-number ticks; the line is drawn between them while it eases.
  const linearTicks = format ? niceTicks(lo, hi, 5) : ticks.map((t) => t.value);
  const logAxis = canLog ? logTicks(lo, hi) : null;
  const textOf = (v: number) => (format ? format(v) : (ticks.find((t) => t.value === v)?.text ?? String(v)));
  const lin = { lo: linearTicks[0], hi: linearTicks[linearTicks.length - 1] };
  const logr = logAxis ? { lo: Math.log10(logAxis[0]), hi: Math.log10(logAxis[logAxis.length - 1]) } : null;
  const norm = (v: number) => {
    const a = lin.hi === lin.lo ? 0.5 : (v - lin.lo) / (lin.hi - lin.lo);
    if (!logr || mix === 0) return a;
    const b = logr.hi === logr.lo ? 0.5 : (Math.log10(v) - logr.lo) / (logr.hi - logr.lo);
    return a + (b - a) * mix;
  };
  const y = (v: number) => H - PAD_Y - norm(v) * (H - 2 * PAD_Y);
  const shownTicks = mode === "log" && logAxis ? logAxis : linearTicks;
  const yTicks = shownTicks.filter((v, i) => i === 0 || textOf(v) !== textOf(shownTicks[i - 1]));

  // Spaced by time when every date reads as one; otherwise by position in the list.
  const times = points.map((p) => dateMs(p.date));
  const timed = n >= 2 && times.every((t) => Number.isFinite(t)) && times.every((t, i) => i === 0 || t >= times[i - 1]) && times[n - 1] > times[0];
  const span = timed ? times[n - 1] - times[0] : n - 1;
  const x = (i: number) => (n === 1 ? W / 2 : PAD_X + (((timed ? times[i] - times[0] : i) * (W - 2 * PAD_X)) / span));
  // Points keep their size even where time packs them together: the line says how close they are.
  const sizes = pointSizes(n, useUnitsPerPixel(svg));
  const dot = sizes.dot;
  const clamp = (i: number) => Math.min(n - 1, Math.max(0, i));
  const dense = n > DENSE;
  const labelled = n <= LABELLED;
  const active = picked !== null && picked < n ? picked : null;
  const read = active === null ? null : points[active];
  const shown = read ?? points[n - 1];

  // Anywhere on the drawing reads the point nearest the pointer (nearest in time), so a tap need not land on a dot.
  const pickNearest = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const at = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(x(i) - at) < Math.abs(x(best) - at)) best = i;
    setPicked(best);
  };
  const step = (e: KeyboardEvent<SVGRectElement>) => {
    const from = active ?? n - 1;
    const to = e.key === "Home" ? 0 : e.key === "End" ? n - 1 : e.key in KEY_STEPS ? from + KEY_STEPS[e.key] : null;
    if (to === null) return;
    e.preventDefault();
    setPicked(clamp(to));
  };
  const surface = { x: 0, y: 0, width: W, height: H, fill: "transparent", onPointerMove: pickNearest, onPointerDown: pickNearest };

  // Dates along the bottom: the first and last, with round years between on a long span.
  const middle = Math.floor((n - 1) / 2);
  const marks: XMark[] = timed
    ? timeMarks(times[0], times[n - 1], points[0].date, points[n - 1].date).map((m) => ({ at: PAD_X + ((m.ms - times[0]) * (W - 2 * PAD_X)) / span, text: m.text, edge: m.edge }))
    : (n === 1 ? [0] : n === 2 ? [0, 1] : [0, middle, n - 1]).map((i) => ({
        at: x(i),
        text: points[i].date,
        edge: n > 1 && i === 0 ? ("start" as const) : n > 1 && i === n - 1 ? ("end" as const) : undefined,
        hideNarrow: n > 2 && i === middle,
      }));
  // A shorter span also names its middle point, when it sits clear of both ends.
  if (timed && n > 2 && times[n - 1] - times[0] < THREE_YEARS) {
    const at = (times[middle] - times[0]) / span;
    if (at > 0.25 && at < 0.75) marks.splice(1, 0, { at: x(middle), text: points[middle].date, hideNarrow: true });
  }
  // The first and last values lean inwards so they stay inside the chart.
  const along = (i: number) => (n === 1 ? "-50%" : i === 0 ? "-6px" : i === n - 1 ? "calc(6px - 100%)" : "-50%");

  return (
    <div className="@container">
      <div className="flex items-start justify-between gap-2">
        {unit && <p className="text-[11px] leading-4 text-[var(--muted)]">{unit}</p>}
        {canLog && (
          <button
            type="button"
            role="switch"
            aria-checked={mode === "log"}
            data-testid="history-log-toggle"
            onClick={() => setChosen(mode === "log" ? "linear" : "log")}
            className="-mt-1 ml-auto flex min-h-6 shrink-0 cursor-pointer items-center gap-2 rounded px-1 text-xs text-[var(--muted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
          >
            Log scale
            <span aria-hidden className={`relative inline-block h-4 w-7 rounded border transition-colors duration-150 ${mode === "log" ? "border-[var(--brand)] bg-[var(--brand)]" : "border-[var(--border)] bg-[var(--field)]"}`}>
              <span className={`absolute left-0.5 top-0.5 size-3 rounded-sm transition-transform duration-150 ${mode === "log" ? "translate-x-3 bg-[var(--brand-ink)]" : "bg-[var(--muted)]"}`} />
            </span>
          </button>
        )}
      </div>
      <div className={`flex gap-2 ${labelled ? "pt-5" : "pt-2"}`}>
        <YAxis ticks={yTicks} y={y} format={textOf} testid="history-y-label" />
        <div className="relative min-w-0 flex-1">
          <svg ref={svg} viewBox={`0 0 ${W} ${H}`} role="group" aria-label={label} className="block w-full overflow-visible">
            {yTicks.map((t) => (
              <line key={t} x1={0} x2={W} y1={y(t)} y2={y(t)} strokeWidth={1} vectorEffect="non-scaling-stroke" className="stroke-[var(--border)]" />
            ))}
            <polyline
              points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")}
              fill="none"
              strokeWidth={2}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              className="stroke-[var(--src)]"
            />
            {active !== null && (
              <line x1={x(active)} x2={x(active)} y1={0} y2={H} strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" className="stroke-[var(--muted)]" />
            )}
            {points.map((p, i) => (
              <circle key={p.date} data-testid="history-point" cx={x(i)} cy={y(p.value)} r={dot} className="fill-[var(--src)]">
                <title>{`${p.date}: ${p.text}`}</title>
              </circle>
            ))}
            {active !== null && (
              <circle cx={x(active)} cy={y(points[active].value)} r={sizes.ring} fill="none" strokeWidth={2} vectorEffect="non-scaling-stroke" className="stroke-[var(--ink)]" />
            )}
            {dense ? (
              <rect
                {...surface}
                tabIndex={0}
                role="slider"
                aria-label={`${label}: the arrow keys read each value`}
                aria-valuemin={1}
                aria-valuemax={n}
                aria-valuenow={(active ?? n - 1) + 1}
                aria-valuetext={`${shown.date}: ${shown.text}`}
                onKeyDown={step}
                onFocus={() => setPicked((p) => p ?? n - 1)}
                className="cursor-crosshair outline-none"
              />
            ) : (
              <rect {...surface} />
            )}
            {!dense &&
              points.map((p, i) => (
                <circle
                  key={p.date}
                  cx={x(i)}
                  cy={y(p.value)}
                  r={12}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${p.date}: ${p.text}`}
                  onPointerEnter={() => setPicked(i)}
                  onFocus={() => setPicked(i)}
                  onClick={() => setPicked(i)}
                  className="cursor-pointer outline-none"
                />
              ))}
          </svg>
          {labelled &&
            points.map((p, i) => (
              <span
                key={p.date}
                data-testid="history-value"
                aria-hidden
                className={`absolute whitespace-nowrap text-[11px] leading-none tabular-nums text-[var(--ink)] ${n <= 6 ? "@max-xs:hidden" : "@max-md:hidden"}`}
                // 10px up: clear of the 7px ring round a point being read.
                style={{ left: share(x(i), W), top: share(y(p.value), H), transform: `translate(${along(i)}, calc(-100% - 10px))` }}
              >
                {p.short}
              </span>
            ))}
        </div>
      </div>
      <XAxis marks={marks} testid="history-x-label" />
      <p data-testid="history-readout" className="mt-1 min-h-5 text-sm leading-5 tabular-nums">
        {read ? `${read.date}: ${read.text}` : <span className="text-[var(--muted)]">Hover over or tap the chart to read a value.</span>}
      </p>
    </div>
  );
}
