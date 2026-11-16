"use client";

import { defineComponent, type ComponentRenderProps } from "@openuidev/react-lang";
import { Fragment, useState, type KeyboardEvent, type ReactNode } from "react";
import { z } from "zod/v4";
import { Button } from "../../../app/primitives/button";
import { formatAmount } from "../wave1/format";
import { useChangeFlash, usePrefersReducedMotion } from "../wave1/motion";
import type { Tone } from "../wave1/tones";
import { Pic } from "../wave3/shared";

// StepThrough: a worked example with Back and Next. The numbers in a step's words light up in teal (yours), amber
// (sourced) or neutral (worked out). A step with `ask` is a faded step: the number stays hidden until the Learner
// taps Show the number (nothing is typed, ADR 0002). Formulas are never typed here (ADR 0003): a step whose words contain one is replaced by a pointer to the
// Formula Card. Practice only: nothing is marked or saved.

export const stepProps = z.object({
  title: z.string(),
  body: z.string().describe("A few plain words. No formulas with symbols: those are Formula Cards"),
  highlight: z.enum(["you", "src", "neutral"]).optional().describe("Lights up the numbers in the body: you = the Learner's assumption (teal), src = sourced (amber), neutral = worked out"),
  ask: z.number().nullish().describe("Makes this a faded step: the number a Show the number button reveals, from a calculator, never typed by hand"),
  askUnit: z.string().nullish().describe("The unit of the asked number, as for Stat (inr, percent, years ...)"),
  light: z.number().int().nullish().describe("The tile this step lights (0 = first)"),
  emoji: z.string().nullish().describe("An emoji name beside the title"),
});

export const Step = defineComponent({
  name: "Step",
  description: "One step of a StepThrough. Use it only inside StepThrough.",
  props: stepProps,
  component: () => null,
});

export const stepThroughProps = z.object({
  steps: z.array(Step.ref).describe("The steps in the order of the worked example"),
  tiles: z
    .array(z.object({ label: z.string(), emoji: z.string().optional() }))
    .nullish()
    .describe("Tiles drawn above every step; a step's light lights one"),
  tilesLabel: z.string().nullish().describe("What the tiles are, read out by a screen reader, such as The three statements"),
});

export type StepData = z.infer<typeof stepProps>;
export type StepTile = { label: string; emoji?: string };

/** True when text holds a formula in symbols ("PV = FV / (1 + r)^n"): those belong on a Formula Card. */
export function looksLikeFormula(text: string): boolean {
  return /\b[A-Za-z][A-Za-z_]{0,3}\s*=\s*[^.;\n]*[\/*^×÷]/.test(text) || /[A-Za-z0-9)]\s*\^\s*[A-Za-z(]/.test(text);
}

const NUMBER = /[₹$]?\d[\d,]*(?:\.\d+)?(?:\s?(?:%|lakh|crore|years?|months?|percent))?/g;

const LIT: Record<Tone, { textDecorationColor: string }> = {
  you: { textDecorationColor: "var(--you-line)" },
  src: { textDecorationColor: "var(--src-line)" },
  neutral: { textDecorationColor: "var(--line-strong)" },
};

/** The words with each number lit up in the tone's colour. */
export function lit(body: string, tone: Tone | undefined): ReactNode {
  if (!tone) return body;
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of body.matchAll(NUMBER)) {
    const at = m.index ?? 0;
    parts.push(<Fragment key={`t${at}`}>{body.slice(last, at)}</Fragment>);
    parts.push(
      <mark key={`n${at}`} data-testid="step-number" data-tone={tone} className="bg-transparent px-1 font-medium text-[var(--ink)] underline decoration-2 underline-offset-4 tabular-nums" style={LIT[tone]}>
        {m[0]}
      </mark>,
    );
    last = at + m[0].length;
  }
  parts.push(<Fragment key="rest">{body.slice(last)}</Fragment>);
  return parts;
}

type Asked = { status: "idle" | "shown" };

/** One column per tile (2 to 4), written out so Tailwind keeps each class. */
const TILE_COLUMNS: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" };

/**
 * The tiles a StepThrough draws above its steps; a tile is lit once a step up to `at` has lit it. Unlit tiles keep full
 * contrast (the muted ink token, a dashed border), and the lit state is read out: the tile this step lights is
 * aria-current, and each lit tile says so to a screen reader (#90, review 3 L07).
 */
function Tiles({ tiles, steps, at, label }: { tiles: StepTile[]; steps: StepData[]; at: number; label?: string | null }) {
  const lit = new Set(steps.slice(0, at + 1).flatMap((s) => (typeof s.light === "number" ? [s.light] : [])));
  const current = steps[at]?.light;
  return (
    <ul data-testid="step-tiles" className={`mt-2 grid ${TILE_COLUMNS[tiles.length] ?? "grid-cols-4"} gap-2`} aria-label={label?.trim() || "What the steps move"}>
      {tiles.map((t, i) => {
        const on = lit.has(i);
        return (
          <li
            key={`${i}-${t.label}`}
            data-testid="step-tile"
            data-lit={on ? "true" : "false"}
            aria-current={current === i ? "step" : undefined}
            className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-center text-xs leading-4 ${on ? "border-[var(--line-strong)] font-medium text-[var(--ink)]" : "border-dashed border-[var(--line-strong)] text-[var(--muted)]"}`}
          >
            {t.emoji && <Pic name={t.emoji} size={20} />}
            <span>{t.label}</span>
            {on && <span className="sr-only">, lit</span>}
          </li>
        );
      })}
    </ul>
  );
}

export function StepThroughView({ steps, tiles, tilesLabel }: { steps: StepData[]; tiles?: StepTile[] | null; tilesLabel?: string | null }) {
  const reduced = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [asked, setAsked] = useState<Record<number, Asked>>({});
  const fresh = useChangeFlash(index, reduced);
  if (!steps.length) return null;
  const at = Math.min(index, steps.length - 1);
  const step = steps[at];
  const formula = looksLikeFormula(step.body);
  const hasAsk = typeof step.ask === "number" && Number.isFinite(step.ask);
  const state = asked[at] ?? { status: "idle" as const };
  const unit = step.askUnit ?? "";
  const setState = (next: Asked) => setAsked({ ...asked, [at]: next });

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    if (e.key === "ArrowRight") setIndex(Math.min(steps.length - 1, at + 1));
    else if (e.key === "ArrowLeft") setIndex(Math.max(0, at - 1));
  };
  return (
    <div data-testid="step-through" data-step={at} data-motion={reduced ? "reduced" : "full"} onKeyDown={onKey} className="my-3 rounded-lg border border-[var(--rule)] p-3">
      <p className="text-xs text-[var(--muted)]" data-testid="step-count">
        Step {at + 1} of {steps.length}
      </p>
      <div role="group" aria-label={`Step ${at + 1} of ${steps.length}: ${step.title}`} style={{ opacity: fresh ? 0.35 : 1, transition: reduced ? undefined : "opacity 160ms var(--ease-out, ease-out)" }}>
        {tiles && tiles.length > 0 && <Tiles tiles={tiles} steps={steps} at={at} label={tilesLabel} />}
        <h4 className="mt-2 flex items-center gap-2 text-base font-medium">
          {step.emoji && <Pic name={step.emoji} size={24} />}
          {step.title}
        </h4>
        {formula ? (
          <p data-testid="step-formula-blocked" className="mt-1 text-sm text-[var(--muted)]">
            This step has a formula. It is shown on a Formula Card, not typed here.
          </p>
        ) : (
          <p data-testid="step-body" className="mt-1 text-sm leading-6">
            {lit(step.body, step.highlight)}
          </p>
        )}
        {hasAsk && (
          <div data-testid="step-ask" data-status={state.status} className="mt-2">
            {state.status === "idle" && (
              <Button variant="secondary" size="sm" onClick={() => setState({ status: "shown" })}>
                Show the number
              </Button>
            )}
            <p role="status" data-testid="step-ask-result" className="mt-1 text-sm" {...(state.status === "shown" ? { "data-key-figure": "" } : {})}>
              {state.status === "shown" && `It is ${formatAmount(step.ask!, unit)}.`}
            </p>
          </div>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" size="sm" onClick={() => at > 0 && setIndex(at - 1)} aria-disabled={at === 0}>
          Back
        </Button>
        <Button variant="secondary" size="sm" onClick={() => at < steps.length - 1 && setIndex(at + 1)} aria-disabled={at === steps.length - 1}>
          Next
        </Button>
      </div>
    </div>
  );
}

function StepThroughBound({ props }: ComponentRenderProps<z.infer<typeof stepThroughProps>>) {
  const steps = (Array.isArray(props.steps) ? props.steps : []).flatMap((s): StepData[] => {
    const p = (s as { props?: Partial<StepData> } | null)?.props;
    if (!p || typeof p.title !== "string") return [];
    return [
      {
        title: p.title,
        body: typeof p.body === "string" ? p.body : "",
        highlight: p.highlight,
        ask: typeof p.ask === "number" ? p.ask : undefined,
        askUnit: p.askUnit,
        light: typeof p.light === "number" ? p.light : undefined,
        emoji: typeof p.emoji === "string" ? p.emoji : undefined,
      },
    ];
  });
  const tiles = (Array.isArray(props.tiles) ? props.tiles : []).flatMap((t): StepTile[] =>
    t && typeof t.label === "string" ? [{ label: t.label, ...(typeof t.emoji === "string" && { emoji: t.emoji }) }] : [],
  );
  return <StepThroughView steps={steps} tiles={tiles} tilesLabel={typeof props.tilesLabel === "string" ? props.tilesLabel : null} />;
}

export const StepThrough = defineComponent({
  name: "StepThrough",
  description:
    "A worked example with Back and Next: StepThrough([Step(title, body, highlight?, ask?, askUnit?, light?, emoji?)], tiles?, tilesLabel?). tiles [{label, emoji}] sit above the steps; a step's light lights one; tilesLabel names them. highlight lights up the numbers in the body (you = teal, src = amber, neutral). A step with ask is a faded step: a Show the number button reveals the number; ask must come from a calculator. No formulas in symbols in a body: use a FormulaCard.",
  props: stepThroughProps,
  component: StepThroughBound,
});
