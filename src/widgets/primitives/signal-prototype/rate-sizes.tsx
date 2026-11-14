"use client";

// PROTOTYPE (wayfinder ticket #5, Prototype B): the Signal rates Widget, spec §6.5 "One move, three sizes", as one part
// of the OpenUI Lang Widget library, opened by the rate_move recipe in mode "call". Throwaway: it answers "what does the
// pipeline force?", it is not production.
//
// Order of the card (spec §5.6): sub, Your call, stage, controls (locked), readouts, trap sentence, Go deeper (locked),
// foot. The title is the Widget frame's. The two sliders are real Slider parts the recipe writes ($new and $old), so Reset,
// saved Widget state and the Tutor's reading of the sliders keep working; this part only draws them inside a fieldset
// that is disabled until the call. The Learner's taps are one number, $called (a bit per option), so they save as
// Widget state too. Colours are the app's theme tokens mapped to the Signal roles (no colour literals in a part).

import { defineComponent, reactive, useStateField, type ComponentRenderProps } from "@openuidev/react-lang";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { z } from "zod/v4";
import { Chip, Tag } from "@/app/primitives";
import { RATE_MOVE_LABELS } from "../wave2/rate-move-marking";
import { anchorAt, callOptions, fixed2, readouts, rulers, sizes, STAGE_MAX, STAGE_MIN, trapWords, trim, xOf, type CallOption } from "./rate-sizes-model";

const HEIGHT = 262;
const LINE_Y = 58;
const RULER_Y = [112, 152, 192];
const TRAP_Y = 232;

/** The spec's icons (§5.5), drawn with the text colour. */
function Glyph({ d, size = 15 }: { d: string; size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
      <path d={d} />
    </svg>
  );
}
const CHECK = "M3 8.5l3.2 3.2L13 5";
const ALERT = "M8 3v6.2M8 12.6v.2";
function LockGlyph() {
  return (
    <svg viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
      <rect x={3.5} y={7} width={9} height={6.5} rx={1.5} />
      <path d="M5.5 7V5.2a2.5 2.5 0 015 0V7" />
    </svg>
  );
}

const VERDICT_LOOK: Record<CallOption["verdict"], string> = {
  right: "border-[var(--success)] bg-[var(--success-tint)] text-[var(--success)]",
  careful: "border-[var(--warning)] bg-[var(--warning-tint)] text-[var(--warning)]",
};

function VerdictPill({ option }: { option: CallOption }) {
  return (
    <Tag tone={option.verdict === "right" ? "success" : "warning"} className="mr-1.5 inline-flex items-center gap-1 align-middle">
      <Glyph d={option.verdict === "right" ? CHECK : ALERT} size={13} />
      {option.pill}
    </Tag>
  );
}

/** The width of a box, measured by a ResizeObserver, so the stage is drawn at real size (spec principle 6). */
function useBoxWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const w = Math.round(el.getBoundingClientRect().width);
      if (w > 0) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** The stage (spec §6.5.2): the rate line, the gap, the two rates, three rulers and the trap row. */
function Stage({ oldRate, newRate, called }: { oldRate: number; newRate: number; called: boolean }) {
  const [ref, W] = useBoxWidth(320);
  const s = sizes(oldRate, newRate);
  const moved = s.bp !== 0;
  const xo = xOf(oldRate, W);
  const xn = xOf(newRate, W);
  const xt = xOf(s.target, W);
  const trap = trapWords(oldRate, newRate);
  const whole = Array.from({ length: STAGE_MAX - STAGE_MIN + 1 }, (_, i) => STAGE_MIN + i);
  const label = `A rate line from ${STAGE_MIN}% to ${STAGE_MAX}%: the old rate ${fixed2(oldRate)}, the new rate ${fixed2(newRate)}.${called ? ` The move is ${rulers(oldRate, newRate).map((r) => r.value).join(", ")}.` : ""}`;
  return (
    <div ref={ref} data-testid="rate-sizes-stage" className="min-w-0 rounded-xl bg-[var(--wash)] px-3.5 pb-2.5 pt-3.5">
      <svg role="img" aria-label={label} width={W} height={HEIGHT} viewBox={`0 0 ${W} ${HEIGHT}`} className="block max-w-full tabular-nums">
        <line x1={xOf(STAGE_MIN, W)} x2={xOf(STAGE_MAX, W)} y1={LINE_Y} y2={LINE_Y} stroke="var(--line)" strokeWidth={1.5} />
        {whole.map((v) => (
          <g key={v}>
            <line x1={xOf(v, W)} x2={xOf(v, W)} y1={LINE_Y - 4} y2={LINE_Y + 4} stroke="var(--line)" strokeWidth={1} />
            <text x={xOf(v, W)} y={LINE_Y + 20} textAnchor={anchorAt(xOf(v, W), W)} fontSize={12} fill="var(--muted)">
              {v}%
            </text>
          </g>
        ))}
        {moved && <rect data-testid="rate-sizes-gap" x={Math.min(xo, xn)} y={LINE_Y - 6} width={Math.abs(xn - xo)} height={12} rx={6} fill="var(--accent-line)" />}
        <circle data-testid="rate-sizes-old" cx={xo} cy={LINE_Y} r={6} fill="var(--paper)" stroke="var(--ink)" strokeWidth={2} />
        <text x={xo} y={LINE_Y - 14} textAnchor={anchorAt(xo, W)} fontSize={12.5} fill="var(--ink-2)">
          Old {fixed2(oldRate)}
        </text>
        <circle data-testid="rate-sizes-new" cx={xn} cy={LINE_Y} r={8} fill="var(--accent)" stroke="var(--paper)" strokeWidth={2} />
        <text data-key-figure="" x={xn} y={LINE_Y - 32} textAnchor={anchorAt(xn, W)} fontSize={13.5} fontWeight={500} fill="var(--ink)">
          New {fixed2(newRate)}
        </text>
        {rulers(oldRate, newRate).map((r, i) => {
          const y = RULER_Y[i];
          return (
            <g key={r.label} data-testid="rate-sizes-ruler">
              <text x={14} y={y} fontSize={12} fill="var(--muted)">
                {r.label}
              </text>
              {/* Call first (spec principle 3): the sizes are the answer, so they show only after the call. */}
              <text data-testid="rate-sizes-ruler-value" x={W - 14} y={y} textAnchor="end" fontSize={14} fontWeight={500} fill="var(--ink)">
                {called ? r.value : ""}
              </text>
              {moved && <line x1={xo} x2={xn} y1={y + 11} y2={y + 11} stroke="var(--ink)" strokeWidth={2} />}
              {r.ticks.map((v, k) => (
                <line key={k} x1={xOf(v, W)} x2={xOf(v, W)} y1={y + 6} y2={y + 16} stroke="var(--ink)" strokeWidth={k === 0 || k === r.ticks.length - 1 ? 2 : 1} />
              ))}
            </g>
          );
        })}
        {called && trap && (
          <g data-testid="rate-sizes-trap-row">
            <text x={14} y={TRAP_Y} fontSize={12} fill="var(--warning)">
              {`“${trap.quote[0].toUpperCase()}${trap.quote.slice(1)}”, read literally`}
            </text>
            <text x={W - 14} y={TRAP_Y} textAnchor="end" fontSize={14} fontWeight={500} fill="var(--warning)">
              {trap.points} pt
            </text>
            <rect x={s.pts >= 0 ? xo : xo - Math.max(2.5, Math.abs(xt - xo))} y={TRAP_Y + 7} width={Math.max(2.5, Math.abs(xt - xo))} height={9} rx={2} fill="var(--warning)" />
          </g>
        )}
      </svg>
    </div>
  );
}

type ViewProps = {
  /** The move the call asks about: the rates the Tutor set, fixed for the card. */
  fromRate: number;
  toRate: number;
  /** The rates as the sliders have them now. */
  oldRate: number;
  newRate: number;
  /** The options tapped so far, a bit each (CallOption.bit); 0 before the call. */
  mask: number;
  onTap: (option: CallOption) => void;
  control: ReactNode;
  deeper: ReactNode;
};

export function RateSizesView({ fromRate, toRate, oldRate, newRate, mask, onTap, control, deeper }: ViewProps) {
  const [last, setLast] = useState<CallOption["id"] | null>(null);
  if (![fromRate, toRate, oldRate, newRate].every(Number.isFinite)) return <p className="py-2 text-sm text-[var(--muted)]">Working out the move…</p>;
  const options = callOptions(fromRate, toRate);
  const called = mask > 0;
  const said = options.find((o) => o.id === last) ?? options.find((o) => mask & o.bit);
  const values = readouts(oldRate, newRate);
  const trap = trapWords(oldRate, newRate);
  const P = trim(Math.abs(sizes(fromRate, toRate).pts), 2);
  return (
    <figure data-testid="rate-sizes" data-called={called} className="@container my-3 grid min-w-0 gap-4 text-[var(--ink-2)]">
      <p className="text-[15px] leading-6">
        A rate goes from <strong className="font-medium text-[var(--ink)]">{trim(fromRate, 2)}%</strong> to{" "}
        <strong className="font-medium text-[var(--ink)]">{trim(toRate, 2)}%</strong>.
      </p>

      <fieldset data-testid="rate-sizes-call" className="m-0 grid min-w-0 gap-2 border-0 p-0">
        <legend className="mb-2 flex flex-wrap items-center gap-2 text-[15px] font-medium text-[var(--ink)]">
          <Tag tone="brand" className="uppercase">
            Your call
          </Tag>
          Which of these describe the move correctly? Tap each one you believe.
        </legend>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Readings of the move">
          {options.map((o) => {
            const tapped = (mask & o.bit) !== 0;
            return (
              <Chip
                key={o.id}
                data-testid="rate-sizes-option"
                data-verdict={tapped ? o.verdict : undefined}
                aria-pressed={tapped}
                onClick={() => {
                  setLast(o.id);
                  onTap(o);
                }}
                className={`min-h-10 shadow-none ${tapped ? VERDICT_LOOK[o.verdict] : ""}`.trim()}
              >
                {tapped && <Glyph d={o.verdict === "right" ? CHECK : ALERT} />}
                {o.label}
              </Chip>
            );
          })}
        </div>
        <p data-testid="rate-sizes-feedback" aria-live="polite" className="min-h-6 text-sm leading-6">
          {said && (
            <>
              <VerdictPill option={said} />
              {said.feedback}
            </>
          )}
        </p>
      </fieldset>

      <Stage oldRate={oldRate} newRate={newRate} called={called} />

      <div data-testid="rate-sizes-controls" data-locked={!called} className="grid gap-1">
        {/* A disabled fieldset disables every input and button inside it, the Slider part's among them (spec §5.9 "Lockable group"). */}
        <fieldset disabled={!called} className="m-0 min-w-0 border-0 p-0 disabled:opacity-50">
          {control}
        </fieldset>
        {!called && (
          <p className="flex items-center gap-1.5 text-[13.5px] text-[var(--muted)]">
            <LockGlyph />
            Tap an answer to unlock the rate.
          </p>
        )}
      </div>

      <dl data-testid="rate-sizes-readouts" className="m-0 grid grid-cols-1 overflow-hidden rounded-xl border border-[var(--rule)] @min-[420px]:grid-cols-3">
        {RATE_MOVE_LABELS.map((label, i) => (
          <div key={label} className="border-[var(--rule)] px-3 py-2.5 not-first:border-t @min-[420px]:not-first:border-l @min-[420px]:not-first:border-t-0">
            <dt className="text-[13px] text-[var(--muted)]">{label}</dt>
            <dd data-testid="rate-sizes-readout" className="m-0 text-xl font-medium tabular-nums text-[var(--ink)]">
              {called ? values[i] : <span className="text-[var(--faint)]">?</span>}
            </dd>
          </div>
        ))}
      </dl>

      {called && trap && (
        <p data-testid="rate-sizes-trap" className="text-sm leading-6">
          <Tag tone="warning" className="mr-1.5 inline-flex items-center gap-1 align-middle">
            <Glyph d={ALERT} size={13} />
            Careful
          </Tag>
          Read literally, {`“${trap.quote}”`} is {trap.percent}% of the old {trap.old}%: a move of only{" "}
          <strong className="font-medium text-[var(--ink)]">{trap.points} points</strong>, to {trap.to}%.
        </p>
      )}

      <section
        data-testid="rate-sizes-deeper"
        data-open={called}
        className={called ? "grid gap-3 rounded-xl bg-[var(--accent-tint)] px-4 py-3.5" : "rounded-xl bg-[var(--wash)] px-4 py-3 text-sm text-[var(--muted)]"}
      >
        <p className="flex flex-wrap items-center gap-2">
          <Tag tone="brand" className="uppercase">
            Go deeper
          </Tag>
          {!called && (
            <>
              <LockGlyph />
              Opens after your call.
            </>
          )}
          {called && <span className="font-medium text-[var(--ink)]">Change where the rate starts.</span>}
        </p>
        {called && (
          <>
            <p className="text-sm leading-6">The same {P}-point move is a bigger percent of a low rate and a smaller percent of a high one.</p>
            {deeper}
          </>
        )}
      </section>

      <footer className="grid gap-1 border-t border-[var(--rule)] pt-3 text-[13px] text-[var(--muted)]">
        <ul aria-label="How to read the colours" className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0">
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-3 w-3 rounded-full border-[3px] border-[var(--accent)] bg-[var(--paper)]" />
            The move you set
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-3 w-3 rounded-[3px] bg-[var(--ink)]" />
            The old rate
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-3 w-3 rounded-[3px] bg-[var(--warning)]" />
            {`“${sizes(fromRate, toRate).pts >= 0 ? "Up" : "Down"} ${P}%”, read literally`}
          </li>
        </ul>
        <p className="m-0 text-xs">Worked example from the Topic. No outside figures.</p>
      </footer>
    </figure>
  );
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);

function RateSizesBound({ props, renderNode }: ComponentRenderProps) {
  const field = useStateField<unknown>(`rate-sizes-called-${useId()}`, props.called);
  const mask = typeof field.value === "number" ? field.value : 0;
  const fromRate = num(props.fromRate);
  const toRate = num(props.toRate);
  // While the sliders' $variables are not set yet (streaming), the card shows the move the call asks about.
  const oldRate = Number.isFinite(num(props.oldRate)) ? num(props.oldRate) : fromRate;
  const newRate = Number.isFinite(num(props.newRate)) ? num(props.newRate) : toRate;
  return (
    <RateSizesView
      fromRate={fromRate}
      toRate={toRate}
      oldRate={oldRate}
      newRate={newRate}
      mask={mask}
      onTap={(o) => field.setValue(mask | o.bit)}
      control={renderNode(props.control)}
      deeper={renderNode(props.deeper)}
    />
  );
}

/**
 * The part, made with the library's own Slider ref so its two slider slots take Slider parts only. library.tsx calls this
 * once with Slider.ref. The order of the props is the positional argument order, fixed once Sessions hold programs using it.
 */
export function defineRateSizes(slider: z.core.$ZodType) {
  return defineComponent({
    name: "RateSizes",
    // Short on purpose: every word here is in the Tutor's prompt, and the Tutor never writes this part (its recipe does).
    description: "Signal rates card (prototype). Only code draws it, from the rate Widget's call mode: never write it.",
    props: z.object({
      fromRate: z.number().describe("The old rate the call asks about, in percent"),
      toRate: z.number().describe("The new rate the call asks about, in percent"),
      oldRate: z.number().describe("The old rate now: the $variable the deeper Slider sets"),
      newRate: z.number().describe("The new rate now: the $variable the control Slider sets"),
      // reactive() must wrap the schema last (as QuickCheck's picked): the part writes the taps into this $variable.
      called: reactive(z.number().optional()),
      control: z.array(slider).describe("The new-rate Slider, locked until the call"),
      deeper: z.array(slider).describe("The old-rate Slider, in Go deeper, which the call opens"),
    }),
    component: RateSizesBound,
  });
}
