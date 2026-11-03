"use client";

import { useState, type PointerEvent } from "react";

// The interactive part of the annuity chart. A client component of its own, as history-plot.tsx is, because the
// module that frames it (case-data-view.tsx) is also imported by server components, which may not use React state.

/** One payment as the plot draws it: its amount and today's value, and how a point read says it. */
export type AnnuityBar = { payment: number; presentValue: number; read: string };

/** A label on the value axis: the value it marks, in short. */
export type AnnuityTick = { value: number; text: string };

/** How the plot names its axes and which payments it labels along the bottom (by index, with their words). */
export type AnnuityAxes = { yName: string; xName: string; xMarks: { index: number; text: string }[] };

const W = 600;
const H = 180;

const share = (part: number, whole: number) => `${(part / whole) * 100}%`;

/** The axes by default: dollars up the side, and payments numbered along the bottom (first, middle, last). */
function paymentAxes(n: number): AnnuityAxes {
  const middle = Math.floor((n - 1) / 2);
  const marked = n === 1 ? [0] : n === 2 ? [0, 1] : [0, middle, n - 1];
  return { yName: "Dollars per payment", xName: "Payment number (the first is paid now)", xMarks: marked.map((index) => ({ index, text: `Payment ${index + 1}` })) };
}

/**
 * Each payment as a bar, with what it is worth today inside it. Values are labelled up the side (0, half and the
 * largest payment) and payments along the bottom (`axes`, by default first, middle and last by number), each axis
 * named. Hovering, tapping or focusing a bar reads it (its `read`). Drawn on the server with no bar read yet.
 */
export function AnnuityPlot({ bars, ticks, axes }: { bars: AnnuityBar[]; ticks: AnnuityTick[]; axes?: AnnuityAxes }) {
  const [picked, setPicked] = useState<number | null>(null);
  const n = bars.length;
  const top = Math.max(...ticks.map((t) => t.value));
  const bar = W / n;
  const y = (v: number) => H - (v / top) * H;
  const read = picked !== null && picked < n ? bars[picked] : null;
  const pickNearest = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    setPicked(Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - box.left) / box.width) * n))));
  };
  const { yName, xName, xMarks } = axes ?? paymentAxes(n);

  return (
    <div>
      <p data-testid="chart-y-name" className="text-[11px] leading-4 text-[var(--muted)]">
        {yName}
      </p>
      <div className="flex gap-2 pt-2">
        <div aria-hidden className="relative w-14 shrink-0">
          {ticks.map((t) => (
            <span
              key={t.value}
              data-testid="chart-y-label"
              className="absolute right-0 -translate-y-1/2 whitespace-nowrap text-[11px] leading-none tabular-nums text-[var(--muted)]"
              style={{ top: share(y(t.value), H) }}
            >
              {t.text}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Annuity payments and their present value" className="block w-full">
            {ticks.map((t) => (
              <line key={t.value} x1={0} x2={W} y1={y(t.value)} y2={y(t.value)} strokeWidth={1} vectorEffect="non-scaling-stroke" className="stroke-[var(--border)]" />
            ))}
            {bars.map((b, i) => (
              <g key={i} opacity={read && picked !== i ? 0.6 : 1}>
                <rect x={i * bar + 1} y={y(b.payment)} width={bar - 2} height={H - y(b.payment)} className="fill-[var(--data)]" />
                <rect
                  data-testid="pv-bar"
                  x={i * bar + 1}
                  y={y(b.presentValue)}
                  width={bar - 2}
                  height={H - y(b.presentValue)}
                  className="fill-[var(--you)] transition-all duration-150 "
                />
              </g>
            ))}
            {/* Anywhere on the drawing reads the payment under the pointer, so a tap need not land on a bar. */}
            <rect x={0} y={0} width={W} height={H} fill="transparent" onPointerMove={pickNearest} onPointerDown={pickNearest} />
            {bars.map((b, i) => (
              <rect
                key={i}
                x={i * bar}
                y={0}
                width={bar}
                height={H}
                fill="transparent"
                tabIndex={0}
                aria-label={b.read}
                onPointerEnter={() => setPicked(i)}
                onFocus={() => setPicked(i)}
                onClick={() => setPicked(i)}
                className="cursor-pointer outline-none focus-visible:stroke-[var(--ink)]"
              />
            ))}
          </svg>
        </div>
      </div>
      <div aria-hidden className="relative ml-16 mt-1 h-4">
        {xMarks.map(({ index: i, text }) => (
          <span
            key={i}
            data-testid="chart-x-label"
            className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[11px] leading-4 tabular-nums text-[var(--muted)]"
            style={{ left: share((i + 0.5) * bar, W) }}
          >
            {text}
          </span>
        ))}
      </div>
      <p data-testid="chart-x-name" className="ml-16 text-[11px] leading-4 text-[var(--muted)]">
        {xName}
      </p>
      <p data-testid="chart-readout" className="mt-1 min-h-5 text-sm leading-5 tabular-nums">
        {read ? read.read : <span className="text-[var(--muted)]">Hover over or tap the chart to read a value.</span>}
      </p>
    </div>
  );
}
