"use client";

import { defineComponent, type ComponentRenderProps } from "@openuidev/react-lang";
import { Fragment, useState, type KeyboardEvent, type ReactNode } from "react";
import { z } from "zod/v4";
import { formatAmount } from "../wave1/format";
import { useChangeFlash, usePrefersReducedMotion } from "../wave1/motion";
import type { Tone } from "../wave1/tones";

// StepThrough: a worked example with Back and Next. The numbers in a step's words light up in teal (yours), amber
// (sourced) or neutral (worked out). A step with `ask` is a faded step: the number stays hidden until the Learner
// taps Show the number (nothing is typed, ADR 0009). Formulas are never typed here (ADR 0002): a step whose words contain one is replaced by a pointer to the
// Formula Card. Practice only: nothing is marked or saved.

export const stepProps = z.object({
  title: z.string(),
  body: z.string().describe("A few plain words. No formulas with symbols: those are Formula Cards"),
  highlight: z.enum(["you", "src", "neutral"]).optional().describe("Lights up the numbers in the body: you = the Learner's assumption (teal), src = sourced (amber), neutral = worked out"),
  ask: z.number().optional().describe("Makes this a faded step: the number a Show the number button reveals, from a calculator, never typed by hand"),
  askUnit: z.string().optional().describe("The unit of the asked number, as for Stat (inr, percent, years ...)"),
});

export const Step = defineComponent({
  name: "Step",
  description: "One step of a StepThrough: Step(title, body, highlight?, ask?, askUnit?). Use it only inside StepThrough.",
  props: stepProps,
  component: () => null,
});

export const stepThroughProps = z.object({
  steps: z.array(Step.ref).describe("The steps in the order of the worked example"),
});

export type StepData = z.infer<typeof stepProps>;

/** True when text holds a formula in symbols ("PV = FV / (1 + r)^n"): those belong on a Formula Card. */
export function looksLikeFormula(text: string): boolean {
  return /\b[A-Za-z][A-Za-z_]{0,3}\s*=\s*[^.;\n]*[\/*^×÷]/.test(text) || /[A-Za-z0-9)]\s*\^\s*[A-Za-z(]/.test(text);
}

const NUMBER = /[₹$]?\d[\d,]*(?:\.\d+)?(?:\s?(?:%|lakh|crore|years?|months?|percent))?/g;

const LIT: Record<Tone, { background: string; color: string }> = {
  you: { background: "var(--you-tag)", color: "var(--you-tag-ink)" },
  src: { background: "var(--src-tag)", color: "var(--src-tag-ink)" },
  neutral: { background: "var(--data)", color: "var(--ink)" },
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
      <mark key={`n${at}`} data-testid="step-number" data-tone={tone} className="rounded-sm px-1 tabular-nums" style={LIT[tone]}>
        {m[0]}
      </mark>,
    );
    last = at + m[0].length;
  }
  parts.push(<Fragment key="rest">{body.slice(last)}</Fragment>);
  return parts;
}

type Asked = { status: "idle" | "shown" };

export function StepThroughView({ steps }: { steps: StepData[] }) {
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
  const button = "min-h-10 rounded-md px-4 text-sm font-medium disabled:opacity-40 aria-disabled:opacity-40";

  return (
    <div data-testid="step-through" data-step={at} data-motion={reduced ? "reduced" : "full"} onKeyDown={onKey} className="my-3 rounded-md border border-[var(--border)] p-3">
      <p className="text-xs text-[var(--muted)]" data-testid="step-count">
        Step {at + 1} of {steps.length}
      </p>
      <div role="group" aria-label={`Step ${at + 1} of ${steps.length}: ${step.title}`} style={{ opacity: fresh ? 0.35 : 1, transition: reduced ? undefined : "opacity 160ms var(--ease-out, ease-out)" }}>
        <h4 className="mt-1 text-base font-semibold">{step.title}</h4>
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
              <button type="button" onClick={() => setState({ status: "shown" })} className={`${button} border border-[var(--border)]`}>
                Show the number
              </button>
            )}
            <p role="status" data-testid="step-ask-result" className="mt-1 text-sm">
              {state.status === "shown" && `It is ${formatAmount(step.ask!, unit)}.`}
            </p>
          </div>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => at > 0 && setIndex(at - 1)} aria-disabled={at === 0} className={`${button} border border-[var(--border)]`}>
          Back
        </button>
        <button type="button" onClick={() => at < steps.length - 1 && setIndex(at + 1)} aria-disabled={at === steps.length - 1} className={`${button} bg-[var(--brand)] text-[var(--brand-ink)] hover:bg-[var(--brand-hover)] aria-disabled:hover:bg-[var(--brand)]`}>
          Next
        </button>
      </div>
    </div>
  );
}

function StepThroughBound({ props }: ComponentRenderProps<z.infer<typeof stepThroughProps>>) {
  const steps = (Array.isArray(props.steps) ? props.steps : []).flatMap((s): StepData[] => {
    const p = (s as { props?: Partial<StepData> } | null)?.props;
    if (!p || typeof p.title !== "string") return [];
    return [{ title: p.title, body: typeof p.body === "string" ? p.body : "", highlight: p.highlight, ask: typeof p.ask === "number" ? p.ask : undefined, askUnit: p.askUnit }];
  });
  return <StepThroughView steps={steps} />;
}

export const StepThrough = defineComponent({
  name: "StepThrough",
  description:
    "A worked example with Back and Next: StepThrough([Step(title, body, highlight?, ask?, askUnit?)]). highlight lights up the numbers in the body (you = teal, src = amber, neutral). A step with ask is a faded step: a Show the number button reveals the number; ask must come from a calculator. No formulas in symbols in a body: use a FormulaCard.",
  props: stepThroughProps,
  component: StepThroughBound,
});
