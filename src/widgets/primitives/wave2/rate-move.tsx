"use client";

import { defineComponent, type ComponentRenderProps } from "@openuidev/react-lang";
import { useId, useMemo, useState } from "react";
import { z } from "zod/v4";
import { rateMoveLines } from "@/finance/rate-change";
import { useChangeFlash, usePrefersReducedMotion } from "../wave1/motion";
import { markReading, moveReadings, RATE_MOVE_LABELS, RATE_MOVE_MAX, type ReadingMark } from "./rate-move-marking";

// RateMove: one rate moving from old to new. A number line draws the move as an arrow, and three worked lines say it
// in points, in basis points and as a percent of the old rate, all written by the tested rateMoveLines. In practice
// mode the lines stay hidden until the Learner taps the right reading of the move (the right one, the x10 slip and
// the percent mix-up, ADR 0009) and code marks the tap; only then do the lines show, with sliders for play that move
// the lines, never the marked question. Nothing is typed. Rates only: no currency.

export const rateMoveProps = z.object({
  oldRate: z.number().describe("The old rate in percent: a number, or a $variable bound to a Slider"),
  newRate: z.number().describe("The new rate in percent: a number, or a $variable bound to a Slider"),
  mode: z.enum(["show", "practice"]).optional().describe("show (default): the three lines at once. practice: the Learner types the move in basis points first"),
});

type Props = { oldRate: number; newRate: number; mode?: "show" | "practice" };

/** A rate as the part writes it: to two decimals, no trailing zeros ("5.2", "5"). */
const rateText = (percent: number) => String(Math.round(percent * 100) / 100);

// The number line's drawing box: the axis runs between the margins, which leave room for the end labels. The widest
// end label the 0-20 sliders make is 6 characters ("10.25%", "24.99%"): about 3.8em, since "%" is ~0.95em, so 38 units
// at font size 10. Each end label sits 20 units outside the axis, so MARGIN 64 leaves 44 units: about 6 to spare.
const WIDTH = 320;
const MARGIN = 64;
const AXIS_Y = 38;
const HEAD = 8;

/** Where the axis starts and ends: the two rates with a quarter of the move (at least 0.25 points) either side, never below 0%. */
function axisRange(a: number, b: number): [number, number] {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const pad = Math.max((hi - lo) / 4, 0.25);
  return [Math.max(0, lo - pad), hi + pad];
}

/** A label's x, kept inside the box so its middle-anchored text is never cut off. */
const clampLabel = (x: number) => Math.min(WIDTH - MARGIN + 8, Math.max(MARGIN - 8, x));

function NumberLine({ oldRate, newRate }: { oldRate: number; newRate: number }) {
  const [start, end] = axisRange(oldRate, newRate);
  const x = (v: number) => MARGIN + ((v - start) / (end - start)) * (WIDTH - 2 * MARGIN);
  const from = x(oldRate);
  const to = x(newRate);
  const moved = Math.round(oldRate * 100) !== Math.round(newRate * 100);
  const dir = newRate > oldRate ? 1 : -1;
  // Accents by meaning (spec 2026-11-05 accent meanings, #471): a rise is a gain (mint), a fall a loss (coral); the Old
  // rate is history (sunflower ink). No move keeps the brand dot.
  const moveInk = dir > 0 ? "var(--mint)" : "var(--coral)";
  const label = moved
    ? `A number line: the rate moves from ${rateText(oldRate)}% ${dir > 0 ? "up" : "down"} to ${rateText(newRate)}%.`
    : `A number line: the rate stays at ${rateText(oldRate)}%.`;
  return (
    <svg
      data-testid="rate-move-line"
      data-direction={moved ? (dir > 0 ? "rise" : "fall") : "none"}
      role="img"
      aria-label={label}
      viewBox={`0 0 ${WIDTH} 72`}
      className="block h-auto w-full max-w-md @min-[720px]:max-w-none"
    >
      <line x1={MARGIN - 16} x2={WIDTH - MARGIN + 16} y1={AXIS_Y} y2={AXIS_Y} stroke="var(--border)" strokeWidth={1.5} />
      <text x={MARGIN - 20} y={AXIS_Y + 4} textAnchor="end" fontSize={10} fill="var(--muted)">
        {rateText(start)}%
      </text>
      <text x={WIDTH - MARGIN + 20} y={AXIS_Y + 4} textAnchor="start" fontSize={10} fill="var(--muted)">
        {rateText(end)}%
      </text>
      <line data-testid="rate-move-old-tick" x1={from} x2={from} y1={AXIS_Y - 5} y2={AXIS_Y + 5} stroke="var(--sun-ink)" strokeWidth={1.5} />
      <line x1={to} x2={to} y1={AXIS_Y - 5} y2={AXIS_Y + 5} stroke="var(--ink)" strokeWidth={1.5} />
      {moved ? (
        <>
          <line data-testid="rate-move-arrow" x1={from} x2={to - dir * HEAD} y1={AXIS_Y - 12} y2={AXIS_Y - 12} stroke={moveInk} strokeWidth={2.5} strokeLinecap="round" />
          <polygon
            data-testid="rate-move-head"
            points={`${to},${AXIS_Y - 12} ${to - dir * HEAD},${AXIS_Y - 17} ${to - dir * HEAD},${AXIS_Y - 7}`}
            fill={moveInk}
          />
        </>
      ) : (
        <circle cx={from} cy={AXIS_Y - 12} r={4} fill="var(--brand)" />
      )}
      <text data-testid="rate-move-old" x={clampLabel(from)} y={AXIS_Y + 20} textAnchor="middle" fontSize={11} fill="var(--sun-ink)">
        Old {rateText(oldRate)}%
      </text>
      <text data-testid="rate-move-new" x={clampLabel(to)} y={AXIS_Y - 24} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--ink)">
        New {rateText(newRate)}%
      </text>
    </svg>
  );
}

function Readouts({ oldRate, newRate }: { oldRate: number; newRate: number }) {
  const reduced = usePrefersReducedMotion();
  const lines = rateMoveLines(oldRate, newRate);
  const fresh = useChangeFlash(lines.join("|"), reduced);
  return (
    <ol className="mt-2 space-y-1" style={{ opacity: fresh ? 0.35 : 1, transition: reduced ? undefined : "opacity 160ms var(--ease-out, ease-out)" }}>
      {lines.map((line, i) => (
        <li key={RATE_MOVE_LABELS[i]} data-testid="rate-move-readout" className="text-sm leading-6">
          <span className="block text-xs text-[var(--violet-ink)]">{RATE_MOVE_LABELS[i]}</span>
          <span className="tabular-nums">{line}</span>
        </li>
      ))}
    </ol>
  );
}

function PlaySlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const id = useId();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={id} className="w-20 text-sm">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={RATE_MOVE_MAX}
        step={0.01}
        value={value}
        aria-valuetext={`${rateText(value)}%`}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-w-0 flex-1 accent-[var(--brand)]"
      />
      <span className="w-14 text-right text-sm tabular-nums">{rateText(value)}%</span>
    </div>
  );
}

type Marked = { mark: ReadingMark; tapped: string; question: { oldRate: number; newRate: number } };

function Practice({ oldRate, newRate }: { oldRate: number; newRate: number }) {
  const [marked, setMarked] = useState<Marked | null>(null);
  const [play, setPlay] = useState({ oldRate, newRate });
  const question = marked?.question ?? { oldRate, newRate };
  const readings = useMemo(() => moveReadings(question.oldRate, question.newRate, `${question.oldRate}>${question.newRate}`), [question.oldRate, question.newRate]);
  const tap = (id: string) => {
    if (marked) return;
    setMarked({ mark: markReading(readings, id), tapped: id, question: { oldRate, newRate } });
    setPlay({ oldRate, newRate });
  };
  const status = marked?.mark.status ?? "idle";
  const shown = marked ? play : question;
  const bp = Math.round((question.newRate - question.oldRate) * 100);
  const moveBp = `${Math.abs(bp)} bp${bp < 0 ? " (a fall)" : ""}`;
  return (
    <>
      <NumberLine oldRate={shown.oldRate} newRate={shown.newRate} />
      <div data-testid="rate-move-answer" data-status={status} className="mt-2">
        <p className="text-sm font-medium">
          The rate moves from {rateText(question.oldRate)}% to {rateText(question.newRate)}%. Which reading is right?
        </p>
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Readings of the move">
          {readings.choices.map((c) => (
            <button
              key={c.id}
              type="button"
              data-testid="rate-move-choice"
              aria-pressed={marked?.tapped === c.id}
              disabled={marked !== null}
              onClick={() => tap(c.id)}
              className="pressable min-h-10 rounded-md border border-[var(--border)] border-b-[3px] bg-[var(--bg)] px-3 py-1 text-sm font-medium enabled:hover:bg-[var(--hairline)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] disabled:opacity-60 aria-pressed:border-[var(--brand)] aria-pressed:bg-[var(--brand-tint)] aria-pressed:font-semibold aria-pressed:opacity-100 aria-pressed:before:content-['✓_']"
            >
              {c.text}
            </button>
          ))}
        </div>
        <p role="status" data-testid="rate-move-result" className="mt-2 text-sm">
          {status === "right" && `Right. The move is ${moveBp}.`}
          {status === "wrong" && `Not quite. The move is ${moveBp}.`}
          {status === "wrong" && marked!.mark.fix && ` ${marked!.mark.fix}`}
        </p>
      </div>
      {marked && (
        <>
          <Readouts oldRate={play.oldRate} newRate={play.newRate} />
          <div data-testid="rate-move-play" className="mt-3 space-y-1 border-t border-[var(--hairline)] pt-2">
            <p className="text-xs text-[var(--muted)]">Move the rates to see the lines change. Your answer stays marked.</p>
            <PlaySlider label="Old rate" value={play.oldRate} onChange={(v) => setPlay({ ...play, oldRate: v })} />
            <PlaySlider label="New rate" value={play.newRate} onChange={(v) => setPlay({ ...play, newRate: v })} />
          </div>
        </>
      )}
    </>
  );
}

export function RateMoveView({ oldRate, newRate, mode }: Props) {
  if (![oldRate, newRate].every(Number.isFinite)) return <p className="py-2 text-sm text-[var(--muted)]">Working out the move…</p>;
  return (
    <figure data-testid="rate-move" data-mode={mode ?? "show"} className="@container my-3">
      {mode === "practice" ? (
        <Practice oldRate={oldRate} newRate={newRate} />
      ) : (
        <>
          <NumberLine oldRate={oldRate} newRate={newRate} />
          <Readouts oldRate={oldRate} newRate={newRate} />
        </>
      )}
    </figure>
  );
}

export const RateMove = defineComponent({
  name: "RateMove",
  description:
    'One rate moving from old to new, in percent: RateMove(oldRate, newRate, mode?). A number line with an arrow, and three lines code works out: points, basis points, percent of the old rate. mode "practice" hides the lines until the Learner taps the right reading of the move, which code marks.',
  props: rateMoveProps,
  component: ({ props }: ComponentRenderProps<z.infer<typeof rateMoveProps>>) => (
    <RateMoveView oldRate={typeof props.oldRate === "number" ? props.oldRate : NaN} newRate={typeof props.newRate === "number" ? props.newRate : NaN} mode={props.mode} />
  ),
});
