"use client";

import { useContext, useState, type KeyboardEvent, type PointerEvent } from "react";
import { XAxis, YAxis, type XMark } from "./plot/Axis";
import { PlotResetContext, useStickyDomain } from "./plot/domain";
import { formatAxis } from "./plot/format";
import { linearScale } from "./plot/scales";

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
const KEY_STEPS: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 };

/** The axes by default: dollars up the side, and payments numbered along the bottom (first, middle, last). */
function paymentAxes(n: number): AnnuityAxes {
  const middle = Math.floor((n - 1) / 2);
  const marked = n === 1 ? [0] : n === 2 ? [0, 1] : [0, middle, n - 1];
  return { yName: "Dollars per payment", xName: "Payment number (the first is paid now)", xMarks: marked.map((index) => ({ index, text: `Payment ${index + 1}` })) };
}

/** A value in millions to one decimal, without the unit (the axis names it): 47.6. */
const millions = (value: number) => (value / 1e6).toLocaleString("en-US", { maximumFractionDigits: 1 });

/**
 * Each payment as a bar, with what it is worth today inside it. Values are labelled up the side and payments along
 * the bottom (`axes`, by default first, middle and last by number), each axis named. The bars are read as one
 * control: one tab stop, then the arrow keys (Home and End too) step payment to payment; hovering or tapping reads
 * the payment under the pointer (its `read`). Drawn on the server with no bar read yet.
 *
 * With `unit` ("usd" or "millions") the value axis has round-number ticks and a domain that only grows while the
 * Widget is in use, so the axis stays put as the discount rate moves (it starts over when the surrounding Widget's
 * reset key changes). Without it, the `ticks` given are used as they are.
 */
export function AnnuityPlot({ bars, ticks, axes, unit }: { bars: AnnuityBar[]; ticks: AnnuityTick[]; axes?: AnnuityAxes; unit?: "usd" | "millions" }) {
  const [picked, setPicked] = useState<number | null>(null);
  const reset = useContext(PlotResetContext);
  const n = bars.length;
  const sticky = useStickyDomain(
    bars.flatMap((b) => [b.payment, b.presentValue]),
    { resetKey: reset },
  );
  const labels: AnnuityTick[] = unit ? sticky.ticks.map((value) => ({ value, text: unit === "millions" ? millions(value) : formatAxis(value, "usd") })) : ticks;
  const top = unit ? sticky.max : Math.max(...ticks.map((t) => t.value));
  const bar = W / n;
  const y = linearScale(0, top, H, 0);
  const active = picked !== null && picked < n ? picked : null;
  const read = active === null ? null : bars[active];
  const shown = bars[active ?? n - 1];
  const pickNearest = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    setPicked(Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - box.left) / box.width) * n))));
  };
  const step = (e: KeyboardEvent<SVGRectElement>) => {
    const from = active ?? n - 1;
    const to = e.key === "Home" ? 0 : e.key === "End" ? n - 1 : e.key in KEY_STEPS ? from + KEY_STEPS[e.key] : null;
    if (to === null) return;
    e.preventDefault();
    setPicked(Math.min(n - 1, Math.max(0, to)));
  };
  const { yName, xName, xMarks } = axes ?? paymentAxes(n);
  // The first and last payments' labels are anchored to the edges so a long one never hangs outside the panel.
  const marks: XMark[] = xMarks.map(({ index, text }) => ({
    at: (index + 0.5) * bar,
    text,
    edge: n > 1 && index === 0 ? "start" : n > 1 && index === n - 1 ? "end" : undefined,
  }));

  return (
    <div>
      <p data-testid="chart-y-name" className="text-[11px] leading-4 text-[var(--muted)]">
        {yName}
      </p>
      <div className="flex gap-2 pt-2">
        <YAxis ticks={labels.map((t) => t.value)} y={y} format={(v) => labels.find((t) => t.value === v)?.text ?? String(v)} testid="chart-y-label" />
        <div className="relative min-w-0 flex-1">
          <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Annuity payments and their present value" className="block w-full">
            {labels.map((t) => (
              <line key={t.value} x1={0} x2={W} y1={y(t.value)} y2={y(t.value)} strokeWidth={1} vectorEffect="non-scaling-stroke" className="stroke-[var(--border)]" />
            ))}
            {bars.map((b, i) => (
              <g key={i} opacity={read && active !== i ? 0.6 : 1}>
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
            {active !== null && <rect x={active * bar} y={0} width={bar} height={H} fill="none" strokeWidth={1} vectorEffect="non-scaling-stroke" className="stroke-[var(--ink)]" />}
            {/* One control for every payment, so the keyboard has one stop; anywhere on the drawing reads the payment under the pointer. */}
            <rect
              data-testid="annuity-slider"
              x={0}
              y={0}
              width={W}
              height={H}
              fill="transparent"
              tabIndex={0}
              role="slider"
              aria-label="Annuity payments: the arrow keys read each payment"
              aria-valuemin={1}
              aria-valuemax={n}
              aria-valuenow={(active ?? n - 1) + 1}
              aria-valuetext={shown.read}
              onKeyDown={step}
              onFocus={() => setPicked((p) => p ?? n - 1)}
              onPointerMove={pickNearest}
              onPointerDown={pickNearest}
              className="cursor-crosshair outline-none focus-visible:stroke-[var(--ink)]"
            />
          </svg>
        </div>
      </div>
      <XAxis marks={marks} testid="chart-x-label" />
      <p data-testid="chart-x-name" className="ml-16 text-[11px] leading-4 text-[var(--muted)]">
        {xName}
      </p>
      <p data-testid="chart-readout" className="mt-1 min-h-5 text-sm leading-5 tabular-nums">
        {read ? read.read : <span className="text-[var(--muted)]">Hover over or tap the chart to read a value.</span>}
      </p>
    </div>
  );
}
