"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { SIGN_IN_PATH } from "@/auth/destination";
import type { CaseData } from "@/case-data/case-data";
import { linearScale } from "@/widgets/plot/scales";
import { track } from "../analytics";
import { Button, Chip } from "../primitives";
import { copy } from "./copy";
import {
  GUESSES,
  KEY_STEPS,
  RATE_CHIPS,
  axisMax,
  cashFigure,
  clampRate,
  dragRate,
  dragStep,
  matchRate,
  shortMoney,
  sideOf,
  signedMoney,
  standingOf,
  worthAt,
  type CashFigure,
  type Guess,
  type HomeAnnuity,
  type Side,
  type Standing,
} from "./home-explorable-model";

// Home's Explorable (the owner's design E, 11 Nov 2026; spec 2026-11-12 E3; docs/architecture.md, "Home's Explorable").
// It reads top to bottom: a plain question, a guess before the first move, one royal rate slider with chips for 0%, 5%
// and 10%, a line that tracks where the payments stand (and the match line once the visitor finds the rate where the
// 30 payments are worth the cash), the yearly payments in today's money on an axis fixed from the first paint, then the
// total against the sourced cash option. Mint and coral say which side of the cash the annuity is on, always beside
// words that say it. Numbers come from the tested present value formula and the Case Data sent with the page; nothing
// is fetched or saved. Motion has a meaning (E9): the total counts to its new value, the bars resize and the match line
// arrives; none of it moves for a visitor who asked for reduced motion.

/** A side's colour: words in text, marks as fills. Mint and coral appear only beside words that say the side. */
const SIDE_TEXT: Record<Side, string> = { gain: "text-[var(--you)]", loss: "text-[var(--danger)]", even: "text-[var(--ink)]" };
const SIDE_FILL: Record<Side, string> = { gain: "var(--mint)", loss: "var(--coral)", even: "var(--line-strong)" };
const NO_SIDE_FILL = "var(--line-strong)";

const W = 600;
const H = 120;
/** The drawn thumb's dot, in px: the track runs from its centre at the minimum to its centre at the maximum. */
const DOT = 20;

/** Rounds a drawn coordinate so the server and the browser print the same digits (no hydration mismatch). */
const px = (v: number) => Math.round(v * 100) / 100;

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * The value shown while it counts from the last one to `target` (E9: "a number counts to its new value"), in about a
 * quarter of a second. Under reduced motion, or before the first paint, it is `target` at once.
 */
function useCountTo(target: number, ms = 280): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  const still = reducedMotion();
  useEffect(() => {
    if (still || typeof requestAnimationFrame !== "function") {
      from.current = target;
      return;
    }
    const start = performance.now();
    const a = from.current;
    let frame = 0;
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / ms);
      const v = a + (target - a) * (1 - (1 - t) ** 3);
      from.current = v;
      setShown(v);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, ms, still]);
  return still ? target : shown;
}

type Via = "drag" | "key" | "chip" | "reset";

export function HomeExplorable({ annuity, cases, signedOut = false }: { annuity: HomeAnnuity; cases: readonly CaseData[]; signedOut?: boolean }) {
  // Home opens at the slider's lowest rate (0%), not the Topic's 5%: the annuity at its full total, every bar green
  // (the owner, 12 Nov 2026; E3). Dragging the rate up is where it turns red.
  const [rate, setRate] = useState(annuity.rate.min);
  const [moved, setMoved] = useState(false);
  const [guess, setGuess] = useState<Guess | null>(null);
  const sent = useRef({ move: false, match: false });
  const titleId = useId();
  const cash = cashFigure(cases, annuity.compareTo);
  const top = useMemo(() => axisMax(annuity), [annuity]);
  const full = useMemo(() => worthAt(annuity, annuity.rate.min).worth, [annuity]);
  const match = useMemo(() => (cash ? matchRate(annuity, cash.value) : null), [annuity, cash]);
  const { rows, worth } = worthAt(annuity, rate);
  const standing: Standing | null = cash ? standingOf(worth, cash.value) : null;
  // At the match (within 1% of the cash) the payments and the cash count as the same, so the bars, the gap and the
  // comparison say "about the same" too, never "short" beside "You found it".
  const side: Side | null = !cash ? null : standing === "match" ? "even" : sideOf(worth - cash.value);
  const words = copy.widget;

  const set = (next: number, via: Via) => {
    setRate(next);
    if (via === "reset") return;
    setMoved(true);
    if (!sent.current.move) {
      sent.current.move = true;
      track("home_slider_first_move", { via });
    }
  };

  // E10: the first time the visitor finds the match, with their guess (never who they are).
  useEffect(() => {
    if (standing !== "match" || !moved || sent.current.match) return;
    sent.current.match = true;
    track("home_match_found", { guess: guess ?? "none" });
  }, [standing, moved, guess]);

  return (
    <section aria-labelledby={titleId} className="space-y-5">
      <div className="space-y-1.5">
        {/* An h2: the hero's h1 is the only heading above it, so the outline does not skip a level. */}
        <h2 id={titleId} className="text-[17px] font-medium leading-snug tracking-[-0.01em] text-[var(--ink)]">
          {words.question(shortMoney(annuity.total))}
        </h2>
        <p className="text-sm leading-relaxed text-[var(--muted)]">
          {cash
            ? words.context({ year: annuity.firstYear, payments: annuity.payments, cash: shortMoney(cash.value) })
            : words.contextNoCash({ year: annuity.firstYear, payments: annuity.payments })}
        </p>
      </div>

      {cash && !moved && <GuessAsk guess={guess} onGuess={setGuess} />}

      <RateSlider annuity={annuity} rate={rate} onDrag={(v, trackPx) => set(dragRate(annuity, v, cash?.value ?? null, dragStep(annuity, trackPx)), "drag")} onKey={(v) => set(v, "key")} onChip={(v) => set(v, "chip")} onReset={() => set(annuity.rate.min, "reset")} />

      <div data-testid="explorable-status" aria-live="polite" className="min-h-12 space-y-1.5 text-[15px] leading-snug">
        {!moved || !standing ? (
          <p className="text-[var(--muted)]">{words.start}</p>
        ) : standing === "match" && match !== null ? (
          <p data-testid="explorable-found" className="home-arrive font-medium text-[var(--ink)]">
            {words.found(match.toFixed(1))}
            {guess && (
              <span data-testid="explorable-guess" className="ml-2 font-normal text-[var(--muted)]">
                {words.guess.shown(words.guess.said[guess])}
              </span>
            )}
          </p>
        ) : (
          <p data-testid="explorable-standing" data-standing={standing} className="text-[var(--ink)]">
            {words.standing[standing === "match" ? "payments" : standing]}
          </p>
        )}
        {signedOut && (
          <a href={SIGN_IN_PATH} data-affordance="link" className="link inline-block text-sm font-medium">
            {words.signIn}
          </a>
        )}
      </div>

      <YearBars rows={rows} firstYear={annuity.firstYear} top={top} side={side} />
      <Total worth={worth} cash={cash} full={full} payments={annuity.payments} side={side} />
    </section>
  );
}

/** Before the first move: which is worth more? The tap is kept, never marked, and never in the slider's way (E3). */
function GuessAsk({ guess, onGuess }: { guess: Guess | null; onGuess: (guess: Guess) => void }) {
  const askId = useId();
  const words = copy.widget.guess;
  return (
    <div role="group" aria-labelledby={askId} data-testid="explorable-guess-ask" className="space-y-2">
      <p id={askId} className="text-sm font-medium text-[var(--ink)]">
        {words.ask}
      </p>
      <div className="flex flex-wrap gap-2">
        {GUESSES.map((g) => (
          <Chip key={g} active={guess === g} onClick={() => onGuess(g)} className="min-h-11">
            {words.options[g]}
          </Chip>
        ))}
      </div>
    </div>
  );
}

/**
 * The royal rate slider (F2, B5): a native range input (keyboard, screen readers) laid over a drawn track, fill and a
 * 44 px thumb. A drag moves in steps of 0.05 (0.1 on a track too narrow for two-pixel steps, B5) and rests on the match; arrow keys move 0.01 (0.1 with Shift), Page keys a
 * point, Home and End go to the ends. Chips set 0%, 5% and 10% in one tap; Reset returns to 0%.
 */
function RateSlider({ annuity, rate, onDrag, onKey, onChip, onReset }: { annuity: HomeAnnuity; rate: number; onDrag: (v: number, trackPx: number) => void; onKey: (v: number) => void; onChip: (v: number) => void; onReset: () => void }) {
  const { min, max, label } = annuity.rate;
  const frac = (rate - min) / (max - min);
  const at = `calc(${px(frac * 100)}% - ${px(frac * DOT - DOT / 2)}px)`;
  const keys = (e: KeyboardEvent<HTMLInputElement>) => {
    const step = e.shiftKey ? KEY_STEPS.shift : KEY_STEPS.arrow;
    const by: Record<string, number> = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step, PageDown: -KEY_STEPS.page, PageUp: KEY_STEPS.page };
    if (e.key === "Home") onKey(min);
    else if (e.key === "End") onKey(max);
    else if (e.key in by) onKey(clampRate(annuity, rate + by[e.key]));
    else return;
    e.preventDefault();
  };
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-[var(--muted)]">{copy.widget.rate}</span>
        <span data-testid="explorable-rate" className="font-medium tabular-nums text-[var(--ink)]">
          {rate.toFixed(2)}%
        </span>
      </div>
      <div className="relative h-11">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[var(--line)]" />
        <div data-slider-fill className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[var(--accent)]" style={{ width: at }} />
        <input
          type="range"
          min={min}
          max={max}
          step="any"
          value={rate}
          aria-label={label}
          aria-valuetext={`${rate.toFixed(2)} percent`}
          onChange={(e) => onDrag(Number(e.target.value), e.target.getBoundingClientRect().width)}
          onKeyDown={keys}
          className="peer absolute inset-0 z-10 w-full cursor-pointer opacity-0"
        />
        <div data-slider-thumb className="pointer-events-none absolute top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full peer-focus-visible:outline-2 peer-focus-visible:outline-offset-[-10px] peer-focus-visible:outline-[var(--ring)]" style={{ left: at }}>
          <span className="block size-5 rounded-full border-2 border-[var(--frame)] bg-[var(--accent)]" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {RATE_CHIPS.map((c) => (
          <Chip key={c} active={rate === c} onClick={() => onChip(c)} className="min-h-11 min-w-11 tabular-nums">
            {copy.widget.chip(c)}
          </Chip>
        ))}
        <Button variant="secondary" size="sm" onClick={onReset} className="ml-auto min-h-11">
          {copy.widget.reset}
        </Button>
      </div>
    </div>
  );
}

/**
 * The parts: one bar per payment, what it is worth today, on a value axis fixed from the first paint at the tallest bar
 * at 0% in round numbers (E3), so the bars visibly shrink and grow under it; hover reads a bar.
 */
function YearBars({ rows, firstYear, top, side }: { rows: { year: number; presentValue: number }[]; firstYear: number; top: number; side: Side | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const y = linearScale(0, top, H, 0);
  const n = rows.length;
  const step = W / n;
  const pick = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    setHover(Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - box.left) / box.width) * n))));
  };
  const read = hover === null ? null : rows[hover];
  const fill = side ? SIDE_FILL[side] : NO_SIDE_FILL;
  return (
    <div>
      <div className="relative">
        <span data-testid="explorable-axis" className="absolute -top-1 left-0 text-[11px] tabular-nums text-[var(--faint)]">
          {shortMoney(top)}
        </span>
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 block w-full overflow-visible" role="img" aria-label={copy.widget.barsHint}>
          <line x1={0} x2={W} y1={0} y2={0} strokeWidth={1} vectorEffect="non-scaling-stroke" className="stroke-[var(--rule)]" />
          {rows.map((r, i) => (
            <rect
              key={i}
              data-testid="explorable-bar"
              data-side={side ?? undefined}
              x={px(i * step + step * 0.18)}
              width={px(step * 0.64)}
              y={px(y(r.presentValue))}
              height={px(H - y(r.presentValue))}
              style={{ fill }}
              className="transition-[y,height,fill] duration-200 ease-out motion-reduce:transition-none"
              opacity={hover !== null && hover !== i ? 0.35 : 1}
            />
          ))}
          <line x1={0} x2={W} y1={H} y2={H} strokeWidth={1} vectorEffect="non-scaling-stroke" className="stroke-[var(--line)]" />
          <rect x={0} y={0} width={W} height={H} fill="transparent" onPointerMove={pick} onPointerDown={pick} onPointerLeave={() => setHover(null)} />
        </svg>
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-[var(--faint)]">
        <span>{firstYear}</span>
        <span>{firstYear + Math.floor((n - 1) / 2)}</span>
        <span>{firstYear + n - 1}</span>
      </div>
      <p className="mt-2 min-h-5 text-xs tabular-nums text-[var(--muted)]">
        {read ? copy.widget.barRead({ year: firstYear + read.year, worth: shortMoney(read.presentValue) }) : copy.widget.barsHint}
      </p>
    </div>
  );
}

/**
 * The whole: the annuity's worth today as the one key figure (F2: the Widget's one key number, in the key-number blue,
 * over 20 px and never underlined), counting to each new value, the gap to the cash in red or
 * green, and the comparison: two labelled bars on one scale, the 30 payments in today's money and the cash now (E3).
 */
function Total({ worth, cash, full, payments, side }: { worth: number; cash: CashFigure | null; full: number; payments: number; side: Side | null }) {
  const shown = useCountTo(worth);
  const gap = cash ? worth - cash.value : null;
  return (
    <div className="space-y-5 border-t border-[var(--rule)] pt-5">
      <div>
        <p data-testid="explorable-worth" data-key-figure="" className="text-[clamp(32px,3.4vw,40px)] font-semibold leading-none tabular-nums tracking-[-0.03em] text-key-number">
          {shortMoney(shown)}
        </p>
        {cash && gap !== null && side && (
          <p data-testid="explorable-gap" data-side={side} className="mt-3 text-sm tabular-nums">
            <span className={`font-medium ${SIDE_TEXT[side]}`}>{signedMoney(gap)}</span>
            <span className="text-[var(--muted)]"> {copy.widget.gap[side]}</span>
          </p>
        )}
      </div>
      {cash && side && (
        <div data-testid="explorable-meter" className="space-y-3">
          <MeterRow label={copy.widget.paymentsNow} value={shortMoney(worth)} share={worth / full} fill={SIDE_FILL[side]} part="payments" />
          <MeterRow label={copy.widget.cashNow} value={shortMoney(cash.value)} share={cash.value / full} fill="var(--ink)" part="cash" />
        </div>
      )}
      {cash && (
        <p className="text-xs text-[var(--muted)]">
          {copy.widget.totalNote(payments)}{" "}
          <a href={cash.sourceUrl} target="_blank" rel="noreferrer" data-affordance="link" className="link">
            {copy.widget.source(cash.source)}
          </a>
        </p>
      )}
    </div>
  );
}

/** One part of the comparison: its label and figure over a bar whose length is its share of the payments at 0%. */
function MeterRow({ label, value, share, fill, part }: { label: string; value: string; share: number; fill: string; part: "payments" | "cash" }) {
  return (
    <div data-meter-part={part}>
      <p className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-[var(--muted)]">{label}</span>
        <span className="font-medium tabular-nums text-[var(--ink)]">{value}</span>
      </p>
      <div className="mt-1 h-2.5 w-full" aria-hidden="true">
        <div className="h-full transition-[width,background-color] duration-200 ease-out motion-reduce:transition-none" style={{ width: `${px(Math.min(1, Math.max(0, share)) * 100)}%`, background: fill, opacity: part === "payments" && fill === "var(--coral)" ? 0.75 : 1 }} />
      </div>
    </div>
  );
}
