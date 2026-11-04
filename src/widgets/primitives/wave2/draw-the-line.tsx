"use client";

import { defineComponent, reactive, useStateField, type ComponentRenderProps } from "@openuidev/react-lang";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { z } from "zod/v4";
import type { CaseDataset } from "@/case-data/case-data";
import { formatValue } from "../../case-data-view";
import { useCaseLoad } from "../../case-data-provider";
import { dateMs } from "../../plot/scales";
import { trimmed } from "../wave1/format";
import { usePrefersReducedMotion } from "../wave1/motion";
import { arrowStep } from "./shared";

// DrawTheLine: the chart shows history up to a date, and the Learner draws what they think happened next, one
// slice of time at a time, then presses "Show me what happened". The drawing is written to Widget state as it is
// made, before anything is revealed, so a saved note shows the guess beside the outcome. The reveal follows the
// as-of rules: the server never sends a point dated after the Case's as-of date until the Topic's reveal has been
// shown, so until then this part has nothing to reveal and says so. It never holds the outcome early (ADR 0001).

export const drawTheLineProps = z.object({
  dataset: z.string().describe('A Case Data reference, "caseId/datasetId", from the list code sent you'),
  from: z.string().optional().describe("The date the history stops and the drawing starts (YYYY-MM-DD). Default: the Case's as-of date"),
  prompt: z.string().optional().describe('What to draw, e.g. "Draw the next five years"'),
  drawn: reactive(z.array(z.number().nullable())).optional().describe("A $variable that keeps the drawing in Widget state"),
});

export const SLICES = 8;
const W = 600;
const H = 220;
const PAD = 14;
const HISTORY_W = 400;
const SLICE_W = (W - HISTORY_W) / SLICES;

type Point = { date: string; value: number };

/** The points up to and including `from`, and those after it. */
export function splitHistory(points: readonly Point[], from: string): { history: Point[]; future: Point[] } {
  return { history: points.filter((p) => p.date <= from), future: points.filter((p) => p.date > from) };
}

/** The drawing's span is half as long as the history shown, so the horizon never depends on what is withheld. */
export function horizonMs(history: readonly Point[]): number {
  if (history.length < 2) return 0;
  return (dateMs(history[history.length - 1].date) - dateMs(history[0].date)) / 2;
}

/** The record's value at time `ms`, by straight lines between its points; null when the record does not reach that far. */
export function valueAt(points: readonly Point[], ms: number): number | null {
  if (!points.length) return null;
  const times = points.map((p) => dateMs(p.date));
  if (ms < times[0]) return null;
  for (let i = 0; i < points.length; i++) {
    if (times[i] === ms) return points[i].value;
    const next = points[i + 1];
    if (next && ms > times[i] && ms < times[i + 1]) return points[i].value + ((points[i + 1].value - points[i].value) * (ms - times[i])) / (times[i + 1] - times[i]);
  }
  return null;
}

/** What actually happened at the end of each slice of the drawing (null where the record stops short). */
export function actualSlices(history: readonly Point[], future: readonly Point[], slices = SLICES): (number | null)[] {
  if (!history.length) return Array(slices).fill(null);
  const t1 = dateMs(history[history.length - 1].date);
  const horizon = horizonMs(history);
  const joined = [history[history.length - 1], ...future];
  return Array.from({ length: slices }, (_, i) => valueAt(joined, t1 + (horizon * (i + 1)) / slices));
}

/** How far the drawing sat from what happened, on average, in a sentence code writes. */
export function gapLine(drawn: readonly (number | null)[], actual: readonly (number | null)[]): string {
  const gaps = drawn.flatMap((g, i) => {
    const a = actual[i];
    return typeof g === "number" && typeof a === "number" && a !== 0 ? [((g - a) / Math.abs(a)) * 100] : [];
  });
  if (!gaps.length) return "There is not enough of the record to compare with your line.";
  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  if (Math.abs(mean) < 1) return "Your line was within 1% of what happened, on average.";
  return `Your line was ${trimmed(Math.abs(mean), 0)}% ${mean < 0 ? "below" : "above"} what happened, on average.`;
}

type View = {
  dataset: CaseDataset;
  asOf: string;
  from?: string;
  prompt?: string;
  drawn: (number | null)[];
  onDraw: (next: (number | null)[]) => void;
};

export function DrawTheLineView({ dataset, asOf, from, prompt, drawn, onDraw }: View) {
  const id = useId();
  const reduced = usePrefersReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const columns = useRef<(HTMLDivElement | null)[]>([]);
  const dragging = useRef(false);
  const [shown, setShown] = useState(false);
  const [active, setActive] = useState(0);
  useEffect(() => {
    const stop = () => {
      dragging.current = false;
    };
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, []);

  const { unit } = dataset;
  const cut = from || asOf;
  const { history, future } = splitHistory(dataset.points, cut);
  if (history.length < 2) return <p className="py-2 text-sm text-[var(--muted)]">There is not enough history to draw from.</p>;

  const actual = actualSlices(history, future);
  const known = actual.some((a) => a !== null);
  const values = history.map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.6;
  const revealedValues = shown && known ? actual.filter((a): a is number => a !== null) : [];
  const dLo = Math.min(lo >= 0 ? Math.max(0, lo - pad) : lo - pad, ...revealedValues);
  const dHi = Math.max(hi + pad, ...revealedValues);
  const y = (v: number) => H - PAD - ((v - dLo) / (dHi - dLo || 1)) * (H - 2 * PAD);
  const valueOf = (py: number) => dLo + ((H - PAD - py) / (H - 2 * PAD)) * (dHi - dLo);
  const t0 = dateMs(history[0].date);
  const t1 = dateMs(history[history.length - 1].date);
  const x = (ms: number) => ((ms - t0) / (t1 - t0 || 1)) * HISTORY_W;
  const path = history.map((p, i) => `${i ? "L" : "M"}${x(dateMs(p.date)).toFixed(1)} ${y(p.value).toFixed(1)}`).join("");
  const sliceX = (i: number) => HISTORY_W + SLICE_W * (i + 0.5);
  const line = (vals: (number | null)[]) =>
    vals.flatMap((v, i) => (typeof v === "number" ? [`${i === 0 || typeof vals[i - 1] !== "number" ? "M" : "L"}${sliceX(i).toFixed(1)} ${y(v).toFixed(1)}`] : [])).join("");
  const anchor = `M${HISTORY_W} ${y(history[history.length - 1].value).toFixed(1)}`;
  const complete = drawn.length === SLICES && drawn.every((v) => typeof v === "number");
  const stepSize = (dHi - dLo) / 40;
  const lastValue = history[history.length - 1].value;

  const set = (i: number, v: number) => {
    const next = Array.from({ length: SLICES }, (_, k) => drawn[k] ?? null);
    next[i] = Math.min(dHi, Math.max(dLo, v));
    onDraw(next);
  };
  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0 || shown) return;
    const fx = ((e.clientX - rect.left) / rect.width) * W;
    if (fx < HISTORY_W) return;
    const i = Math.min(SLICES - 1, Math.floor((fx - HISTORY_W) / SLICE_W));
    set(i, valueOf(((e.clientY - rect.top) / rect.height) * H));
    setActive(i);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>, i: number) => {
    if (shown) return;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const base = drawn[i] ?? [...drawn.slice(0, i)].reverse().find((v): v is number => typeof v === "number") ?? lastValue;
      set(i, base + (e.key === "ArrowUp" ? 1 : -1) * stepSize);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const to = Math.min(SLICES - 1, Math.max(0, i + (arrowStep(e.key) ?? 0)));
      setActive(to);
      columns.current[to]?.focus();
    }
  };

  const span = `${history[0].date} to ${history[history.length - 1].date}`;
  return (
    <figure data-testid="draw-the-line" data-shown={shown} data-complete={complete} data-motion={reduced ? "reduced" : "full"} className="my-3">
      <figcaption id={`${id}-p`} className="text-sm font-medium">
        {prompt ?? "Draw what you think happened next"}
      </figcaption>
      <p className="text-xs text-[var(--muted)]">
        {dataset.label}, {span}. Drag across the open space on the right, or focus a slice and use the up and down arrow keys.
      </p>
      <div
        ref={box}
        className="relative mt-1 touch-none select-none"
        style={{ aspectRatio: `${W} / ${H}` }}
        onPointerDown={(e) => {
          dragging.current = true;
          fromPointer(e);
        }}
        onPointerMove={(e) => {
          if (dragging.current) fromPointer(e);
        }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
          <rect x={HISTORY_W} y={0} width={W - HISTORY_W} height={H} fill="var(--you-tint)" />
          <line x1={HISTORY_W} x2={HISTORY_W} y1={0} y2={H} stroke="var(--border)" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
          <path d={path} fill="none" stroke="var(--muted)" strokeWidth={2} vectorEffect="non-scaling-stroke" data-testid="draw-history" />
          {drawn.some((v) => typeof v === "number") && (
            <path d={`${anchor}${line(drawn).replace(/^M/, "L")}`} fill="none" stroke="var(--you)" strokeWidth={2} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" data-testid="draw-guess" />
          )}
          {shown && known && <path d={`${anchor}${line(actual).replace(/^M/, "L")}`} fill="none" stroke="var(--src)" strokeWidth={2} vectorEffect="non-scaling-stroke" data-testid="draw-actual" />}
        </svg>
        {Array.from({ length: SLICES }, (_, i) => (
          <div
            key={i}
            ref={(el) => {
              columns.current[i] = el;
            }}
            role="slider"
            tabIndex={i === active ? 0 : -1}
            aria-label={`Slice ${i + 1} of ${SLICES} of the drawing`}
            aria-orientation="vertical"
            aria-valuemin={Math.round(dLo)}
            aria-valuemax={Math.round(dHi)}
            aria-valuenow={typeof drawn[i] === "number" ? Math.round(drawn[i] as number) : undefined}
            aria-valuetext={typeof drawn[i] === "number" ? formatValue(drawn[i] as number, unit) : "Not drawn yet"}
            aria-disabled={shown}
            data-testid="draw-slice"
            data-drawn={typeof drawn[i] === "number"}
            onKeyDown={(e) => onKey(e, i)}
            onFocus={() => setActive(i)}
            className="absolute top-0 h-full outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-line)]"
            style={{ left: `${((HISTORY_W + SLICE_W * i) / W) * 100}%`, width: `${(SLICE_W / W) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between text-xs tabular-nums text-[var(--muted)]">
        <span>{history[0].date}</span>
        <span>{history[history.length - 1].date}</span>
      </div>
      {!shown ? (
        <button
          type="button"
          disabled={!complete}
          onClick={() => setShown(true)}
          className="mt-2 min-h-10 rounded-md bg-[var(--brand)] px-4 text-sm font-medium text-[var(--brand-ink)] hover:bg-[var(--brand-hover)] disabled:opacity-40 disabled:hover:bg-[var(--brand)]"
        >
          Show me what happened
        </button>
      ) : (
        <p role="status" data-testid="draw-result" className="mt-2 text-sm">
          {known ? (
            gapLine(drawn, actual)
          ) : (
            <span data-testid="draw-withheld" className="text-[var(--muted)]">
              What happened next is revealed when the story reaches its reveal. Your line is saved.
            </span>
          )}
        </p>
      )}
    </figure>
  );
}

function DrawTheLineBound({ props }: ComponentRenderProps<z.infer<typeof drawTheLineProps>>) {
  const name = `draw-${useId()}`;
  const field = useStateField<unknown>(name, props.drawn);
  const [local, setLocal] = useState<(number | null)[]>([]);
  const loadCase = useCaseLoad();
  const [loaded, setLoaded] = useState<{ dataset: CaseDataset; asOf: string } | null | undefined>(undefined);
  const [caseId, datasetId] = props.dataset.split("/");
  useEffect(() => {
    let live = true;
    void loadCase(caseId).then((data) => {
      const dataset = data?.datasets.find((d) => d.id === datasetId);
      if (live) setLoaded(data && dataset ? { dataset, asOf: data.asOf } : null);
    });
    return () => {
      live = false;
    };
  }, [caseId, datasetId, loadCase]);

  const saved = Array.isArray(field.value) ? (field.value as unknown[]).map((v) => (typeof v === "number" ? v : null)) : null;
  const drawn = local.length ? local : (saved ?? []);
  if (loaded === undefined) return <p className="py-6 text-sm text-[var(--muted)]">Fetching sourced data…</p>;
  if (loaded === null) return <p className="py-2 text-sm text-[var(--muted)]">No data for {props.dataset}.</p>;
  return (
    <DrawTheLineView
      dataset={loaded.dataset}
      asOf={loaded.asOf}
      from={props.from}
      prompt={props.prompt}
      drawn={drawn}
      onDraw={(next) => {
        setLocal(next);
        field.setValue(next);
      }}
    />
  );
}

export const DrawTheLine = defineComponent({
  name: "DrawTheLine",
  description:
    "The Learner draws what they think happened next, then sees the record: DrawTheLine(dataset, from?, prompt?, drawn?). dataset is a Case Data reference; the chart shows its history up to the as-of date and the Learner draws eight slices of what follows. drawn is an optional $variable that keeps the drawing in Widget state. The reveal follows the as-of rules and ends in a sentence code writes. Use it to predict from history.",
  props: drawTheLineProps,
  component: DrawTheLineBound,
});
