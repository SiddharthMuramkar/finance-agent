"use client";

import { defineComponent, type ComponentRenderProps } from "@openuidev/react-lang";
import { useId, useState } from "react";
import { z } from "zod/v4";
import { rateMoveLines } from "@/finance/rate-change";
import { useChangeFlash, usePrefersReducedMotion } from "../wave1/motion";
import { markMove, RATE_MOVE_LABELS, RATE_MOVE_MAX, type MoveMark } from "./rate-move-marking";

// RateMove: one rate moving from old to new. A number line draws the move as an arrow, and three worked lines say it
// in points, in basis points and as a percent of the old rate, all written by the tested rateMoveLines. In practice
// mode the lines stay hidden until the Learner types the move in basis points and code marks it exactly; only then
// do the lines show, with sliders for play that move the lines, never the marked question. Rates only: no currency.

export const rateMoveProps = z.object({
  oldRate: z.number().describe("The old rate in percent: a number, or a $variable bound to a Slider"),
  newRate: z.number().describe("The new rate in percent: a number, or a $variable bound to a Slider"),
  mode: z.enum(["show", "practice"]).optional().describe("show (default): the three lines at once. practice: the Learner types the move in basis points first"),
});

type Props = { oldRate: number; newRate: number; mode?: "show" | "practice" };

/** A rate as the part writes it: to two decimals, no trailing zeros ("5.2", "5"). */
const rateText = (percent: number) => String(Math.round(percent * 100) / 100);

// The number line's drawing box: the axis runs between the margins, which leave room for the end labels.
const WIDTH = 320;
const MARGIN = 44;
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
      className="block h-auto w-full max-w-md"
    >
      <line x1={MARGIN - 16} x2={WIDTH - MARGIN + 16} y1={AXIS_Y} y2={AXIS_Y} stroke="var(--border)" strokeWidth={1.5} />
      <text x={MARGIN - 20} y={AXIS_Y + 4} textAnchor="end" fontSize={10} fill="var(--muted)">
        {rateText(start)}%
      </text>
      <text x={WIDTH - MARGIN + 20} y={AXIS_Y + 4} textAnchor="start" fontSize={10} fill="var(--muted)">
        {rateText(end)}%
      </text>
      <line x1={from} x2={from} y1={AXIS_Y - 5} y2={AXIS_Y + 5} stroke="var(--muted)" strokeWidth={1.5} />
      <line x1={to} x2={to} y1={AXIS_Y - 5} y2={AXIS_Y + 5} stroke="var(--ink)" strokeWidth={1.5} />
      {moved ? (
        <>
          <line data-testid="rate-move-arrow" x1={from} x2={to - dir * HEAD} y1={AXIS_Y - 12} y2={AXIS_Y - 12} stroke="var(--brand)" strokeWidth={2.5} strokeLinecap="round" />
          <polygon
            data-testid="rate-move-head"
            points={`${to},${AXIS_Y - 12} ${to - dir * HEAD},${AXIS_Y - 17} ${to - dir * HEAD},${AXIS_Y - 7}`}
            fill="var(--brand)"
          />
        </>
      ) : (
        <circle cx={from} cy={AXIS_Y - 12} r={4} fill="var(--brand)" />
      )}
      <text data-testid="rate-move-old" x={clampLabel(from)} y={AXIS_Y + 20} textAnchor="middle" fontSize={11} fill="var(--muted)">
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
          <span className="block text-xs text-[var(--muted)]">{RATE_MOVE_LABELS[i]}</span>
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

type Marked = { mark: MoveMark; typed: string; question: { oldRate: number; newRate: number } };

function Practice({ oldRate, newRate }: { oldRate: number; newRate: number }) {
  const id = useId();
  const [typed, setTyped] = useState("");
  const [unread, setUnread] = useState(false);
  const [marked, setMarked] = useState<Marked | null>(null);
  const [play, setPlay] = useState({ oldRate, newRate });
  const question = marked?.question ?? { oldRate, newRate };
  const check = () => {
    const mark = markMove(typed, oldRate, newRate);
    if (mark.status === "unread") {
      setUnread(true);
      return;
    }
    setMarked({ mark, typed, question: { oldRate, newRate } });
    setPlay({ oldRate, newRate });
  };
  const status = marked?.mark.status ?? (unread ? "unread" : "idle");
  const shown = marked ? play : question;
  return (
    <>
      <NumberLine oldRate={shown.oldRate} newRate={shown.newRate} />
      <div data-testid="rate-move-answer" data-status={status} className="mt-2">
        <label htmlFor={id} className="text-sm font-medium">
          The rate moves from {rateText(question.oldRate)}% to {rateText(question.newRate)}%. By how many basis points?
        </label>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input
            id={id}
            inputMode="decimal"
            value={marked ? marked.typed : typed}
            disabled={marked !== null}
            onChange={(e) => {
              setTyped(e.target.value);
              setUnread(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && typed.trim()) check();
            }}
            aria-invalid={status === "wrong" || status === "unread"}
            className="min-h-10 w-40 rounded-md border border-[var(--border)] bg-[var(--field)] px-2 text-sm tabular-nums"
          />
          {!marked && (
            <button
              type="button"
              onClick={check}
              disabled={!typed.trim()}
              className="min-h-10 rounded-md bg-[var(--brand)] px-4 text-sm font-medium text-[var(--brand-ink)] hover:bg-[var(--brand-hover)] disabled:opacity-40"
            >
              Check
            </button>
          )}
        </div>
        <p role="status" data-testid="rate-move-result" className="mt-1 text-sm">
          {status === "unread" && "Type the move as a number of basis points, like 20."}
          {status === "right" && `Right. The move is ${marked!.mark.expected}.`}
          {status === "wrong" && `Not quite. The move is ${marked!.mark.expected}.`}
          {status === "wrong" && marked!.mark.inPoints && ` ${marked!.typed.trim()} is the move in points; times 100 gives basis points.`}
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
    <figure data-testid="rate-move" data-mode={mode ?? "show"} className="my-3">
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
    'One rate moving from old to new, in percent: RateMove(oldRate, newRate, mode?). A number line with an arrow, and three lines code works out: points, basis points, percent of the old rate. mode "practice" hides the lines until the Learner types the move in basis points, which code marks.',
  props: rateMoveProps,
  component: ({ props }: ComponentRenderProps<z.infer<typeof rateMoveProps>>) => (
    <RateMoveView oldRate={typeof props.oldRate === "number" ? props.oldRate : NaN} newRate={typeof props.newRate === "number" ? props.newRate : NaN} mode={props.mode} />
  ),
});
