import { useState, type ReactNode } from "react";
import type { Topic } from "@/course/map";
import { STEP_NAMES, type NextOffer, type StepPosition, type StepSequence } from "@/course/navigator";
import { HELP_CHIPS, JUST_TELL_ME } from "@/tutor/chips";
import type { NextName } from "@/tutor/next";
import { TOPIC_START_ANCHOR } from "./topic-start-card";
import { Button, Chevron } from "./ui";

// Small presentational pieces of the workspace's left column (issue #44).

/** Where the Learner is on the Course Map: their current Topic and its Stage. Null before any Topic. */
export type Place = { stage: Topic["stage"]; title: string; /** The Topic's one-line goal, if it has one. */ goal?: string } | null;

/**
 * A Topic passed in a turn, whose Session stays on screen until the Learner chooses where to go: its title,
 * and What comes next's label (null once every Topic is passed). Null while the shown Session is the current Topic's.
 */
export type PassedTopic = { title: string; next: string | null } | null;

/** The anchor of a step's divider in the thread, which the Topic bar scrolls to: "step-3". */
export const stepAnchor = (number: number) => `step-${number}`;

/** Where a finished step on the strip scrolls to: the Story to the Topic Start card, any other to its divider, if this Session has one. */
function targetOf(step: StepPosition, marked: ReadonlySet<number>): string | null {
  if (step.step === "story") return TOPIC_START_ANCHOR;
  return marked.has(step.number) ? stepAnchor(step.number) : null;
}

/**
 * The Topic bar: a slim bar above the chat for the whole Topic, with its title and the progress strip from the
 * Course Navigator's step sequence. Steps are grouped by Check, the current one highlighted; a finished step
 * scrolls the chat back to where it began (`marked`: the step numbers whose divider is in the thread).
 */
export function TopicBar({ title, goal, strip, marked }: { title: string; goal?: string; strip: StepSequence | null; marked: ReadonlySet<number> }) {
  const finished = (s: StepPosition) => strip !== null && (strip.current === null || s.number - 1 < strip.current);
  const step = (s: StepPosition) => {
    const target = finished(s) ? targetOf(s, marked) : null;
    if (strip?.current === s.number - 1) {
      return (
        <span aria-current="step" data-step-number={s.number} title={s.label} className="rounded bg-[var(--brand-tint)] px-1.5 font-semibold text-[var(--brand)]">
          {STEP_NAMES[s.step]}
        </span>
      );
    }
    if (target) {
      return (
        <button
          type="button"
          data-step-number={s.number}
          data-scroll-to={target}
          title={`Back to ${s.label}`}
          onClick={() => document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" })}
          className="pressable inline-block rounded px-1 underline decoration-[var(--border)] underline-offset-2 hover:text-[var(--brand)]"
        >
          {STEP_NAMES[s.step]}
        </button>
      );
    }
    return (
      <span data-step-number={s.number} title={s.label} className={finished(s) ? "px-1" : "px-1 text-[var(--muted)]"}>
        {STEP_NAMES[s.step]}
      </span>
    );
  };
  return (
    <nav aria-label="Topic progress" data-testid="topic-bar" className="rounded-lg border border-[var(--border)] px-3 py-2">
      <p className="truncate text-sm font-semibold leading-5">{title}</p>
      {goal && (
        <p data-testid="topic-goal" className="mt-0.5 text-xs leading-4 text-[var(--muted)]">
          {goal}
        </p>
      )}
      {strip && (
        <ol aria-label="Steps in this Topic" className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5">
          {/* Steps outside any Check (Story, Reveal, Principle) stand alone: "Story · Check 1: Concept, Your turn, Check · … · Reveal · Principle". */}
          {strip.groups.flatMap((g) => (g.check ? [g] : g.steps.map((s) => ({ check: null, steps: [s] })))).map((g) => (
            <li key={g.steps[0].number} data-strip-group className="flex items-center gap-0.5">
              {g.check && <span className="mr-0.5 font-medium text-[var(--muted)]">Check {g.check.number}:</span>}
              <ol className="flex flex-wrap items-center gap-0.5">
                {g.steps.map((s) => (
                  <li key={s.number}>{step(s)}</li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      )}
    </nav>
  );
}

/**
 * The chips under the latest Tutor reply or card. First the Next chip from the Course Navigator's offer (none
 * while a Check is open): "Next: <step> →", "Complete this Topic →", or "Just tell me →" at an unsettled
 * Explore (which posts "Just tell me." as the Learner's message). Next and Complete send no Learner message:
 * code writes the turn's note. Then the two help chips, which stay during a Check and post their words
 * ("Go deeper.", "Show me in a widget.") as the Learner's message.
 */
export function Chips({ offer, onNext, onSay }: { offer: NextOffer | null; onNext: (named: NextName) => void; onSay: (words: string) => void }) {
  // The chip pressed shows a spinner at once and the others wait, until the turn takes the chips away (or, if the turn
  // could not start, they come back fresh).
  const [pressed, setPressed] = useState<string | null>(null);
  const press = (offer: NextOffer) => {
    setPressed("next");
    if (offer.kind === "just_tell_me") onSay(JUST_TELL_ME);
    else onNext(offer.kind === "complete" ? "complete" : offer.step);
  };
  return (
    <div className="measure mt-3 flex flex-wrap gap-2">
      {offer && (
        <Button variant="secondary" data-testid="next-chip" loading={pressed === "next"} disabled={pressed !== null} onClick={() => press(offer)}>
          {offer.label} →
        </Button>
      )}
      {HELP_CHIPS.map((words) => (
        <Button
          variant="secondary"
          key={words}
          data-testid="help-chip"
          loading={pressed === words}
          disabled={pressed !== null}
          onClick={() => {
            setPressed(words);
            onSay(words);
          }}
        >
          {words.replace(/\.$/, "")}
        </Button>
      ))}
    </div>
  );
}

/** One folded row ("Spaced review · 2 due · Show") that opens in place. `open` starts it open. */
export function FoldedRow({ label, open, children, ...rest }: { label: ReactNode; open?: boolean; children: ReactNode } & { "data-testid"?: string }) {
  return (
    <details open={open} className="group rounded-lg border border-[var(--border)]" {...rest}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm leading-5 [&::-webkit-details-marker]:hidden">
        <span>{label}</span>
        <span className="flex items-center gap-1.5 text-xs leading-4 text-[var(--muted)]">
          <span className="group-open:hidden">Show</span>
          <span className="hidden group-open:inline">Hide</span>
          <Chevron />
        </span>
      </summary>
      <div className="border-t border-[var(--hairline)] p-4">{children}</div>
    </details>
  );
}
