import type { ReactNode } from "react";
import { TOPIC_START, type TopicStartData } from "@/course/topic-start";
import {
  CHECK_RESULT,
  CONCEPT_CARD,
  DUE_CHECK,
  NEXT_STEP,
  OFF_TOPIC,
  PICKING_UP,
  QUICK_TRY,
  QUICK_TRY_RESULT,
  STEP_DIVIDER,
  STOPPED,
  type OffTopicData,
  type SessionItem,
} from "@/tutor/session-item-kinds";
import { ConceptCardView, conceptCardOf } from "./concept-card-view";
import { QuickTryResultView, QuickTryView, quickTryOf, quickTryResultOf } from "./quick-try-view";
import { ownRuleOf, OWN_RULE_SAVED } from "@/tutor/own-rule-item";
import { TOPIC_COMPLETE, type TopicCompleteData } from "@/tutor/topic-complete-card";
import { OwnRuleLine } from "./own-rule-line";
import { TopicCompleteCard } from "./topic-complete-card";
import { TopicStartCard } from "./topic-start-card";
import { TOPIC_START_ANCHOR } from "./topic-start-card";
import { stepAnchor } from "./workspace-parts";

/**
 * How the thread draws a Session item (src/tutor/session-items.ts), by its kind. Items are display-only: they
 * sit between messages and are never sent to the model. A kind with no view here (one added by a later
 * change, or an old one removed) draws nothing, so it never breaks the thread. Later dividers and cards
 * plug in by adding their kind (session-item-kinds.ts) to VIEWS; a Widget opened chip is the one kind the
 * thread draws itself (thread.tsx), as the Widget it opens.
 */

/** A Session item as the browser has it: its kind and its data. */
export type SessionItemData = SessionItem;

/** A small centred line across the thread with a short label: "Step 3 of 9 · Your turn". */
function Divider({ label, testId, id }: { label: string; testId: string; id?: string }) {
  return (
    <div id={id} role="separator" aria-label={label} data-testid={testId} className="flex items-center justify-center gap-3 py-1 text-xs leading-4 text-[var(--muted)]">
      <span aria-hidden className="h-px flex-1 bg-[var(--border)]" />
      <span>{label}</span>
      <span aria-hidden className="h-px flex-1 bg-[var(--border)]" />
    </div>
  );
}

/** A Check's result in the conversation: a small card with its words, "2 of 3 — passed ✓" or "Check 2 — not passed yet". */
function ResultCard({ label, passed }: { label: string; passed: boolean }) {
  return (
    <div data-testid="check-result-card" className="self-start rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium leading-5">
      <span className={passed ? "text-[var(--you)]" : undefined}>{label}</span>
    </div>
  );
}

/** An Off-Topic answer's marker: a quiet line under the answer, with a way back to the Topic's step (or its start). */
function OffTopicBlock({ data }: { data: OffTopicData }) {
  const target = typeof data.step === "number" ? stepAnchor(data.step) : TOPIC_START_ANCHOR;
  return (
    <div data-testid="off-topic-block" className="flex flex-wrap items-center gap-x-3 border-l-2 border-[var(--border)] pl-3 text-xs leading-5 text-[var(--muted)]">
      <span>Off-Topic answer</span>
      <button
        type="button"
        data-testid="off-topic-back"
        onClick={() => document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" })}
        className="rounded underline decoration-[var(--border)] underline-offset-2 hover:text-[var(--ink)]"
      >
        ↩ Back to {data.title}
      </button>
    </div>
  );
}

const VIEWS: Record<string, (data: Record<string, unknown>) => ReactNode> = {
  // A Check's result: a quiz's when it is submitted, a conversation Check's when the Tutor records its verdict.
  [CHECK_RESULT]: (data) => (typeof data.label === "string" ? <ResultCard label={data.label} passed={data.passed === true} /> : null),
  // Stored when the Learner moves onto a new Teaching Step; the Topic bar's strip scrolls back to it by its anchor.
  [STEP_DIVIDER]: (data) =>
    typeof data.label === "string" ? (
      <Divider label={data.label} testId="step-divider" id={typeof data.number === "number" ? stepAnchor(data.number) : undefined} />
    ) : null,
  // Coming back after a break, or to a carried-over Topic: "Picking up where you left off · Step 6 of 10 · Concept".
  [PICKING_UP]: (data) => (typeof data.label === "string" ? <Divider label={data.label} testId="picking-up-divider" /> : null),
  // A Due Check reopened a passed Topic's Session: "New Check · Check 3", or "New step · Explore".
  [DUE_CHECK]: (data) => (typeof data.label === "string" ? <Divider label={data.label} testId="due-check-divider" /> : null),
  // Stored after a reply the Learner stopped, and drawn the moment they stop it: a small muted note.
  [STOPPED]: () => (
    <p data-testid="stopped-note" className="self-start text-xs leading-4 text-[var(--muted)]">
      Stopped
    </p>
  ),
  // Stored after a Tutor answer that left the Topic: "Off-Topic answer · ↩ Back to <Topic>".
  [OFF_TOPIC]: (data) => (typeof data.title === "string" && typeof data.topicId === "string" ? <OffTopicBlock data={data as OffTopicData} /> : null),
  // Stored when the Tutor saves the Learner's own rule to their Topic Note: "Saved to your notes · Undo · Open notes".
  [OWN_RULE_SAVED]: (data) => {
    const rule = ownRuleOf({ kind: OWN_RULE_SAVED, data });
    return rule ? <OwnRuleLine data={rule} /> : null;
  },
  // Never stored: an old "Continue." message, drawn in the thread and on Past Sessions pages as where the next step began.
  [NEXT_STEP]: () => <Divider label="→ next step" testId="next-step-divider" />,
  // Stored when the Topic is passed, at the end of its conversation: the principle, Saved to your Notes ✓, What comes next and the Course Map.
  [TOPIC_COMPLETE]: (data) => (typeof data.title === "string" && typeof data.principle === "string" ? <TopicCompleteCard card={data as TopicCompleteData} /> : null),
  // Never stored: the Topic Start card, worked out from course data on each render as the conversation's first item.
  [TOPIC_START]: (data) => (typeof data.title === "string" ? <TopicStartCard card={data as TopicStartData} /> : null),
  // Stored when the Learner enters a converted Concept step: the card's plain lines, the write-down line in bold.
  [CONCEPT_CARD]: (data) => {
    const card = conceptCardOf(data);
    return card ? <ConceptCardView card={card} /> : null;
  },
  // One Quick try at a converted Your turn, with its own input (QuickTryContext; read-only without one).
  [QUICK_TRY]: (data) => {
    const t = quickTryOf(data);
    return t ? <QuickTryView data={t} /> : null;
  },
  // A Quick try's mark: "Right.", the Known mistake's fix, or "Not quite.".
  [QUICK_TRY_RESULT]: (data) => {
    const r = quickTryResultOf(data);
    return r ? <QuickTryResultView data={r} /> : null;
  },
};

/** The item drawn by its kind; nothing for a kind it does not know. */
export function SessionItemView({ item }: { item: SessionItemData }) {
  return VIEWS[item.kind]?.(item.data) ?? null;
}
