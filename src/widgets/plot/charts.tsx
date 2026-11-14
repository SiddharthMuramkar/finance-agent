"use client";

import { useContext, useRef, useState } from "react";
import { PLOT_H, PLOT_W, XAxis, YAxis, thinMarks, useUnitsPerPixel, type XMark } from "./Axis";
import { BarPlot, seriesPaint, type PlotSeries } from "./BarPlot";
import { PlotResetContext, useStickyDomain } from "./domain";
import { formatAxis, formatValue, plotUnit } from "./format";
import { LinePlot } from "./LinePlot";
import { Readout } from "./Readout";
import { dateMs, linearScale, timeMarks } from "./scales";

// The kit's three chart parts, drawn by hand so every chart has the same look, keyboard model and units. They take
// OpenUI's positional props exactly (labels, series, variant, xLabel, yLabel) and add only optional ones after
// them. They are exported, not registered: the Widget library registers them over OpenUI's own.

export type ChartProps = {
  labels: string[];
  series: PlotSeries[];
  /** Bars: "grouped" (default) or "stacked". Lines and areas: "linear", "natural" or "step"; "stacked" piles areas up. */
  variant?: string;
  xLabel?: string;
  yLabel?: string;
  /** OpenUI's own chart height; this kit draws at a fixed shape and ignores it. */
  height?: number;
  /** "inr", "usd", "percent" or plain; when absent it is read from the y-axis label ("Rupees", "Dollars", "Percent"). */
  unit?: string;
  /** The value axis never ends inside these, for an author who knows the range. */
  yMin?: number;
  yMax?: number;
};

/** The unit a y-axis label names, for a chart that did not say: "Rupees" is inr, "Dollars" is usd, "Percent" is percent. */
export function unitFromLabel(yLabel: string | undefined): string | undefined {
  const t = (yLabel ?? "").toLowerCase();
  if (/₹|rupee|\binr\b/.test(t)) return "inr";
  if (/\$|dollar|\busd\b/.test(t)) return "usd";
  if (/percent|%/.test(t)) return "percent";
  return undefined;
}

type Kind = "bar" | "line" | "area";

/** About `max` marks across the bottom of a band axis: all of them when few, else the first, last and a few between. */
function bandMarks(labels: string[], at: (i: number) => number, max: number): XMark[] {
  const n = labels.length;
  const picks = n <= max ? Array.from({ length: n }, (_, i) => i) : Array.from(new Set(Array.from({ length: max }, (_, k) => Math.round((k * (n - 1)) / (max - 1)))));
  return picks.map((i) => ({ at: at(i), text: labels[i], hideNarrow: i !== 0 && i !== n - 1 }));
}

function Chart({ kind, ...props }: ChartProps & { kind: Kind }) {
  const { labels, xLabel, yLabel, variant } = props;
  const series = props.series.filter((s) => Array.isArray(s.values));
  const n = labels.length;
  const unit = props.unit ?? unitFromLabel(yLabel);
  const stacked = variant === "stacked";
  const reset = useContext(PlotResetContext);
  const [active, setActive] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const unitsPerPixel = useUnitsPerPixel(box);

  // Everything the axis must hold: each value, or each column's total when bars or areas are stacked.
  const seen: number[] = [];
  for (let i = 0; i < n; i++) {
    if (stacked) {
      seen.push(series.reduce((sum, s) => sum + Math.max(0, s.values[i] ?? 0), 0), series.reduce((sum, s) => sum + Math.min(0, s.values[i] ?? 0), 0));
    } else {
      for (const s of series) seen.push(s.values[i] ?? 0);
    }
  }
  const domain = useStickyDomain(seen, { resetKey: reset, yMin: props.yMin, yMax: props.yMax, zero: kind !== "line" });
  const y = linearScale(domain.min, domain.max, PLOT_H, 0);

  // Dates on a line or area are spaced by time; anything else by slot.
  const times = kind === "bar" ? [] : labels.map(dateMs);
  const timed = n >= 2 && times.every((t) => Number.isFinite(t)) && times.every((t, i) => i === 0 || t > times[i - 1]);
  const slot = (i: number) => (PLOT_W * (i + 0.5)) / Math.max(1, n);
  const xs = timed ? times.map((t) => linearScale(times[0], times[n - 1], 8, PLOT_W - 8)(t)) : labels.map((_, i) => slot(i));
  const marks: XMark[] = timed
    ? timeMarks(times[0], times[n - 1], labels[0], labels[n - 1]).map((m) => ({ at: linearScale(times[0], times[n - 1], 8, PLOT_W - 8)(m.ms), text: m.text, edge: m.edge }))
    : bandMarks(labels, slot, 6);

  const readAt = (i: number) => {
    const parts = series.map((s) => `${series.length > 1 ? `${s.category} ` : ""}${formatValue(s.values[i] ?? 0, unit)}`);
    return `${labels[i]}: ${parts.join(", ")}`;
  };
  const read = active !== null && active < n ? readAt(active) : null;
  const names = series.map((s) => s.category).join(", ");
  const ariaLabel = `${kind === "bar" ? "Bar" : kind === "area" ? "Area" : "Line"} chart${yLabel ? ` of ${yLabel}` : ""}${xLabel ? ` by ${xLabel}` : ""}: ${names}`;
  const axisUnit = plotUnit(unit) === "plain" ? undefined : unit;

  return (
    <figure data-testid="plot-chart" data-kind={kind} className="@container py-2">
      {yLabel && (
        <p data-testid="plot-y-name" className="text-[11px] leading-4 text-[var(--muted)]">
          {yLabel}
        </p>
      )}
      <div className="flex gap-2 pt-2">
        <YAxis ticks={domain.ticks} y={y} format={(v) => formatAxis(v, axisUnit)} />
        <div className="relative min-w-0 flex-1" ref={box}>
          {kind === "bar" ? (
            <BarPlot labels={labels} series={series} stacked={stacked} y={y} ticks={domain.ticks} unitsPerPixel={unitsPerPixel} active={active} onActive={setActive} ariaLabel={ariaLabel} readAt={readAt} />
          ) : (
            <LinePlot series={series} xs={xs} y={y} ticks={domain.ticks} fill={kind === "area"} stacked={stacked} step={variant === "step"} active={active} onActive={setActive} ariaLabel={ariaLabel} readAt={readAt} />
          )}
        </div>
      </div>
      <XAxis marks={timed ? marks : thinMarks(marks, 90)} />
      {xLabel && (
        <p data-testid="plot-x-name" className="ml-16 text-[11px] leading-4 text-[var(--muted)]">
          {xLabel}
        </p>
      )}
      {series.length > 1 && (
        <p className="mt-1 flex flex-wrap gap-x-4 text-xs text-[var(--muted)]">
          {series.map((s, j) => {
            const paint = seriesPaint(j, series.length);
            return (
              <span key={j} data-testid="plot-legend">
                <span className="mr-1 inline-block size-2" style={{ background: paint.color, opacity: paint.opacity }} />
                {s.category}
              </span>
            );
          })}
        </p>
      )}
      <Readout text={read} />
    </figure>
  );
}

/** Bars over a fixed, round-numbered value axis: grouped by default, stacked only when `variant` is "stacked". */
export function BarChartPlot(props: ChartProps) {
  return <Chart kind="bar" {...props} />;
}

/** Lines over a fixed value axis; dates are spaced by time. */
export function LineChartPlot(props: ChartProps) {
  return <Chart kind="line" {...props} />;
}

/** The first series as a filled area, the rest as lines; they overlap and never stack unless `variant` is "stacked". */
export function AreaChartPlot(props: ChartProps) {
  return <Chart kind="area" {...props} />;
}
