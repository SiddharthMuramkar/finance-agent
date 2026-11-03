"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";

// The interactive part of a Case Data line chart. It is a client component of its own because the module
// that frames it (case-data-view.tsx) is also imported by server components, which may not use React state.

/** One sourced point as the plot draws it: its date, its value, and that value in full and as a short label. */
export type PlotPoint = { date: string; value: number; text: string; short: string };

/** A label on the value axis: the value it marks, in short. */
export type PlotTick = { value: number; text: string };

const W = 600;
const H = 180;
const PAD_X = 10;
const PAD_Y = 12;
/** Up to this many points, each is a large dot to tab to; a longer line is one stop, read with the arrow keys. */
const DENSE = 30;
/** Up to this many points, each value is printed above its point. */
const LABELLED = 12;
const KEY_STEPS: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 };

const share = (part: number, whole: number) => `${(part / whole) * 100}%`;

/**
 * A sourced line readable at any width: values at the left (lowest, middle, highest), dates below (first,
 * middle, last), each value above its point when there are 12 or fewer, and a readout line. Hovering, tapping
 * or focusing a point reads it as "<date>: <value>". The labels are page text beside the drawing, so they keep
 * their size while the drawing scales to the panel. Drawn on the server with no point read yet.
 */
export function HistoryPlot({ label, unit, points, ticks }: { label: string; unit?: string; points: PlotPoint[]; ticks: PlotTick[] }) {
  const [picked, setPicked] = useState<number | null>(null);
  const n = points.length;
  const values = points.map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const x = (i: number) => (n === 1 ? W / 2 : PAD_X + (i * (W - 2 * PAD_X)) / (n - 1));
  const y = (v: number) => (hi === lo ? H / 2 : H - PAD_Y - ((v - lo) / (hi - lo)) * (H - 2 * PAD_Y));
  const clamp = (i: number) => Math.min(n - 1, Math.max(0, i));
  const dense = n > DENSE;
  const labelled = n <= LABELLED;
  const active = picked !== null && picked < n ? picked : null;
  const read = active === null ? null : points[active];
  const shown = read ?? points[n - 1];

  // Anywhere on the drawing reads the point nearest the pointer, so a tap need not land on a dot.
  const pickNearest = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const at = ((e.clientX - box.left) / box.width) * W;
    setPicked(n === 1 ? 0 : clamp(Math.round(((at - PAD_X) / (W - 2 * PAD_X)) * (n - 1))));
  };
  const step = (e: KeyboardEvent<SVGRectElement>) => {
    const from = active ?? n - 1;
    const to = e.key === "Home" ? 0 : e.key === "End" ? n - 1 : e.key in KEY_STEPS ? from + KEY_STEPS[e.key] : null;
    if (to === null) return;
    e.preventDefault();
    setPicked(clamp(to));
  };
  const surface = { x: 0, y: 0, width: W, height: H, fill: "transparent", onPointerMove: pickNearest, onPointerDown: pickNearest };

  const middle = Math.floor((n - 1) / 2);
  const dated = n === 1 ? [0] : n === 2 ? [0, 1] : [0, middle, n - 1];
  const dateStyle = (i: number) =>
    n === 1 ? { left: "50%", transform: "translateX(-50%)" } : i === 0 ? { left: 0 } : i === n - 1 ? { right: 0 } : { left: share(x(i), W), transform: "translateX(-50%)" };
  // The first and last values lean inwards so they stay inside the chart.
  const along = (i: number) => (n === 1 ? "-50%" : i === 0 ? "-6px" : i === n - 1 ? "calc(6px - 100%)" : "-50%");

  return (
    <div className="@container">
      {unit && <p className="text-[11px] leading-4 text-[var(--muted)]">{unit}</p>}
      <div className={`flex gap-2 ${labelled ? "pt-5" : "pt-2"}`}>
        <div aria-hidden className="relative w-14 shrink-0">
          {ticks.map((t) => (
            <span
              key={t.value}
              data-testid="history-y-label"
              className="absolute right-0 -translate-y-1/2 whitespace-nowrap text-[11px] leading-none tabular-nums text-[var(--muted)]"
              style={{ top: share(y(t.value), H) }}
            >
              {t.text}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={label} className="block w-full overflow-visible">
            {ticks.map((t) => (
              <line key={t.value} x1={0} x2={W} y1={y(t.value)} y2={y(t.value)} strokeWidth={1} vectorEffect="non-scaling-stroke" className="stroke-[var(--border)]" />
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
              <circle key={p.date} data-testid="history-point" cx={x(i)} cy={y(p.value)} r={dense ? 1.75 : 4} className="fill-[var(--src)]">
                <title>{`${p.date}: ${p.text}`}</title>
              </circle>
            ))}
            {active !== null && (
              <circle cx={x(active)} cy={y(points[active].value)} r={7} fill="none" strokeWidth={2} vectorEffect="non-scaling-stroke" className="stroke-[var(--ink)]" />
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
                style={{ left: share(x(i), W), top: share(y(p.value), H), transform: `translate(${along(i)}, calc(-100% - 7px))` }}
              >
                {p.short}
              </span>
            ))}
        </div>
      </div>
      <div aria-hidden className="relative ml-16 mt-1 h-4">
        {dated.map((i) => (
          <span
            key={i}
            data-testid="history-x-label"
            className={`absolute top-0 whitespace-nowrap text-[11px] leading-4 tabular-nums text-[var(--muted)] ${n > 2 && i === middle ? "@max-2xs:hidden" : ""}`}
            style={dateStyle(i)}
          >
            {points[i].date}
          </span>
        ))}
      </div>
      <p data-testid="history-readout" className="mt-1 min-h-5 text-sm leading-5 tabular-nums">
        {read ? `${read.date}: ${read.text}` : <span className="text-[var(--muted)]">Hover over or tap the chart to read a value.</span>}
      </p>
    </div>
  );
}
