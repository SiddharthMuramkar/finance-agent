"use client";

import { defineComponent, useStateField, type ComponentRenderProps } from "@openuidev/react-lang";
import { useId } from "react";
import { z } from "zod/v4";
import { usePrefersReducedMotion } from "../wave1/motion";
import { motionFlag, Pic } from "./shared";

// ChoiceCards: tap to choose. Right turns the card mint with "Yes" and a 150 ms pop. Wrong shows the fix in coral and the
// Learner may pick again. Marked in the browser, counts toward nothing, kept in Widget state.

const choiceProps = z.object({
  id: z.string(),
  text: z.string().describe("The choice: at most 10 words"),
  emoji: z.string().optional().describe("An emoji name"),
  fix: z.string().optional().describe("Shown when this choice is wrong: at most 20 words"),
});

export const choiceCardsProps = z.object({
  question: z.string().describe("At most 25 words"),
  choices: z.array(choiceProps).describe("2 to 4 choices"),
  answer: z.string().describe("The id of the right choice"),
});

type Props = z.infer<typeof choiceCardsProps>;

export function ChoiceCardsView({ question, choices, answer, picked, onPick }: Props & { picked: string | null; onPick: (id: string) => void }) {
  const reduced = usePrefersReducedMotion();
  if (!question || !Array.isArray(choices) || choices.length < 2 || choices.some((c) => !c || typeof c.id !== "string" || typeof c.text !== "string")) {
    return <p className="py-2 text-sm text-[var(--muted)]">The question is still arriving.</p>;
  }
  if (!choices.some((c) => c.id === answer)) return <p data-testid="choice-cards-problem" className="py-2 text-sm text-[var(--muted)]">The right choice is not among the choices.</p>;
  const chosen = choices.find((c) => c.id === picked);
  const right = !!chosen && chosen.id === answer;
  return (
    <section data-testid="choice-cards" data-motion={motionFlag(reduced)} aria-label="Choose" className="@container py-1">
      <p className="mb-2 text-base font-semibold leading-6 text-[var(--ink)]">{question}</p>
      <div className="grid grid-cols-1 gap-2 @min-[520px]:grid-cols-2">
        {choices.slice(0, 4).map((c) => {
          const isPick = c.id === picked;
          const state = !isPick ? "idle" : right ? "right" : "wrong";
          return (
            <button
              key={c.id}
              type="button"
              data-affordance="button"
              data-testid="choice"
              data-state={state}
              aria-pressed={isPick}
              disabled={right && !isPick}
              onClick={() => onPick(c.id)}
              className={`flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl border-2 px-3 py-2 text-left text-base font-medium leading-6 text-[var(--ink)] shadow-[0_2px_0_var(--brand-line)] transition-colors hover:bg-[var(--brand-tint)] disabled:cursor-default disabled:opacity-60 ${
                state === "right"
                  ? `border-[var(--mint)] bg-[var(--mint-tint)] ${reduced ? "" : "choice-pop"}`
                  : state === "wrong"
                    ? "border-[var(--coral)] bg-[var(--coral-tint)]"
                    : "border-[var(--brand-line)] bg-[var(--field)]"
              }`}
            >
              {c.emoji && (
                <span className="shrink-0">
                  <Pic name={c.emoji} size={32} />
                </span>
              )}
              <span className="flex-1">{c.text}</span>
              {state !== "idle" && (
                <span aria-hidden="true" className={state === "right" ? "text-[var(--mint-ink)]" : "text-[var(--coral-ink)]"}>
                  {state === "right" ? "✓" : "✗"}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div role="status" data-testid="choice-status" className="mt-2 min-h-6 text-sm font-medium leading-5">
        {chosen && (right ? <p className="text-[var(--mint-ink)]">Yes</p> : <p className="text-[var(--coral-ink)]">{chosen.fix || "Not quite. Try another."}</p>)}
      </div>
    </section>
  );
}

function ChoiceCardsBound({ props }: ComponentRenderProps<Props>) {
  const name = `choice-cards-${useId()}`;
  const field = useStateField<unknown>(name, undefined);
  const picked = typeof field.value === "string" ? field.value : null;
  return <ChoiceCardsView question={props.question} choices={props.choices} answer={props.answer} picked={picked} onPick={(id) => field.setValue(id)} />;
}

export const ChoiceCards = defineComponent({
  name: "ChoiceCards",
  description:
    "Tap to choose: ChoiceCards(question, choices, answer). question at most 25 words; choices are 2 to 4 {id, text (at most 10 words), emoji?, fix? (at most 20 words, shown when wrong)}; answer is the right id. Not marked.",
  props: choiceCardsProps,
  component: ChoiceCardsBound,
});
