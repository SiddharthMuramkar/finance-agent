"use client";

import { defineComponent, reactive, useStateField, type ComponentRenderProps } from "@openuidev/react-lang";
import { useEffect, useId, useState } from "react";
import { z } from "zod/v4";
import { useCaseLoad } from "../../case-data-provider";
import { trimmed } from "./format";
import { usePrefersReducedMotion } from "./motion";
import { along, Marker, Track } from "./track";

// Breakeven: find the flip point. A thin track mirrors the slider and a proximity meter says Far, Warmer, Close,
// then Found it. No number shows until the Learner finds it. A sourced marker (an amber tick) then shows where
// the record put the same figure, so the Learner meets the idea (the lottery priced its cash option at about the
// safe bond rate) by finding it, not by being told.

export const breakevenProps = z.object({
  label: z.string(),
  rows: z.array(z.object({ x: z.number(), value: z.number() })).describe("A calculate_range Query's rows over the variable the Slider controls"),
  target: z.number().describe("The value the rows cross, e.g. the cash figure"),
  control: reactive(z.number()),
  tolerance: z.number().optional().describe("How close, in the control's own units, counts as found. Default: 1% of the range"),
  marker: z.union([z.number(), z.string()]).optional().describe('A sourced reference on the track: a number, or Case Data "caseId/datasetId" (its latest point)'),
  markerLabel: z.string().optional(),
  unit: z.string().optional().describe('Added after the found figure, e.g. "%"'),
});

export type Row = { x: number; value: number };

/** The first x at which the rows cross `target`, by linear interpolation between neighbouring rows; null when they never cross. */
export function findBreakeven(rows: readonly Row[], target: number): number | null {
  const points = rows.filter((r) => Number.isFinite(r.x) && Number.isFinite(r.value)).sort((a, b) => a.x - b.x);
  if (!Number.isFinite(target)) return null;
  for (let i = 0; i < points.length; i++) {
    const { x, value } = points[i];
    if (value === target) return x;
    const next = points[i + 1];
    if (!next) break;
    const a = value - target;
    const b = next.value - target;
    if ((a < 0 && b > 0) || (a > 0 && b < 0)) return x + ((next.x - x) * a) / (a - b);
  }
  return null;
}

export const PROXIMITY = ["Far", "Warmer", "Close", "Found it"] as const;

/** How near `control` is to the crossing: 0 Far, 1 Warmer, 2 Close, 3 Found it. */
export function proximity(control: number, crossing: number, span: number, tolerance: number): 0 | 1 | 2 | 3 {
  const distance = Math.abs(control - crossing);
  if (distance <= tolerance) return 3;
  if (distance <= span * 0.08) return 2;
  if (distance <= span * 0.25) return 1;
  return 0;
}

/** The latest value of a Case Data dataset "caseId/datasetId", or null when there is none (or it is withheld). */
function useLatestPoint(reference: string | undefined): number | null {
  const loadCase = useCaseLoad();
  const [value, setValue] = useState<number | null>(null);
  useEffect(() => {
    if (!reference) return;
    const [caseId, datasetId] = reference.split("/");
    let live = true;
    void loadCase(caseId).then((data) => {
      const latest = data?.datasets.find((d) => d.id === datasetId)?.points.at(-1)?.value;
      if (live) setValue(typeof latest === "number" ? latest : null);
    });
    return () => {
      live = false;
    };
  }, [reference, loadCase]);
  return reference ? value : null;
}

export function BreakevenView({
  label,
  rows,
  target,
  control,
  tolerance,
  marker,
  markerLabel,
  unit = "",
}: Omit<z.infer<typeof breakevenProps>, "control" | "marker"> & { control: number; marker?: number | null }) {
  const reduced = usePrefersReducedMotion();
  const xs = rows.map((r) => r.x).filter(Number.isFinite);
  const min = xs.length ? Math.min(...xs) : 0;
  const max = xs.length ? Math.max(...xs) : 0;
  const span = max - min;
  const crossing = findBreakeven(rows, target);
  const within = tolerance ?? span / 100;
  const level = crossing === null || !Number.isFinite(control) ? 0 : proximity(control, crossing, span, within);
  const [found, setFound] = useState(false);
  if (level === 3 && !found) setFound(true);

  if (!xs.length || !Number.isFinite(target)) return <p className="py-2 text-sm text-[var(--muted)]">Working out the break-even…</p>;
  if (crossing === null) {
    return (
      <p data-testid="breakeven-none" className="py-2 text-sm text-[var(--muted)]">
        No break-even between {trimmed(min)}
        {unit} and {trimmed(max)}
        {unit}.
      </p>
    );
  }

  const meter = found ? 3 : level;
  return (
    <div data-testid="breakeven" data-found={found} data-motion={reduced ? "reduced" : "full"} className="my-3">
      <p className="text-sm font-medium">{label}</p>
      <Track>
        <Marker at={along(control, min, max)} kind="now" testId="breakeven-now" label="Where your slider is" style={{ transition: reduced ? undefined : "left 160ms var(--ease-out, ease-out)" }} />
        {found && <Marker at={along(crossing, min, max)} kind="found" testId="breakeven-notch" label="Break-even" />}
        {found && typeof marker === "number" && Number.isFinite(marker) && <Marker at={along(marker, min, max)} kind="sourced" testId="breakeven-marker" label={markerLabel} />}
      </Track>
      <div className="flex justify-between text-xs tabular-nums text-[var(--muted)]">
        <span>
          {trimmed(min)}
          {unit}
        </span>
        <span>
          {trimmed(max)}
          {unit}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-1" role="meter" aria-label="How close to the break-even" aria-valuemin={0} aria-valuemax={3} aria-valuenow={meter} aria-valuetext={PROXIMITY[meter]} data-testid="breakeven-meter" data-level={meter}>
        {PROXIMITY.map((name, i) => (
          <span
            key={name}
            className="flex-1 rounded-sm px-1 py-0.5 text-center text-xs"
            style={{ background: i <= meter ? "var(--muted)" : "var(--data)", color: i <= meter ? "var(--bg)" : "var(--muted)", fontWeight: i === meter ? 600 : 400 }}
          >
            {name}
          </span>
        ))}
      </div>
      {found && (
        <p data-testid="breakeven-found" className="mt-2 flex items-center gap-2 text-sm font-medium">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="none" stroke="var(--you)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
          Break-even ≈ {trimmed(crossing)}
          {unit}
        </p>
      )}
      {found && typeof marker === "number" && markerLabel && (
        <p data-testid="breakeven-marker-label" className="text-xs text-[var(--muted)]">
          <span className="mr-1 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: "var(--src-line)" }} />
          {markerLabel}: {trimmed(marker)}
          {unit}
        </p>
      )}
    </div>
  );
}

function BreakevenBound({ props }: ComponentRenderProps<z.infer<typeof breakevenProps>>) {
  const name = `breakeven-${useId()}`;
  const field = useStateField<unknown>(name, props.control);
  const control = typeof field.value === "number" ? field.value : NaN;
  const reference = typeof props.marker === "string" ? props.marker : undefined;
  const sourced = useLatestPoint(reference);
  const marker = typeof props.marker === "number" ? props.marker : sourced;
  return <BreakevenView {...props} control={control} marker={marker} />;
}

export const Breakeven = defineComponent({
  name: "Breakeven",
  description:
    'Find the flip point: Breakeven(label, rows, target, control, tolerance?, marker?, markerLabel?, unit?). rows are a calculate_range Query\'s rows over the variable the Slider controls, control is that Slider\'s $variable, target the value the rows cross. The Learner hunts for it with a Far/Warmer/Close/Found it meter; the number shows only once found. marker is a sourced reference, a number or Case Data "caseId/datasetId". For "find the point where..." tasks, use Breakeven.',
  props: breakevenProps,
  component: BreakevenBound,
});
