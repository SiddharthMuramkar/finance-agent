"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chip } from "@/app/primitives";
import { Chevron, SecondaryButton } from "@/app/ui";
import type { ValuationBlock } from "@/finance/valuation-case";
import { advanceReached, savedReached } from "../guided-tasks";
import { GuidedTasksFigure } from "../guided-tasks-view";
import { SliderControl } from "../slider-control";
import {
  AFTER_YEAR_10_LABEL,
  CASH_FLOW_CAPTION,
  leverSpecs,
  NO_MOVES,
  NO_RUN,
  openingSettings,
  recordMove,
  sameSettings,
  storyNote,
  taskConditions,
  valueLeversModel,
  type SavedStory,
  type CashFlowBar,
  type LeverId,
  type LeverSettings,
  type Moves,
  type MoveRun,
  type Story,
  type ValueLeversModel,
} from "./value-levers-model";
import type { ValueLeversMode } from "./data-schemas";

// Value levers, drawn (spec 2026-11-12, B3): plain React over the pure view-model, with no OpenUI renderer, so Home can
// draw it signed out (section 2) and the Widget library wraps it as the ValueLevers part. Four Levers and one more under
// "More settings" feed one headline number on a bar with the price marked; story chips move every lever at once; ten bars
// of free cash flow and one for everything after year 10; two Things to try that tick themselves.

export type ValueLeversViewProps = {
  block: ValuationBlock;
  /** The settings it opens at; with onLeversChange, the settings it shows (the caller keeps them). Every lever's opening when left out. */
  levers?: LeverSettings;
  onLeversChange?: (levers: LeverSettings) => void;
  /** The story chips (valueLeversStories); those marked afterInsight show only once insightSettled. */
  stories: readonly Story[];
  /** The Things to try (valueLeversTasks), in order. */
  tasks: readonly string[];
  /** Which levers have moved the value, and which most; with onMovesChange the caller keeps it. */
  moves?: Moves;
  onMovesChange?: (moves: Moves) => void;
  /** Things to try already ticked (saved with the Session), and how to save more. */
  ticked?: readonly string[];
  onTicked?: (done: string[]) => void;
  /** Heard once, the first time the Learner moves a lever. */
  onFirstLeverMove?: () => void;
  /** Heard once, the first time a story lands within the price's tolerance. */
  onPriceFound?: () => void;
  /** The Topic's Insight is settled: the "A story worth" the price chip shows. */
  insightSettled?: boolean;
  /** A Spine Topic's mode (Appendix D): one readout swapped, or which lever is under More settings; the base Widget when left out. */
  mode?: ValueLeversMode;
  /** In market mode, which market lever 1 is a share of; with onMarketChange the caller keeps it. */
  market?: number;
  onMarketChange?: (market: number) => void;
  /** In all open mode, saves the Learner's story as a one-page note (the Topic flow wires it to the Notebook); no button without it. */
  onSaveStory?: (story: SavedStory) => Promise<boolean> | void;
  /** The Case's name for the saved note's title. */
  caseName?: string;
  /** In all open mode with a Case chip (Spine Topic 15), the company names the Learner can switch between. */
  cases?: readonly string[];
  /** Which Case is chosen (index into `cases`). */
  caseChoice?: number;
  /** Switch the Case: the caller changes the block and resets the levers. */
  onChooseCase?: (index: number) => void;
};

export function ValueLeversView({
  block,
  levers,
  onLeversChange,
  stories,
  tasks,
  moves: givenMoves,
  onMovesChange,
  ticked = [],
  onTicked,
  onFirstLeverMove,
  onPriceFound,
  insightSettled = false,
  mode,
  market: givenMarket,
  onMarketChange,
  onSaveStory,
  caseName,
  cases = [],
  caseChoice = 0,
  onChooseCase,
}: ValueLeversViewProps) {
  const specs = useMemo(() => leverSpecs(block, mode), [block, mode]);
  const [ownLevers, setOwnLevers] = useState<LeverSettings>(() => levers ?? openingSettings(specs));
  const [ownMoves, setOwnMoves] = useState<Moves>(() => givenMoves ?? NO_MOVES);
  const [ownMarket, setOwnMarket] = useState(() => givenMarket ?? 0);
  const settings = onLeversChange && levers ? levers : ownLevers;
  const moves = onMovesChange && givenMoves ? givenMoves : ownMoves;
  const market = onMarketChange && givenMarket !== undefined ? givenMarket : ownMarket;
  const run = useRef<MoveRun>(NO_RUN);
  // The Learner has moved a lever here (not just opened at saved settings).
  const [touched, setTouched] = useState(false);
  // The save's outcome for the story on screen: cleared when a lever moves, so "Saved" never sits beside a changed story.
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const model = valueLeversModel(block, specs, settings, mode, market);

  const setLevers = (next: LeverSettings) => {
    setOwnLevers(next);
    onLeversChange?.(next);
  };
  const setMoves = (next: Moves) => {
    setOwnMoves(next);
    onMovesChange?.(next);
  };
  const move = (id: LeverId, value: number) => {
    if (value === settings[id]) return;
    setSaved("idle");
    const next = { ...settings, [id]: value };
    const recorded = recordMove(moves, run.current, id, model.value, valueLeversModel(block, specs, next, mode, market).value);
    run.current = recorded.run;
    setLevers(next);
    if (recorded.moves !== moves) setMoves(recorded.moves);
    if (!touched) {
      setTouched(true);
      onFirstLeverMove?.();
    }
  };
  const setMarket = (next: number) => {
    setOwnMarket(next);
    onMarketChange?.(next);
  };
  const tell = (story: Story) => {
    run.current = NO_RUN;
    setSaved("idle");
    setLevers(story.settings);
    // A story is told on the first market, the one the Case's share is of.
    if (mode?.kind === "market" && market !== 0) setMarket(0);
  };
  const chooseMarket = (next: number) => {
    run.current = NO_RUN;
    setSaved("idle");
    setMarket(next);
  };
  // Another company: its story starts afresh, so the move under way (valued in the old Case's money) and the save's
  // outcome stay with the old one, and its first lever move is measured from its own value.
  const chooseCase = (next: number) => {
    if (next === caseChoice) return;
    run.current = NO_RUN;
    setSaved("idle");
    onChooseCase?.(next);
  };

  // Things to try tick in order and stay ticked; ticks saved with the Session come back. Held by their words, as saved
  // ticks are: a Case chip rewords the price task to the Case chosen, so its tick must be earned on that Case.
  const fromSaved = savedReached(tasks, ticked);
  const [reachedTasks, setReachedTasks] = useState<readonly string[]>(() => tasks.slice(0, fromSaved));
  const reached = savedReached(tasks, reachedTasks);
  const held = Math.max(reached, fromSaved);
  const now = advanceReached(held, taskConditions(model, moves).slice(0, tasks.length));
  if (now > reached) setReachedTasks([...new Set([...reachedTasks, ...tasks.slice(0, now)])]);
  const doneKey = tasks.slice(0, now).join("\n");
  const unsaved = now > fromSaved;
  useEffect(() => {
    if (onTicked && unsaved && doneKey) onTicked(doneKey.split("\n"));
  }, [onTicked, unsaved, doneKey]);

  // The price found: heard once, when a story the Learner set lands near the price.
  const found = useRef(false);
  const nearPrice = model.nearPrice && touched;
  useEffect(() => {
    if (!nearPrice || found.current) return;
    found.current = true;
    onPriceFound?.();
  }, [nearPrice, onPriceFound]);

  const atRest = specs.filter((s) => !s.more);
  const more = specs.filter((s) => s.more);
  const shown = stories.filter((s) => !s.afterInsight || insightSettled);
  const control = (id: LeverId) => {
    const spec = specs.find((s) => s.id === id)!;
    return (
      <SliderControl
        key={id}
        title={spec.title === spec.label ? undefined : spec.title}
        label={spec.label}
        caption={spec.caption}
        value={settings[id]}
        range={{ min: spec.min, max: spec.max, step: spec.step }}
        reading={spec.reading(settings[id])}
        spoken={spec.spoken(settings[id])}
        onChange={(value) => move(id, value)}
        stops={spec.stops}
        marks={spec.marks}
      />
    );
  };

  return (
    <div data-testid="value-levers" className="min-w-0">
      {cases.length > 1 && onChooseCase && (
        <div className="mb-2 flex flex-wrap gap-2" role="group" aria-label="Choose a company to value">
          {cases.map((name, i) => (
            <Chip key={name} state={caseChoice === i ? "showing" : "idle"} onClick={() => chooseCase(i)} className="min-h-11 min-w-11 justify-center" data-case={i}>
              {name}
            </Chip>
          ))}
        </div>
      )}
      <Headline model={model} />
      <ValueBar model={model} />
      <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm" data-testid="value-levers-numbers">
        <dt className="text-[var(--muted)]">{model.price.label}</dt>
        <dd className="text-right tabular-nums">{model.price.text}</dd>
        {model.readout ? (
          <>
            <dt className="text-[var(--muted)]">{model.readout.label}</dt>
            <dd className={`text-right tabular-nums ${model.readout.warn ? "text-[var(--danger)]" : ""}`} data-testid="value-levers-readout" data-warn={model.readout.warn ? "" : undefined}>
              {model.readout.text}
            </dd>
          </>
        ) : (
          model.afterYear10 && (
            <>
              <dt className="text-[var(--muted)]">{AFTER_YEAR_10_LABEL}</dt>
              <dd className="text-right tabular-nums">{model.afterYear10.text}</dd>
            </>
          )
        )}
      </dl>
      {model.readout?.note && <p className="mt-1 text-xs text-[var(--muted)]" data-testid="value-levers-readout-note">{model.readout.note}</p>}
      {mode?.kind === "market" && mode.markets.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Markets">
          {mode.markets.map((m, i) => (
            <Chip key={m.label} state={market === i ? "showing" : "idle"} onClick={() => chooseMarket(i)} className="min-h-11 min-w-11 justify-center" data-market={i}>
              {m.label}
            </Chip>
          ))}
        </div>
      )}
      {shown.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Stories">
          {shown.map((story) => (
            <Chip
              key={story.id}
              state={sameSettings(settings, story.settings) && (mode?.kind !== "market" || market === 0) ? "showing" : "idle"}
              onClick={() => tell(story)}
              className="min-h-11 min-w-11 justify-center"
              data-story={story.id}
              data-flagged={story.flagged ? "" : undefined}
            >
              {story.label}
            </Chip>
          ))}
        </div>
      )}
      <div className="mt-2" data-testid="value-levers-controls">
        {atRest.map((s) => control(s.id))}
      </div>
      {model.flags.length > 0 && (
        <ul className="mt-1 text-sm text-[var(--danger)]" data-testid="value-levers-flags" aria-live="polite">
          {model.flags.map((flag) => (
            <li key={flag}>Flag: {flag}</li>
          ))}
        </ul>
      )}
      {more.length > 0 && (
        <details className="group mt-1 border-t border-[var(--hairline)] pt-1" data-testid="value-levers-more" open={mode?.kind === "all_open" || undefined}>
          {/* The chevron is the summary's signifier (A3b), and turns a quarter turn when open. */}
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm text-[var(--ink-2)] [&::-webkit-details-marker]:hidden">
            <Chevron />
            More settings
          </summary>
          {more.map((s) => control(s.id))}
        </details>
      )}
      <CashFlowBars bars={model.cashFlows} />
      {mode?.kind === "all_open" && onSaveStory && (
        <div className="mt-2 flex items-center gap-3">
          <SecondaryButton
            onClick={async () => {
              setSaved("saving");
              const result = await onSaveStory(storyNote(block, specs, settings, model, caseName));
              setSaved(result === false ? "failed" : "saved");
            }}
            disabled={saved === "saving" || saved === "saved"}
            data-testid="value-levers-save"
          >
            Save my story
          </SecondaryButton>
          {(saved === "saved" || saved === "failed") && (
            <span className="text-sm text-[var(--muted)]" role="status">
              {saved === "saved" ? "Saved to your Notebook" : "Not saved. Try again."}
            </span>
          )}
        </div>
      )}
      {tasks.length > 0 && <GuidedTasksFigure tasks={[...tasks]} reached={now} />}
    </div>
  );
}

/** "Your story is worth $35 a share", its figure the one key number; "$0: lenders and option holders take everything" in coral. */
function Headline({ model }: { model: ValueLeversModel }) {
  const { before, key, after } = model.headline;
  if (model.nothingLeft) {
    return (
      <p data-testid="value-levers-headline" data-nothing-left="" className="text-base font-medium text-[var(--danger)]" aria-live="polite">
        <span className="text-2xl tabular-nums">{key}</span>
        {after}
      </p>
    );
  }
  return (
    <p data-testid="value-levers-headline" className="text-base" aria-live="polite">
      {before}
      {key && (
        <span data-key-figure="" className="text-2xl tabular-nums text-key-number no-underline">
          {key}
        </span>
      )}
      {after}
    </p>
  );
}

/**
 * The value on a bar from nothing to barTop, with the price marked in sunflower (history); full above the top. In range mode
 * a shaded span shows the range, so the price marker reads as inside, left of, or right of it. The accessible name calls the
 * mark by the Case's own word for it, as the screen does: "the talk of $40bn" for Uber's 2014 talk, which nobody paid.
 */
function ValueBar({ model }: { model: ValueLeversModel }) {
  const { bar, price, range } = model;
  const marked = `the ${price.word} of ${price.text}`;
  const label = range
    ? `A range from ${range.text} on a scale up to ${bar.topText}, with ${marked} ${range.where === "inside" ? "inside the range" : `${range.where} it`}`
    : `On a scale up to ${bar.topText}, with ${marked} marked${bar.full ? "; the value is above the top of the scale" : ""}`;
  return (
    <div className="relative mt-2 h-3" role="img" aria-label={label} data-testid="value-levers-bar" data-full={bar.full ? "" : undefined} data-price-place={range ? range.where : undefined}>
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-sm bg-[var(--hairline)]" />
      {bar.span ? (
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-sm bg-[var(--ink-2)]"
          style={{ left: `${bar.span.low * 100}%`, width: `${Math.max(0, bar.span.high - bar.span.low) * 100}%` }}
          data-testid="value-levers-band"
        />
      ) : (
        <div className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-sm bg-[var(--ink-2)]" style={{ width: `${bar.fill * 100}%` }} data-testid="value-levers-fill" />
      )}
      {bar.span && <div className="absolute top-0 h-3 w-0.5 -translate-x-1/2 rounded-sm bg-[var(--ink)]" style={{ left: `${bar.fill * 100}%` }} title={`Your story: ${model.readout?.text ?? ""}`} data-testid="value-levers-point-marker" />}
      <div className="absolute top-0 h-3 w-0.5 -translate-x-1/2 rounded-sm bg-[var(--sun)]" style={{ left: `${bar.marker * 100}%` }} title={`${price.label}: ${price.text}`} data-testid="value-levers-price-marker" />
    </div>
  );
}

const BAR_W = 22;
const GAP = 6;
const CHART_H = 96;

/** Ten bars of free cash flow, losses in coral and gains in mint, then a gap and one bar for everything after year 10 in today's money. */
function CashFlowBars({ bars }: { bars: readonly CashFlowBar[] }) {
  if (!bars.length) return null;
  const biggest = Math.max(...bars.map((b) => Math.abs(b.value)), 1);
  const lowest = Math.min(0, ...bars.map((b) => b.value));
  const highest = Math.max(0, ...bars.map((b) => b.value));
  const span = highest - lowest || biggest;
  const y = (v: number) => ((highest - v) / span) * CHART_H;
  const xOf = (i: number, after: boolean) => i * (BAR_W + GAP) + (after ? BAR_W : 0);
  const width = xOf(bars.length - 1, true) + BAR_W;
  return (
    <figure className="mt-3" data-testid="value-levers-cash-flows">
      <figcaption className="text-xs text-[var(--muted)]">{CASH_FLOW_CAPTION}</figcaption>
      <svg viewBox={`0 0 ${width} ${CHART_H + 16}`} className="mt-1 w-full" role="img" aria-label={bars.map((b) => `${b.label}: ${b.text}`).join("; ")}>
        <line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke="var(--border)" />
        {bars.map((b, i) => {
          const top = Math.min(y(0), y(b.value));
          return (
            <rect
              key={b.label}
              data-gain={b.gain ? "" : undefined}
              x={xOf(i, b.afterYear10)}
              y={top}
              width={BAR_W}
              height={Math.max(1, Math.abs(y(b.value) - y(0)))}
              rx={2}
              fill={b.gain ? "var(--mint)" : "var(--coral)"}
              strokeDasharray={b.afterYear10 ? "3 2" : undefined}
              stroke={b.afterYear10 ? "var(--ink-2)" : undefined}
            >
              <title>{`${b.label}: ${b.text}`}</title>
            </rect>
          );
        })}
        <text x={xOf(0, false) + BAR_W / 2} y={CHART_H + 13} textAnchor="middle" fontSize={10} fill="var(--muted)">
          1
        </text>
        <text x={xOf(9, false) + BAR_W / 2} y={CHART_H + 13} textAnchor="middle" fontSize={10} fill="var(--muted)">
          10
        </text>
        <text x={xOf(10, true) + BAR_W / 2} y={CHART_H + 13} textAnchor="middle" fontSize={10} fill="var(--muted)">
          after
        </text>
      </svg>
    </figure>
  );
}
