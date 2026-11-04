"use client";

import { defineComponent, reactive, useStateField, type ComponentRenderProps } from "@openuidev/react-lang";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { z } from "zod/v4";

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

/** What is wrong with a QuickCheck's options or answer, or null. library-v2 turns this into a hard error. */
export function quickCheckProblem(options: readonly unknown[], answer: number): string | null {
  if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) return `QuickCheck needs ${MIN_OPTIONS} to ${MAX_OPTIONS} options, not ${options.length}.`;
  if (!Number.isInteger(answer) || answer < -1 || answer > options.length - 1) return `QuickCheck answer ${answer} is outside -1 to ${options.length - 1}.`;
  return null;
}

function Mark({ kind }: { kind: "right" | "wrong" | "none" }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden data-icon={kind} className="shrink-0" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {kind === "right" && <path d="M5 12.5l4.5 4.5L19 7.5" stroke="var(--you)" />}
      {kind === "wrong" && <path d="M7 7l10 10M17 7L7 17" stroke="var(--danger)" />}
      {kind === "none" && <circle cx="12" cy="12" r="7" stroke="var(--muted)" />}
    </svg>
  );
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
          const border = isRight ? "var(--you-line)" : isWrong ? "var(--danger)" : isPick ? "var(--ink)" : "var(--border)";
          return (
            <button
              key={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
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
              className="flex min-h-11 w-full items-center gap-3 rounded-md border bg-[var(--field)] px-3 py-2 text-left text-sm hover:bg-[var(--brand-tint)] aria-disabled:cursor-default aria-disabled:hover:bg-[var(--field)]"
              style={{ borderColor: border, borderWidth: isRight || isWrong ? 2 : 1 }}
            >
              <span className="w-4 shrink-0 text-xs tabular-nums text-[var(--muted)]">{i + 1}</span>
              <span className="flex-1">{option}</span>
              <Mark kind={isRight ? "right" : isWrong ? "wrong" : "none"} />
            </button>
          );
        })}
      </div>
      {locked && (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 text-sm" role="status" data-testid="quick-check-feedback">
          <span>
            <strong className={correct ? "text-[var(--you)]" : poll ? "" : "text-[var(--danger)]"}>{poll ? "Noted." : correct ? "Right." : "Not quite."}</strong>{" "}
            <span className="text-[var(--ink)]">{why}</span>
          </span>
          <button type="button" onClick={() => onPick(-1)} className="min-h-6 rounded border border-[var(--border)] px-2 text-xs hover:bg-[var(--field)]">
            Try again
          </button>
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
