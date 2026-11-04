"use client";

import { defineComponent, reactive, useStateField, type ComponentRenderProps } from "@openuidev/react-lang";
import { useEffect, useId, useState } from "react";
import { z } from "zod/v4";
import { formatAmount, trimmed } from "./format";
import { usePrefersReducedMotion } from "./motion";
import { along, Marker, Track } from "./track";

// Predict: lock in a guess, then reveal. The guess lives in a $variable (Widget state), so a saved note shows the
// guess beside the actual figure. The actual figure must come from a tool result or Case Data, never typed.

export const predictProps = z.object({
  prompt: z.string(),
  guess: reactive(z.number()),
  min: z.number(),
  max: z.number(),
  step: z.number(),
  unit: z.string().describe("percent, years, inr, usd, ... (as for Stat)"),
  actual: z.number().optional().describe("The real figure, from a tool result or Case Data. Left out or not a number while the data is withheld: the reveal then waits"),
  actualLabel: z.string().optional(),
  revealsAt: z.string().optional().describe('When the withheld data is revealed, in words, e.g. "31 March 1992"'),
});

export const REVEAL_MS = 400;

/** The gap between guess and actual, in words code works out: "21.5 percentage points higher". */
export function gapSentence(guess: number, actual: number, unit: string): string {
  const diff = actual - guess;
  const head = `You guessed ${formatAmount(guess, unit)}. It was ${formatAmount(actual, unit)}.`;
  if (diff === 0) return `${head} Spot on.`;
  const size = unit === "percent" ? `${trimmed(Math.abs(diff))} percentage points` : formatAmount(Math.abs(diff), unit);
  return `${head} That is ${size} ${diff > 0 ? "higher" : "lower"} than your guess.`;
}

export function PredictView({
  prompt,
  guess,
  onGuess,
  min,
  max,
  step,
  unit,
  actual,
  actualLabel,
  revealsAt,
}: Omit<z.infer<typeof predictProps>, "guess"> & { guess: number; onGuess: (value: number) => void }) {
  const id = useId();
  const reduced = usePrefersReducedMotion();
  const [locked, setLocked] = useState(false);
  const [travelled, setTravelled] = useState(false);
  useEffect(() => {
    if (!locked) return;
    const frame = requestAnimationFrame(() => setTravelled(true));
    return () => cancelAnimationFrame(frame);
  }, [locked]);
  const shown = locked && (reduced || travelled);

  const value = Number.isFinite(guess) ? Math.min(max, Math.max(min, guess)) : min;
  const known = typeof actual === "number" && Number.isFinite(actual);
  const guessAt = along(value, min, max);
  const actualAt = known ? along(actual, min, max) : guessAt;
  const low = Math.min(guessAt, actualAt);

  return (
    <div data-testid="predict" data-locked={locked} data-motion={reduced ? "reduced" : "full"} className="my-3">
      <p id={`${id}-p`} className="text-sm font-medium">
        {prompt}
      </p>
      <div className="mt-1 flex items-baseline justify-between text-xs text-[var(--muted)]">
        <span>Your guess</span>
        <output data-testid="predict-guess" className="text-sm font-medium tabular-nums text-[var(--ink)]">
          {formatAmount(value, unit)}
        </output>
      </div>
      <Track className="focus-within:rounded focus-within:outline focus-within:outline-2 focus-within:outline-[var(--brand-line)]">
        {locked && known && (
          <span
            aria-hidden
            data-testid="predict-bracket"
            className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-[var(--ink)]"
            style={{ left: `${low}%`, width: shown ? `${Math.abs(actualAt - guessAt)}%` : 0, transition: reduced ? undefined : `width ${REVEAL_MS}ms var(--ease-out, ease-out)` }}
          />
        )}
        <Marker at={guessAt} kind="guess" testId="predict-guess-marker" label="Your guess" />
        {locked && known && (
          <Marker
            at={shown ? actualAt : guessAt}
            kind="actual"
            testId="predict-actual-marker"
            label={actualLabel ?? "Actual"}
            style={{ transition: reduced ? undefined : `left ${REVEAL_MS}ms var(--ease-out, ease-out)` }}
          />
        )}
        <input
          type="range"
          aria-labelledby={`${id}-p`}
          aria-valuetext={formatAmount(value, unit)}
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={locked}
          onChange={(e) => onGuess(Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
        />
      </Track>
      <div className="flex justify-between text-xs tabular-nums text-[var(--muted)]">
        <span>{formatAmount(min, unit)}</span>
        <span>{formatAmount(max, unit)}</span>
      </div>
      {!locked && (
        <button
          type="button"
          onClick={() => setLocked(true)}
          className="mt-2 min-h-10 rounded-md bg-[var(--brand)] px-4 text-sm font-medium text-[var(--brand-ink)] hover:bg-[var(--brand-hover)]"
        >
          Lock in my guess
        </button>
      )}
      {locked && (
        <p role="status" data-testid="predict-result" className="mt-2 text-sm">
          {known ? (
            <>
              {gapSentence(value, actual, unit)}
              {actualLabel && <span className="text-[var(--muted)]"> {actualLabel}.</span>}
            </>
          ) : (
            <span data-testid="predict-withheld" className="text-[var(--muted)]">
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden className="mr-1 inline-block align-[-2px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 018 0v3" />
              </svg>
              Revealed when the story reaches {revealsAt ?? "that point"}. Your guess is {formatAmount(value, unit)}.
            </span>
          )}
        </p>
      )}
    </div>
  );
}

function PredictBound({ props }: ComponentRenderProps<z.infer<typeof predictProps>>) {
  const name = `predict-${useId()}`;
  const field = useStateField<unknown>(name, props.guess);
  const [local, setLocal] = useState<number | null>(null);
  const bound = typeof field.value === "number" ? field.value : null;
  const guess = bound ?? local ?? props.min;
  return (
    <PredictView
      {...props}
      guess={guess}
      onGuess={(v) => {
        setLocal(v);
        field.setValue(v);
      }}
    />
  );
}

export const Predict = defineComponent({
  name: "Predict",
  description:
    "Lock in a guess, then reveal: Predict(prompt, guess, min, max, step, unit, actual, actualLabel?, revealsAt?). guess is a $variable. actual must come from a tool result or case data, never a number you type; while case data is withheld it reveals later. Before showing an answer the Learner could guess, ask for the guess with Predict.",
  props: predictProps,
  component: PredictBound,
});
