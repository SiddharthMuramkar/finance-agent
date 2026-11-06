import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Topic } from "@/course/map";
import {
  STEP_NAMES,
  type NextOffer,
  type StepPosition,
  type StepSequence,
} from "@/course/navigator";
import { Emoji } from "@/emoji/emoji";
import { isEmojiName } from "@/emoji/registry";
import { JUST_TELL_ME } from "@/tutor/chips";
import type { NextName } from "@/tutor/next";
import { TopicOptions } from "./topic-options";
import { TOPIC_START_ANCHOR } from "./topic-start-card";
import { Button, Chevron, Chip, Tag } from "./ui";

// Small presentational pieces of the workspace's left column (issue #44).

/** Where the Learner is on the Course Map: their current Topic and its Stage. Null before any Topic. */
export type Place = {
  stage: Topic["stage"];
  title: string;
  /** The Topic's id: the ⋯ menu's Start this Topic over posts it. */ topicId?: string;
  /** The Topic's one-line goal, if it has one. */ goal?: string;
} | null;

/**
 * A Topic passed in a turn, whose Session stays on screen until the Learner chooses where to go: its title,
 * and What comes next's label (null once every Topic is passed). Null while the shown Session is the current Topic's.
 */
export type PassedTopic = { title: string; next: string | null } | null;

/** The anchor of a step's divider in the thread, which the Topic bar scrolls to: "step-3". */
export const stepAnchor = (number: number) => `step-${number}`;

/** Where a finished step on the strip scrolls to: the Story to the Topic Start card, any other to its divider, if this Session has one. */
function targetOf(
  step: StepPosition,
  marked: ReadonlySet<number>,
): string | null {
  if (step.step === "story") return TOPIC_START_ANCHOR;
  return marked.has(step.number) ? stepAnchor(step.number) : null;
}

/**
 * The Topic bar: a slim bar above the chat for the whole Topic, with its title and the progress strip from the
 * Course Navigator's step sequence. Steps are grouped by Check, the current one highlighted; a finished step
 * scrolls the chat back to where it began (`marked`: the step numbers whose divider is in the thread).
 */
export function TopicBar({
  topicId,
  title,
  goal,
  strip,
  marked,
}: {
  topicId?: string;
  title: string;
  goal?: string;
  strip: StepSequence | null;
  marked: ReadonlySet<number>;
}) {
  const finished = (s: StepPosition) =>
    strip !== null && (strip.current === null || s.number - 1 < strip.current);
  const step = (s: StepPosition) => {
    const target = finished(s) ? targetOf(s, marked) : null;
    if (strip?.current === s.number - 1) {
      return (
        <span
          aria-current="step"
          data-step-number={s.number}
          title={s.label}
          className="font-semibold"
        >
          <Tag tone="brand">{STEP_NAMES[s.step]}</Tag>
        </span>
      );
    }
    if (target) {
      return (
        <Chip
          data-step-number={s.number}
          data-scroll-to={target}
          title={`Back to ${s.label}`}
          onClick={() =>
            document
              .getElementById(target)
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
          className="!px-2"
        >
          {STEP_NAMES[s.step]}
        </Chip>
      );
    }
    return (
      <span data-step-number={s.number} title={s.label}>
        <Tag>{STEP_NAMES[s.step]}</Tag>
      </span>
    );
  };
  return (
    <nav
      aria-label="Topic progress"
      data-testid="topic-bar"
      className="rounded-lg border border-[var(--border)] px-3 py-2"
    >
      {/* Two rows (#313): the title with the goal muted beside it, cut short (full text on hover), then the strip. */}
      <div
        data-topic-title-row
        className="flex items-center justify-between gap-2"
      >
        <p className="flex min-w-0 flex-1 items-baseline gap-2 text-sm leading-5">
          <span className="min-w-0 max-w-full shrink-0 truncate font-semibold">
            {title}
          </span>
          {goal && (
            <span
              data-testid="topic-goal"
              title={goal}
              className="min-w-0 truncate text-xs text-[var(--muted)]"
            >
              {goal}
            </span>
          )}
        </p>
        {topicId && <TopicOptions topicId={topicId} />}
      </div>
      {strip && <StepStrip strip={strip} current={strip.current} step={step} />}
    </nav>
  );
}

/**
 * The Topic bar's step strip on one line (#313): a Topic with four Checks scrolls sideways instead of wrapping, and the
 * strip scrolls itself (never the page) so the current step is in view.
 */
function StepStrip({
  strip,
  current,
  step,
}: {
  strip: StepSequence;
  current: number | null;
  step: (s: StepPosition) => ReactNode;
}) {
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const ol = list.current;
    const here = ol?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!ol || !here) return;
    const a = ol.getBoundingClientRect();
    const b = here.getBoundingClientRect();
    ol.scrollLeft += b.left - a.left - (a.width - b.width) / 2;
  }, [current]);
  return (
    <ol
      ref={list}
      aria-label="Steps in this Topic"
      className="mt-1 flex flex-nowrap items-center gap-x-3 overflow-x-auto whitespace-nowrap text-xs leading-5"
    >
      {/* Steps outside any Check (Story, Reveal, Principle) stand alone: "Story · Check 1: Concept, Your turn, Check · … · Reveal · Principle". */}
      {strip.groups
        .flatMap((g) =>
          g.check ? [g] : g.steps.map((s) => ({ check: null, steps: [s] })),
        )
        .map((g) => (
          <li
            key={g.steps[0].number}
            data-strip-group
            className="flex shrink-0 items-center gap-0.5"
          >
            {g.check && (
              <span className="mr-0.5 font-medium text-[var(--muted)]">
                Check {g.check.number}:
              </span>
            )}
            <ol className="flex flex-nowrap items-center gap-0.5">
              {g.steps.map((s) => (
                <li key={s.number}>{step(s)}</li>
              ))}
            </ol>
          </li>
        ))}
    </ol>
  );
}

/** One Choice as the Study Workspace draws it: the stored item's entry (reply_choices) or code's set. */
export type ChoiceButton = { label: string; says: string; emoji: string };

/**
 * The chips under the latest Tutor reply or card. First the Next chip from the Course Navigator's offer (none
 * while a Check is open): "Next: <step> →", "Complete this Topic →", or "Just tell me →" at an unsettled
 * Explore (which posts "Just tell me." as the Learner's message). Next and Complete send no Learner message:
 * code writes the turn's note. Then the reply's two or three Choices (D3a), which stay during a Check: raised
 * buttons with a decorative emoji before the label; a press sends the Choice's index and the server posts its words.
 */
export function Chips({
  offer,
  choices,
  onNext,
  onSay,
  onChoice,
}: {
  offer: NextOffer | null;
  choices: readonly ChoiceButton[];
  onNext: (named: NextName) => void;
  /** Posts words as the Learner's message: the Just tell me chip. */
  onSay?: (words: string) => void;
  onChoice: (index: number) => void;
}) {
  // The chip pressed shows a spinner at once and the others wait, until the turn takes the chips away (or, if the turn
  // could not start, they come back fresh).
  const [pressed, setPressed] = useState<string | null>(null);
  const press = (offer: NextOffer) => {
    setPressed("next");
    if (offer.kind === "just_tell_me") onSay?.(JUST_TELL_ME);
    else onNext(offer.kind === "complete" ? "complete" : offer.step);
  };
  return (
    // The Next chip is the main move, so it gets its own row at full size; the Choices are smaller, grouped below it.
    <div
      className="measure mt-3 flex flex-col items-start gap-2"
      data-testid="choices"
    >
      {offer && (
        <Button
          variant="secondary"
          data-testid="next-chip"
          loading={pressed === "next"}
          disabled={pressed !== null}
          onClick={() => press(offer)}
        >
          {offer.label} →
        </Button>
      )}
      {choices.length > 0 && (
        <div role="group" aria-label="Choices" className="flex flex-wrap gap-2">
          {choices.map((choice, index) => (
            <Button
              variant="secondary"
              size="sm"
              key={choice.says}
              data-testid="choice"
              loading={pressed === choice.says}
              disabled={pressed !== null}
              onClick={() => {
                setPressed(choice.says);
                onChoice(index);
              }}
            >
              {isEmojiName(choice.emoji) && pressed !== choice.says && (
                <Emoji name={choice.emoji} size={16} />
              )}
              {choice.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

/** One folded row ("Spaced review · 2 due · Show") that opens in place. `open` starts it open. */
export function FoldedRow({
  label,
  open,
  children,
  ...rest
}: { label: ReactNode; open?: boolean; children: ReactNode } & {
  "data-testid"?: string;
}) {
  return (
    <details
      open={open}
      className="group rounded-lg border border-[var(--border)]"
      {...rest}
    >
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
