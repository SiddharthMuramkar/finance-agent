import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Topic } from "@/course/map";
import { STEP_NAMES, type NextOffer, type StepPosition, type StepSequence } from "@/course/navigator";
import { Emoji } from "@/emoji/emoji";
import { isEmojiName } from "@/emoji/registry";
import { JUST_TELL_ME } from "@/tutor/chips";
import type { NextName } from "@/tutor/next";
import { TopicOptions } from "./topic-options";
import { TOPIC_START_ANCHOR } from "./topic-start-card";
import { Button, Chevron, Chip, Tag } from "./ui";

// Small presentational pieces of the workspace's left column (issue #44).

/** Where the Learner is on the Course Map: their current Topic and its Stage. Null before any Topic. */
export type Place = { stage: Topic["stage"]; title: string; /** The Topic's id: the ⋯ menu's Start this Topic over posts it. */ topicId?: string; /** The Topic's one-line goal, if it has one. */ goal?: string } | null;

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
export function TopicBar({ topicId, title, goal, strip, marked }: { topicId?: string; title: string; goal?: string; strip: StepSequence | null; marked: ReadonlySet<number> }) {
  const finished = (s: StepPosition) => strip !== null && (strip.current === null || s.number - 1 < strip.current);
  const step = (s: StepPosition) => {
    const target = finished(s) ? targetOf(s, marked) : null;
    if (strip?.current === s.number - 1) {
      return (
        <span aria-current="step" data-step-number={s.number} title={s.label} className="font-semibold">
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
          onClick={() => document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" })}
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
    <nav aria-label="Topic progress" data-testid="topic-bar" className="rounded-lg border border-[var(--border)] px-3 py-2">
      {/* Two rows (#313): the title with the goal muted beside it, cut short (full text on hover), then the strip. The
          goal never gets less than 12rem: when the title leaves less, the goal wraps to its own line (T313-R1). */}
      <div data-topic-title-row className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 text-sm leading-5">
          <span className="min-w-0 max-w-full truncate font-semibold">{title}</span>
          {goal && (
            <span data-testid="topic-goal" title={goal} className="min-w-[min(12rem,100%)] flex-1 basis-48 truncate text-xs text-[var(--muted)]">
              {goal}
            </span>
          )}
        </p>
        {topicId && <TopicOptions topicId={topicId} />}
      </div>
      {strip && <StepStrip strip={strip} step={step} />}
    </nav>
  );
}

/**
 * The Topic bar's step strip on one line (#313): a Topic with four Checks scrolls sideways instead of wrapping, and
 * the strip scrolls only itself (never the page or the column) so the current step is in view.
 */
function StepStrip({ strip, step }: { strip: StepSequence; step: (s: StepPosition) => ReactNode }) {
  const list = useRef<HTMLOListElement>(null);
  const current = strip.current;
  useEffect(() => {
    const ol = list.current;
    const here = ol?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!ol || !here) return;
    const a = ol.getBoundingClientRect();
    const b = here.getBoundingClientRect();
    ol.scrollLeft += b.left - a.left - (a.width - b.width) / 2;
  }, [current]);
  // The scrollbar is hidden (a thin one still takes height on classic-scrollbar platforms), so the strip shows steps out
  // of view with a fade on that edge (data-more-left / data-more-right), and a plain mouse wheel scrolls it sideways
  // while it can still move that way; at an end the wheel is the page's again.
  const [more, setMore] = useState({ left: false, right: false });
  const measure = useCallback(() => {
    const ol = list.current;
    if (!ol) return;
    const left = ol.scrollLeft > 1;
    const right = ol.scrollLeft + ol.clientWidth < ol.scrollWidth - 1;
    setMore((m) => (m.left === left && m.right === right ? m : { left, right }));
  }, []);
  useEffect(() => {
    const ol = list.current;
    if (!ol) return;
    const onWheel = (e: WheelEvent) => {
      if (e.shiftKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = ol.scrollWidth - ol.clientWidth;
      if (max <= 0) return;
      const next = Math.min(max, Math.max(0, ol.scrollLeft + e.deltaY));
      if (next === ol.scrollLeft) return;
      e.preventDefault();
      ol.scrollLeft = next;
    };
    ol.addEventListener("scroll", measure, { passive: true });
    ol.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      ol.removeEventListener("scroll", measure);
      ol.removeEventListener("wheel", onWheel);
    };
  }, [measure]);
  // Re-measure whenever the box OR its content changes size: a new strip (the bar stays mounted across Topics), a Tag
  // that becomes a Chip as a step finishes, a web font loading. Observing the <ol> alone misses those (T313-F1).
  useEffect(() => {
    const ol = list.current;
    if (!ol) return;
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(ol);
    for (const child of ol.children) ro.observe(child);
    return () => ro.disconnect();
  }, [strip, measure]);
  const fade = more.left && more.right
    ? "[mask-image:linear-gradient(to_right,transparent,black_24px,black_calc(100%-24px),transparent)]"
    : more.left
      ? "[mask-image:linear-gradient(to_right,transparent,black_24px)]"
      : more.right
        ? "[mask-image:linear-gradient(to_left,transparent,black_24px)]"
        : "";
  // A scroll box clips what sticks out of it, so the strip keeps room inside itself for a scroll-back Chip's focus ring
  // (4 px all round) and its lip and shadow (12 px below), reaching into the bar's padding so the bar barely grows;
  // and it never scrolls up and down (a pressed Chip drops 2 px).
  return (
    <ol
      ref={list}
      aria-label="Steps in this Topic"
      data-more-left={more.left || undefined}
      data-more-right={more.right || undefined}
      className={`-mx-2 -mb-2 flex flex-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden items-center gap-x-3 overflow-x-auto overflow-y-hidden whitespace-nowrap px-2 pt-1 pb-3 text-xs leading-5 ${fade}`}
    >
      {/* Steps outside any Check (Story, Reveal, Principle) stand alone: "Story · Check 1: Concept, Your turn, Check · … · Reveal · Principle". */}
      {strip.groups.flatMap((g) => (g.check ? [g] : g.steps.map((s) => ({ check: null, steps: [s] })))).map((g) => (
        <li key={g.steps[0].number} data-strip-group className="flex shrink-0 items-center gap-0.5">
          {g.check && <span className="mr-0.5 font-medium text-[var(--muted)]">Check {g.check.number}:</span>}
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
    <div className="measure mt-3 flex flex-col items-start gap-2" data-testid="choices">
      {offer && (
        <Button variant="secondary" data-testid="next-chip" loading={pressed === "next"} disabled={pressed !== null} onClick={() => press(offer)}>
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
              {isEmojiName(choice.emoji) && pressed !== choice.says && <Emoji name={choice.emoji} size={16} />}
              {choice.label}
            </Button>
          ))}
        </div>
      )}
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
