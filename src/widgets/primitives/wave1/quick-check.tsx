"use client";

import { defineComponent, reactive, useStateField, type ComponentRenderProps } from "@openuidev/react-lang";
import { Check, Circle, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { z } from "zod/v4";
import { Button } from "../../../app/primitives/button";
import { quickCheckProblem } from "../../part-rules";

export { quickCheckProblem };

// QuickCheck: tap-to-answer practice. Never marked and never saved as a score. Its option rows share the marked
// Quiz's look (at least 44 px tall, an icon as well as a colour), so practice and marked quizzes read as one system.

export const quickCheckProps = z.object({
  question: z.string(),
  options: z.array(z.string()).describe("2 to 4 answers"),
  answer: z.number().describe("The index of the right option, from 0; -1 makes it a poll with no right answer"),
  why: z.string().describe("One sentence on why: shown after the pick"),
  // reactive() must wrap the schema last: .optional() or .describe() outside it makes a copy the parser no longer sees as a $variable.
  picked: reactive(z.number().optional()),
});

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 4;

function Mark({ kind }: { kind: "right" | "wrong" | "none" }) {
  const common = { size: 20, strokeWidth: 1.75, "aria-hidden": true, "data-icon": kind, className: "shrink-0" } as const;
  if (kind === "right") return <Check {...common} color="var(--success)" />;
  if (kind === "wrong") return <X {...common} color="var(--danger)" />;
  return <Circle {...common} color="var(--muted)" />;
}

export function QuickCheckView({
  question,
  options,
  answer,
  why,
  picked,
  onPick,
}: {
  question: string;
  options: string[];
  answer: number;
  why: string;
  /** The picked index, or -1 (or undefined) before a pick. */
  picked?: number;
  onPick: (index: number) => void;
}) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [focus, setFocus] = useState(0);
  const refocus = useRef(false);
  const unlocked = !(typeof picked === "number" && picked >= 0 && picked < options.length);
  // Try again unmounts the button that was focused: put focus on the first option instead of dropping it.
  useEffect(() => {
    if (refocus.current && unlocked) {
      refocus.current = false;
      refs.current[0]?.focus();
    }
  }, [unlocked]);
  const problem = quickCheckProblem(options, answer);
  if (problem) return <p role="alert" className="py-2 text-sm text-[var(--danger)]">{problem}</p>;

  const choice = typeof picked === "number" && picked >= 0 && picked < options.length ? picked : -1;
  const locked = choice >= 0;
  const poll = answer === -1;
  const correct = locked && !poll && choice === answer;

  const move = (to: number) => {
    const next = (to + options.length) % options.length;
    setFocus(next);
    refs.current[next]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      move(focus + 1);
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      move(focus - 1);
    } else if (/^[1-4]$/.test(e.key) && Number(e.key) <= options.length && !locked) {
      e.preventDefault();
      setFocus(Number(e.key) - 1);
      onPick(Number(e.key) - 1);
    }
  };

  return (
    <div data-testid="quick-check" className="my-3">
      <p id={`${id}-q`} className="mb-2 text-sm font-medium">
        {question}
      </p>
      <div role="radiogroup" aria-labelledby={`${id}-q`} onKeyDown={onKeyDown} className="flex flex-col gap-2">
        {options.map((option, i) => {
          const isPick = choice === i;
          const isRight = locked && !poll && i === answer;
          const isWrong = isPick && !poll && i !== answer;
          const border = isRight ? "var(--success)" : isWrong ? "var(--danger)" : isPick ? "var(--accent)" : "var(--line)";
          return (
            <Button
              key={i}
              unstyled
              data-affordance="option"
              ref={(el) => {
                refs.current[i] = el;
              }}
              role="radio"
              aria-checked={isPick}
              aria-disabled={locked || undefined}
              tabIndex={i === (locked ? choice : focus) ? 0 : -1}
              data-testid={`quick-check-option-${i}`}
              data-state={isRight ? "right" : isWrong ? "wrong" : isPick ? "picked" : "idle"}
              onFocus={() => setFocus(i)}
              onClick={() => {
                if (!locked) onPick(i);
              }}
              className={`flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] ${isPick && poll ? "bg-[var(--accent-tint)]" : "bg-[var(--paper)] hover:bg-[var(--wash)]"}`}
              style={{ borderColor: border, borderWidth: isRight || isWrong ? 2 : 1 }}
            >
              <span className="w-4 shrink-0 text-xs tabular-nums text-[var(--muted)]">{i + 1}</span>
              <span className="flex-1">{option}</span>
              <Mark kind={isRight ? "right" : isWrong ? "wrong" : "none"} />
            </Button>
          );
        })}
      </div>
      {locked && (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 text-sm" role="status" data-testid="quick-check-feedback">
          <span>
            <span data-key-figure="" className={correct ? "text-[var(--success)]" : poll ? "" : "text-[var(--danger)]"}>{poll ? "Noted." : correct ? "Right." : "Not quite."}</span>{" "}
            <span className="text-[var(--ink)]">{why}</span>
          </span>
          <Button variant="secondary" size="xs" onClick={() => {
              refocus.current = true;
              setFocus(0);
              onPick(-1);
            }}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}

function QuickCheckBound({ props }: ComponentRenderProps<z.infer<typeof quickCheckProps>>) {
  const name = `quick-check-${useId()}`;
  const field = useStateField<unknown>(name, props.picked);
  const value = typeof field.value === "number" ? field.value : -1;
  return <QuickCheckView question={props.question} options={props.options} answer={props.answer} why={props.why} picked={value} onPick={(i) => field.setValue(i)} />;
}

export const QuickCheck = defineComponent({
  name: "QuickCheck",
  description:
    "Tap-to-answer practice: QuickCheck(question, options, answer, why, picked?). 2 to 4 options; answer is the right index from 0, or -1 for a poll. why is shown after the pick. picked is a $variable that holds the index (-1 until picked). Check understanding with QuickCheck, never with Select.",
  props: quickCheckProps,
  component: QuickCheckBound,
});
