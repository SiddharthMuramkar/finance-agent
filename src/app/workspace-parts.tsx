import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { Topic } from "@/course/map";
import { BAR_STEP_NAMES, type NextOffer, type StepPosition, type StepSequence } from "@/course/navigator";
import { JUST_TELL_ME } from "@/tutor/chips";
import type { NextName } from "@/tutor/next";
import { TopicOptions } from "./topic-options";
import { TOPIC_START_ANCHOR } from "./topic-start-card";
import { Button, Chevron } from "./ui";

// Small presentational pieces of the workspace's columns (issue #44): the Topic bar and its step bar, the Chips under a
// reply, the folded row, and the right panel's option rows and result icon (ADR 0018: flat, hairlines).

/** Where the Learner is on the Course Map: their current Topic and its Stage. Null before any Topic. */
export type Place = { stage: Topic["stage"]; title: string; /** The Topic's id: the ⋯ menu's Start this Topic over posts it. */ topicId?: string; /** The Topic's one-line goal, if it has one. */ goal?: string } | null;

/**
 * A Topic passed in a turn, whose Session stays on screen until the Learner chooses where to go: its title,
 * and What comes next's label (null once every Topic is passed). Null while the shown Session is the current Topic's.
 */
export type PassedTopic = { title: string; next: string | null } | null;

/** The anchor of a step's divider in the thread, which the Topic bar scrolls to: "step-3". */
export const stepAnchor = (number: number) => `step-${number}`;

/** Where a finished step scrolls to: the Story to the Topic Start card, any other to its divider, if this Session has one. */
function targetOf(step: StepPosition, marked: ReadonlySet<number>): string | null {
  if (step.step === "story") return TOPIC_START_ANCHOR;
  return marked.has(step.number) ? stepAnchor(step.number) : null;
}

/** Scrolls the chat to a step's divider (or the Topic Start card). */
const scrollTo = (target: string) => document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });

/** The 2px ring at a 2px offset, for a control that draws its own look. */
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] forced-colors:focus-visible:outline-[Highlight]";

// One segment of the step bar: a 24px tall box with a bar across its middle, painted as a background image so the box
// (the press target) is taller than the bar. The bar sits on the Topic bar's Band (spec 2026-11-12 F3): a done step is a
// 4px white bar, the current step a 6px white bar, a step ahead a 4px bar in white at 35%. Forced colours drop background
// images, so the strip opts out of them and paints system colours instead.
const SEG = "flex h-6 w-full min-w-6 bg-center bg-no-repeat bg-[image:linear-gradient(var(--seg),var(--seg))]";
const SEG_DONE = "bg-[length:100%_4px] [--seg:var(--on-band)] forced-colors:[--seg:CanvasText]";
const SEG_NOW = "bg-[length:100%_6px] [--seg:var(--on-band)] forced-colors:[--seg:Highlight]";
const SEG_TODO = "bg-[length:100%_4px] [--seg:var(--band-todo)] forced-colors:[--seg:GrayText]";

/** A small chevron that points down, and up once its button (class "group") is expanded. */
function ChevronDown({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-[var(--dur-ui)] ${className}`}>
      <path d="m4 6 4 4 4-4" />
    </svg>
  );
}

/** A step's mark in the All steps list: a tick when done, a filled accent dot for the current step, a ring for one ahead. */
function StepMark({ state }: { state: "done" | "now" | "todo" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-3.5 shrink-0">
      {state === "done" ? (
        <path d="M13 4.5 6.5 11 3 7.5" stroke="var(--ink-2)" />
      ) : state === "now" ? (
        <circle cx="8" cy="8" r="3.5" fill="var(--accent)" />
      ) : (
        <circle cx="8" cy="8" r="3.5" stroke="var(--line-strong)" />
      )}
    </svg>
  );
}

// ResultIcon lives in its own file, so a light view (Home's section 3 Quick try) can draw it without the Topic bar.
export { ResultIcon } from "./result-icon";

const OPTION =
  "flex min-h-11 w-full cursor-pointer items-start gap-3 rounded-lg border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-left text-sm leading-5 text-[var(--ink)] transition-colors duration-[var(--dur-ui)] data-[state=idle]:hover:border-[var(--line-strong)] data-[state=idle]:hover:bg-[var(--wash)] data-[state=showing]:border-[var(--accent)] data-[state=showing]:bg-[var(--accent-tint)] data-[state=showing]:shadow-[inset_0_0_0_1px_var(--accent)]";

/**
 * One answer to pick in a quiz or a Spaced review: a 44px row with the radio on the left and the answer beside it, the
 * whole row pressable. A picked row takes the selected look (an accent tint, an accent rim and an inner accent line).
 */
export function OptionRow({ name, checked, onChange, children }: { name: string; checked: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label data-affordance="option" data-selected={checked || undefined} data-state={checked ? "showing" : "idle"} data-allow-pointer className={OPTION}>
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-px" />
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}

/**
 * The Topic bar (spec 2026-11-12 F3; a royal Band until #32 lands, when ADR 0015 replaces it): a Band across the whole Study Workspace, under the header and above both
 * the conversation and the Widget panel, for the whole Topic. On the left its title and its goal, which wraps (two lines
 * at the widths the Study Workspace runs at) and is never cut short (G2); on the right the step bar from the Course
 * Navigator's step sequence (StepStrip) with All steps, then Topic options. Where the bar is narrower than 44rem (a container
 * query, so a narrow bar stacks whatever the window) the step bar goes under the title. In the Study Workspace it reaches
 * the window's edges past the page's gutters (the negative margin), while its content keeps them. `marked`: the step
 * numbers whose divider is in the thread, which a finished step scrolls the chat back to.
 */
export function TopicBar({ topicId, title, goal, strip, marked }: { topicId?: string; title: string; goal?: string; strip: StepSequence | null; marked: ReadonlySet<number> }) {
  return (
    <nav aria-label="Topic progress" data-testid="topic-bar" className="band @container/topic-bar relative z-20 -mx-[var(--gutter)] shrink-0 px-[var(--gutter)]">
      {/* A grid: narrow, the title with Topic options beside it and the step bar on a row of its own; from 44rem, the title,
          the step bar and Topic options side by side. The restart confirm (TopicOptions) takes a full row under them. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-1 py-2 @[44rem]/topic-bar:grid-cols-[minmax(0,1fr)_min(28rem,42%)_auto]">
        {/* The title over the goal. The goal is never truncated or clamped: it wraps, and the bar grows to hold it (#313, G2). */}
        <p data-topic-title-row className="col-start-1 row-start-1 flex min-w-0 flex-col">
          <span data-testid="topic-title" className="text-base font-semibold leading-6 [overflow-wrap:anywhere]">{title}</span>
          {goal && (
            <span data-testid="topic-goal" className="band-faint text-[13px] leading-[18px] [overflow-wrap:anywhere]">
              {goal}
            </span>
          )}
        </p>
        {strip && (
          <div data-step-column className="col-span-full row-start-2 min-w-0 @[44rem]/topic-bar:col-span-1 @[44rem]/topic-bar:col-start-2 @[44rem]/topic-bar:row-start-1">
            <StepStrip strip={strip} marked={marked} />
          </div>
        )}
        {topicId && <TopicOptions topicId={topicId} className="col-start-2 row-start-1 self-start @[44rem]/topic-bar:col-start-3 @[44rem]/topic-bar:self-center" />}
      </div>
    </nav>
  );
}

/**
 * The nearest box around `el` (up to the page) that can still scroll vertically by `deltaY`, or null. A wheel over the
 * strip goes to that box first (T313-T1).
 */
function scrollableAncestor(el: HTMLElement, deltaY: number): Element | null {
  const can = (box: Element) =>
    deltaY > 0 ? box.scrollTop + box.clientHeight < box.scrollHeight - 1 : box.scrollTop > 0;
  for (let box = el.parentElement; box; box = box.parentElement) {
    const { overflowY } = getComputedStyle(box);
    if ((overflowY === "auto" || overflowY === "scroll") && box.scrollHeight > box.clientHeight && can(box)) return box;
  }
  const page = document.scrollingElement;
  return page && page.scrollHeight > page.clientHeight && can(page) ? page : null;
}

/**
 * The Topic bar's step bar: one line that says where the Learner is ("Your turn — Step 7 of 15") with an
 * All steps button, then a segmented bar, one segment per step, grouped by Check; a finished step's segment
 * scrolls the chat back to it. Step names are in the line, the segments' tooltips and names, and the All steps list,
 * which lists every step by number and name and reaches every step the bar does. The bar never numbers or names a
 * Check, and its step names (BAR_STEP_NAMES) have no exam words (#544). The bar keeps the strip's one-line
 * behaviour (#313): with many steps it scrolls sideways (only itself, never the page or the column) so the current
 * step is in view.
 */
function StepStrip({ strip, marked }: { strip: StepSequence; marked: ReadonlySet<number> }) {
  const list = useRef<HTMLOListElement>(null);
  const current = strip.current;
  const [open, setOpen] = useState(false);
  const listId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  // The All steps list floats over the workspace, so a press anywhere outside the step column closes it, as Escape does.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
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
      // Line or page wheels (Firefox) report deltaY in lines or pages, not px.
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * ol.clientHeight : e.deltaY;
      // A box around the strip that can still scroll that way (the capped above-widgets box, the page) gets the wheel
      // first, scrolled here so every platform agrees (Chromium on Windows and Linux would otherwise turn a vertical
      // wheel over this sideways-only strip into a sideways scroll); the strip moves only when no box can (T313-T1).
      const box = scrollableAncestor(ol, dy);
      if (box) {
        e.preventDefault();
        box.scrollTop += dy;
        return;
      }
      const max = ol.scrollWidth - ol.clientWidth;
      if (max <= 0) return;
      const next = Math.min(max, Math.max(0, ol.scrollLeft + dy));
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
  // Re-measure whenever the box OR its content changes size: a new strip (the bar stays mounted across Topics), a
  // segment that becomes a button as a step finishes, a web font loading. Observing the <ol> alone misses those (T313-F1).
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

  const total = strip.steps.length;
  const now = current === null ? null : strip.steps[current];
  const finished = (s: StepPosition) => current === null || s.number - 1 < current;
  const stateOf = (s: StepPosition) => (current === s.number - 1 ? "now" : finished(s) ? "done" : "todo");
  /** Where a step goes when pressed: only a finished one, to its divider (or the Topic Start card) when this Session has it. */
  const jumpOf = (s: StepPosition) => (finished(s) ? targetOf(s, marked) : null);

  /** "Step 2 of 15 · The idea": the bar's tooltips and names. The chat's dividers keep their own stored words. */
  const labelOf = (s: StepPosition) => `Step ${s.number} of ${total} · ${BAR_STEP_NAMES[s.step]}`;

  const segment = (s: StepPosition) => {
    const name = <span className="sr-only">{BAR_STEP_NAMES[s.step]}</span>;
    if (stateOf(s) === "now") {
      return (
        <span aria-current="step" data-step-number={s.number} title={labelOf(s)} className={`${SEG} ${SEG_NOW}`}>
          {name}
        </span>
      );
    }
    const target = jumpOf(s);
    if (target) {
      // Its name says where it goes, so the two Concepts of a Topic are told apart ("Back to Step 2 of 15 · The idea").
      return (
        <Button
          unstyled
          data-affordance="step"
          data-step-number={s.number}
          data-scroll-to={target}
          aria-label={`Back to ${labelOf(s)}`}
          title={`Back to ${labelOf(s)}`}
          onClick={() => scrollTo(target)}
          className={`${SEG} ${SEG_DONE} cursor-pointer rounded-[4px] transition-colors duration-[var(--dur-ui)] hover:bg-[var(--on-band-hover)] ${FOCUS}`}
        >
          {name}
        </Button>
      );
    }
    return (
      <span data-step-number={s.number} title={labelOf(s)} className={`${SEG} ${stateOf(s) === "done" ? SEG_DONE : SEG_TODO}`}>
        {name}
      </span>
    );
  };

  /** A step in the All steps list: "7 Wrap up", with its mark. Never a data-step-number or aria-current: those are the bar's. */
  const listed = (s: StepPosition) => {
    const state = stateOf(s);
    const target = jumpOf(s);
    const words = (
      <>
        <StepMark state={state} />
        <span className="tabular-nums">{s.number}</span> {BAR_STEP_NAMES[s.step]}
      </>
    );
    if (target) {
      return (
        // Blue words that can be pressed are underlined (F4), so a step that goes back reads as a link, never as a key number.
        <Button
          variant="tertiary"
          size="xs"
          data-list-step={s.number}
          data-jump-to={target}
          title={`Back to ${labelOf(s)}`}
          onClick={() => {
            setOpen(false);
            scrollTo(target);
          }}
          className="gap-1.5 px-2 text-[13px] leading-[18px] text-[var(--accent)] underline underline-offset-[3px]"
        >
          {words}
        </Button>
      );
    }
    return (
      <span
        data-list-step={s.number}
        title={labelOf(s)}
        className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] leading-[18px] ${state === "now" ? "bg-[var(--accent-tint)] font-semibold text-[var(--ink)]" : state === "done" ? "text-[var(--ink-2)]" : "text-[var(--muted)]"}`}
      >
        {words}
        <span className="sr-only">{state === "now" ? ", current step" : state === "done" ? ", done" : ", to do"}</span>
      </span>
    );
  };

  return (
    // The step column of the Topic bar's Band: the line and All steps, then the strip; the All steps list floats under it
    // as a card on the Band (band-card, a .popover), so opening it never pushes the conversation or the Widget panel down.
    <div ref={wrap} className="relative">
      <div className="flex min-h-7 items-center justify-between gap-3">
        <p data-testid="current-step" className="min-w-0 truncate text-[13px] leading-[18px]">
          {now ? (
            <>
              <span className="font-medium">{BAR_STEP_NAMES[now.step]}</span>
              <span className="band-faint tabular-nums"> — Step {now.number} of {total}</span>
            </>
          ) : (
            <span className="band-faint">All {total} steps done</span>
          )}
        </p>
        <Button
          ref={toggle}
          variant="tertiary"
          size="xs"
          data-testid="all-steps-toggle"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          onClick={() => setOpen((o) => !o)}
          className="group shrink-0"
        >
          All steps
          <ChevronDown className="group-aria-expanded:rotate-180" />
        </Button>
      </div>
      {/* A scroll box clips what sticks out of it, so the strip keeps 4 px of room inside itself all round for a
          segment's focus ring (a 2 px outline at a 2 px offset), reaching into the bar's padding; and it never scrolls
          up and down. */}
      <ol
        ref={list}
        aria-label="Steps in this Topic"
        data-more-left={more.left || undefined}
        data-more-right={more.right || undefined}
        className={`-mx-1 flex flex-nowrap items-center gap-x-2 overflow-x-auto overflow-y-hidden px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden forced-color-adjust-none ${fade}`}
      >
        {/* Steps outside any Check (Story, Reveal, Principle) stand alone: "Story · The idea, Your turn, Wrap up · … · Reveal · Principle".
            A Check's group is not named or numbered (#544). Each group's width follows its number of steps, so every segment is the same width. */}
        {strip.groups.flatMap((g) => (g.check ? [g] : g.steps.map((s) => ({ check: null, steps: [s] })))).map((g) => (
          <li key={g.steps[0].number} data-strip-group style={{ flexGrow: g.steps.length }} className="flex basis-0 items-center">
            <ol className="flex w-full flex-nowrap items-center gap-x-0.5">
              {g.steps.map((s) => (
                <li key={s.number} className="flex min-w-6 flex-1">
                  {segment(s)}
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
      {open && (
        <div
          id={listId}
          data-testid="all-steps"
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            e.stopPropagation();
            setOpen(false);
            toggle.current?.focus();
          }}
          className="popover band-card absolute right-0 top-full z-30 mt-1 w-[min(28rem,calc(100vw-2*var(--gutter)))] p-2"
        >
          <ol aria-label="All steps" className="flex flex-col gap-1">
            {strip.groups.map((g) => (
              <li key={g.steps[0].number} data-all-steps-group>
                <ol className="flex flex-wrap gap-1">
                  {g.steps.map((s) => (
                    <li key={s.number}>{listed(s)}</li>
                  ))}
                </ol>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// Appendix B.7: primary is used once per view (#478). A panel that shows an enabled primary of its own (a Check's
// Submit or Try again, a Spaced review's Submit answer once a choice is picked, its Next review or Done once marked)
// claims the view's primary while it shows, and the Next chip steps back to secondary until no claim stands.
const ClaimPrimaryContext = createContext<((delta: 1 | -1) => void) | null>(null);
const PrimaryClaimedContext = createContext(false);

/** Holds the panels' claims on the view's one primary: the Study Workspace wraps its columns in it. */
export function PrimaryClaims({ children }: { children: ReactNode }) {
  const [claims, setClaims] = useState(0);
  const claim = useCallback((delta: 1 | -1) => setClaims((n) => n + delta), []);
  return (
    <ClaimPrimaryContext.Provider value={claim}>
      <PrimaryClaimedContext.Provider value={claims > 0}>{children}</PrimaryClaimedContext.Provider>
    </ClaimPrimaryContext.Provider>
  );
}

/** While `active`, this panel's own enabled primary is the view's one: the Next chip steps back to secondary. */
export function useClaimPrimary(active: boolean) {
  const claim = useContext(ClaimPrimaryContext);
  useEffect(() => {
    if (!active || !claim) return;
    claim(1);
    return () => claim(-1);
  }, [active, claim]);
}

/** One Choice as the Study Workspace draws it: the stored item's entry (reply_choices) or code's set. */
export type ChoiceButton = { label: string; says: string };

/**
 * The chips under the latest Tutor reply or card. First the Next chip from the Course Navigator's offer (none
 * while a Check is open): "Next: <step> →", "Complete this Topic →", or "Just tell me →" at an unsettled
 * Explore (which posts "Just tell me." as the Learner's message). Next and Complete send no Learner message:
 * code writes the turn's note. Then the reply's two or three Choices (D3a), which stay during a Check: outline
 * buttons with words only (ADR 0008); a press sends the Choice's index and the server posts its words.
 */
export function Chips({
  offer,
  choices,
  onNext,
  onSay,
  onChoice,
  composing = false,
}: {
  offer: NextOffer | null;
  choices: readonly ChoiceButton[];
  /** The Learner has words in the message box: Send is the view's one primary then, so the Next chip steps back to secondary. */
  composing?: boolean;
  onNext: (named: NextName) => void;
  /** Posts words as the Learner's message: the Just tell me chip. */
  onSay?: (words: string) => void;
  onChoice: (index: number) => void;
}) {
  // The chip pressed shows a spinner at once and the others wait, until the turn takes the chips away (or, if the turn
  // could not start, they come back fresh).
  const [pressed, setPressed] = useState<string | null>(null);
  // A panel's own primary (a Check, a Spaced review) is the main move while it shows.
  const claimed = useContext(PrimaryClaimedContext);
  const press = (offer: NextOffer) => {
    setPressed("next");
    if (offer.kind === "just_tell_me") onSay?.(JUST_TELL_ME);
    else onNext(offer.kind === "complete" ? "complete" : offer.step);
  };
  return (
    // The Next chip is the main move, so it is the view's one primary, on its own row at full size, until the Learner
    // types (then Send is) or a panel claims the primary (useClaimPrimary); the Choices are smaller secondaries,
    // grouped below it (#478, Appendix B.7).
    <div className="mt-3 flex flex-col items-start gap-2" data-testid="choices">
      {offer && (
        <Button variant={composing || claimed ? "secondary" : "primary"} data-testid="next-chip" loading={pressed === "next"} disabled={pressed !== null} onClick={() => press(offer)}>
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
              {choice.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One folded row ("Spaced review [3 due] · Show") that opens in place: a hairline row, not a box. `badge` is a short count
 * or state shown beside the label ("3 due", "marked"); `open` starts it open.
 */
export function FoldedRow({ label, badge, open, children, ...rest }: { label: ReactNode; badge?: ReactNode; open?: boolean; children: ReactNode } & { "data-testid"?: string }) {
  return (
    <details open={open} className="group border-b border-[var(--rule)]" {...rest}>
      <summary className={`group/row flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 rounded-[4px] py-2 text-sm leading-5 [&::-webkit-details-marker]:hidden ${FOCUS}`}>
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium text-[var(--ink)]">{label}</span>
          {badge && (
            <>
              <span className="sr-only"> · </span>
              <span data-testid="folded-badge" className="inline-flex h-5 shrink-0 items-center rounded-[6px] bg-[var(--accent-tint)] px-1.5 text-xs font-semibold tabular-nums text-[var(--accent)]">
                {badge}
              </span>
            </>
          )}
        </span>
        {/* Blue words that can be pressed are underlined at rest (spec 2026-11-12 F4), as every link in a reading area is. */}
        <span className="flex shrink-0 items-center gap-1.5 text-[13px] font-medium leading-[18px] text-[var(--accent)] underline underline-offset-[3px]">
          <span className="group-open:hidden">Show</span>
          <span className="hidden group-open:inline">Hide</span>
          <Chevron />
        </span>
      </summary>
      <div className="pb-4 pt-1">{children}</div>
    </details>
  );
}
