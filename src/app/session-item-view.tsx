import type { ReactNode } from "react";
import { TOPIC_START, type TopicStartData } from "@/course/topic-start";
import { CHECK_RESULT, DUE_CHECK, NEXT_STEP, PICKING_UP, STEP_DIVIDER, type SessionItem } from "@/tutor/session-item-kinds";
import { TOPIC_COMPLETE, type TopicCompleteData } from "@/tutor/topic-complete-card";
import { TopicCompleteCard } from "./topic-complete-card";
import { TopicStartCard } from "./topic-start-card";
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
  // Never stored: an old "Continue." message, drawn in the thread and on Past Sessions pages as where the next step began.
  [NEXT_STEP]: () => <Divider label="→ next step" testId="next-step-divider" />,
  // Stored when the Topic is passed, at the end of its conversation: the principle, Saved to your Notes ✓, What comes next and the Course Map.
  [TOPIC_COMPLETE]: (data) => (typeof data.title === "string" && typeof data.principle === "string" ? <TopicCompleteCard card={data as TopicCompleteData} /> : null),
  // Never stored: the Topic Start card, worked out from course data on each render as the conversation's first item.
  [TOPIC_START]: (data) => (typeof data.title === "string" ? <TopicStartCard card={data as TopicStartData} /> : null),
};

/** The item drawn by its kind; nothing for a kind it does not know. */
export function SessionItemView({ item }: { item: SessionItemData }) {
  return VIEWS[item.kind]?.(item.data) ?? null;
}
