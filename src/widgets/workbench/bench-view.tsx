"use client";

import { useEffect, useState, type ReactNode } from "react";
import { advanceReached, savedReached } from "../guided-tasks";
import { GuidedTasksFigure } from "../guided-tasks-view";
import { SliderControl } from "../slider-control";
import {
  benchOpenings,
  type BenchHeadline as Headline,
  type BenchLever,
  type BenchNumber,
} from "./bench";

// What every Workbench Widget's view shares (spec 2026-11-12, B2 and B4): the headline with its one key number in the accent
// (F2), the numbers at rest, the levers drawn by the shared SliderControl so they land like every slider (B5), the Things to
// try that tick themselves and stay ticked, and the settings, kept here or by the caller. Plain React over a pure model, with
// no OpenUI renderer, like Value levers.

/** The headline, its figure the one key number; in coral with no key number when nothing is left or it cannot be valued. */
export function BenchHeadline({
  headline,
  warn = false,
  testId,
}: {
  headline: Headline;
  warn?: boolean;
  testId: string;
}) {
  const { before, key, after } = headline;
  if (warn) {
    return (
      <p
        data-testid={testId}
        data-nothing-left=""
        className="text-base font-medium text-[var(--danger)]"
        aria-live="polite"
      >
        {before}
        {key && <span className="text-2xl tabular-nums">{key}</span>}
        {after}
      </p>
    );
  }
  return (
    <p data-testid={testId} className="text-base" aria-live="polite">
      {before}
      {key && (
        <span
          data-key-figure=""
          className="text-2xl tabular-nums text-key-number no-underline"
        >
          {key}
        </span>
      )}
      {after}
    </p>
  );
}

/** The numbers at rest beside their labels. */
export function BenchNumbers({
  numbers,
  testId,
}: {
  numbers: readonly BenchNumber[];
  testId: string;
}) {
  if (!numbers.length) return null;
  return (
    <dl
      className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm"
      data-testid={testId}
    >
      {numbers.map((n) => (
        <div key={n.label} className="contents">
          <dt className="text-[var(--muted)]">{n.label}</dt>
          <dd className="text-right tabular-nums">{n.text}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One lever, with chips for the values its Things to try name. */
export function BenchLeverControl<Id extends string>({
  lever,
  value,
  onChange,
}: {
  lever: BenchLever<Id>;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <SliderControl
      title={lever.title}
      label={lever.label}
      caption={lever.caption}
      value={value}
      range={{ min: lever.min, max: lever.max, step: lever.step }}
      reading={lever.reading(value)}
      spoken={lever.spoken(value)}
      onChange={onChange}
      stops={lever.stops}
      chips={lever.chips.map((v) => ({
        value: v,
        label: lever.chipLabel?.(v) ?? lever.reading(v),
      }))}
      marks={lever.marks}
    />
  );
}

/**
 * The settings a Workbench shows: its own, or its caller's when it passes both `levers` and `onLeversChange` (the Widget part
 * keeps them as Widget state). `move` sets one lever; the first move is heard once through `onFirstMove`.
 */
export function useBenchSettings<Id extends string>(
  levers: readonly BenchLever<Id>[],
  given: Record<Id, number> | undefined,
  onChange: ((settings: Record<Id, number>) => void) | undefined,
  onFirstMove?: () => void,
) {
  const [own, setOwn] = useState<Record<Id, number>>(
    () => given ?? benchOpenings(levers),
  );
  const [touched, setTouched] = useState(false);
  const settings = onChange && given ? given : own;
  const move = (id: Id, value: number) => {
    if (value === settings[id]) return;
    const next = { ...settings, [id]: value };
    setOwn(next);
    onChange?.(next);
    if (!touched) {
      setTouched(true);
      onFirstMove?.();
    }
  };
  return { settings, move, touched };
}

/** How many Things to try are ticked: in order, kept once ticked, starting from those saved with the Session. */
export function useBenchTasks(
  tasks: readonly string[],
  conditions: readonly boolean[],
  ticked: readonly string[],
  onTicked?: (done: string[]) => void,
): number {
  const fromSaved = savedReached(tasks, ticked);
  const [reached, setReached] = useState(fromSaved);
  const held = Math.max(reached, fromSaved);
  const now = advanceReached(held, conditions.slice(0, tasks.length));
  if (now !== reached) setReached(now);
  const doneKey = tasks.slice(0, now).join("\n");
  const unsaved = now > fromSaved;
  useEffect(() => {
    if (onTicked && unsaved && doneKey) onTicked(doneKey.split("\n"));
  }, [onTicked, unsaved, doneKey]);
  return now;
}

/** The Things to try, last in the Widget. */
export function BenchTasks({
  tasks,
  reached,
}: {
  tasks: readonly string[];
  reached: number;
}) {
  return tasks.length ? (
    <GuidedTasksFigure tasks={[...tasks]} reached={reached} />
  ) : null;
}

/** The props every Workbench view takes beside its own data. */
export type BenchViewProps<Id extends string> = {
  /** The settings it opens at; with onLeversChange, the settings it shows (the caller keeps them). */
  levers?: Record<Id, number>;
  onLeversChange?: (levers: Record<Id, number>) => void;
  /** Things to try already ticked (saved with the Session), and how to save more. */
  ticked?: readonly string[];
  onTicked?: (done: string[]) => void;
  /** Heard once, the first time the Learner moves a lever. */
  onFirstLeverMove?: () => void;
};

/** A figure with a small caption above it: the one visual of a Workbench. */
export function BenchFigure({
  caption,
  testId,
  children,
}: {
  caption: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <figure className="mt-3" data-testid={testId}>
      <figcaption className="text-xs text-[var(--muted)]">{caption}</figcaption>
      {children}
    </figure>
  );
}

/** How a bar is painted: neutral ink, a gain in mint, a loss in coral, a figure from the market or history in sunflower. */
export type BarTone = "neutral" | "gain" | "loss" | "history";

/**
 * The family colours, here only, as the paint of a Workbench's one chart, each bar beside words that name it. They are SVG
 * fills (a chart series), never a box's background, as ADR 0015 asks of a Widget.
 */
const TONE_FILL: Record<BarTone, string> = {
  neutral: "var(--ink-2)",
  gain: "var(--mint)",
  loss: "var(--coral)",
  history: "var(--sun)",
};

export const toneFill = (tone: BarTone) => TONE_FILL[tone];

/** One row of a bar chart: a bar from `from` to `to` on a shared scale, its label beside it and its figure in its title. */
export type BarRow = {
  id: string;
  label: string;
  from: number;
  to: number;
  text: string;
  tone: BarTone;
};

/**
 * Rows of bars on one scale, each from where the last left off or from zero: a waterfall when the rows step, a stack when
 * they build. The words are the labels; each figure is in the bar's title and in the chart's accessible name.
 */
export function BarRows({
  rows,
  testId,
}: {
  rows: readonly BarRow[];
  testId: string;
}) {
  if (!rows.length) return null;
  const ends = rows.flatMap((r) => [r.from, r.to]);
  const lo = Math.min(0, ...ends);
  const hi = Math.max(0, ...ends);
  const span = hi - lo || 1;
  const at = (v: number) => ((v - lo) / span) * 100;
  return (
    <div
      role="img"
      aria-label={rows.map((r) => `${r.label}: ${r.text}`).join("; ")}
      data-testid={testId}
      className="mt-1 space-y-1"
    >
      {rows.map((r) => (
        <div
          key={r.id}
          className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] items-center gap-2 text-xs text-[var(--muted)]"
          data-row={r.id}
        >
          <span className="truncate">{r.label}</span>
          <svg
            viewBox="0 0 100 12"
            preserveAspectRatio="none"
            className="h-3 w-full overflow-visible"
            aria-hidden="true"
          >
            <line
              x1={at(0)}
              x2={at(0)}
              y1={0}
              y2={12}
              stroke="var(--border)"
              vectorEffect="non-scaling-stroke"
            />
            <rect
              x={Math.min(at(r.from), at(r.to))}
              y={2}
              width={Math.max(0.3, Math.abs(at(r.to) - at(r.from)))}
              height={8}
              fill={TONE_FILL[r.tone]}
              data-tone={r.tone}
            >
              <title>{`${r.label}: ${r.text}`}</title>
            </rect>
          </svg>
        </div>
      ))}
    </div>
  );
}
