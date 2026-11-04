/**
 * The Session item type and the kinds the Study Workspace draws, with no server imports, so the browser can match
 * on them (see session-items.ts). The Topic complete card's kind is in topic-complete-card.ts, the Topic Start
 * card's in course/topic-start.ts, a Widget opened chip's in course/written-ahead.ts and a shown Widget's (WIDGET_SHOWN,
 * re-exported here) in widgets/shown-widget.ts, for the same reason.
 */

export type SessionItem = { kind: string; data: Record<string, unknown> };

/** The kind of a "Step k of N · <step>" divider, stored when the Learner moves onto a new Teaching Step. */
export const STEP_DIVIDER = "step";

/** The kind of a "Picking up where you left off" divider. */
export const PICKING_UP = "picking_up";

/** The kind of a "New Check · Check N" or "New step · Explore" divider: a Due Check reopened the passed Topic's Session. */
export const DUE_CHECK = "due_check";

/** The kind of a Check result card. */
export const CHECK_RESULT = "check_result";

/** Never stored: an old "Continue." message, drawn as a "→ next step" divider where the next step began. */
export const NEXT_STEP = "next_step";

/** The kind of a small "Stopped" note, stored after a reply the Learner stopped, so a reload shows where it ended. */
export const STOPPED = "stopped";

/** The kind of an Off-Topic answer block: a quiet marker stored after a Tutor answer that left the Topic, with a way back. */
export const OFF_TOPIC = "off_topic";

/** The block's data: the Topic to go back to, and the number of the step the Learner was at (its divider's anchor), if known. */
export type OffTopicData = { topicId: string; title: string; step?: number };

export { WIDGET_SHOWN } from "@/widgets/shown-widget";

/** The kind of a Concept card: code stores it when the Learner enters a converted Concept step (spec #229). */
export const CONCEPT_CARD = "concept_card";

/** A Concept card's data, copied from the Topic file so a reload shows the same card. */
export type ConceptCardData = { checkId: string; title: string; lines: string[]; writeDown: string };

/** The kind of a Quick try: one short question at a converted Your turn, answered in its own input. */
export const QUICK_TRY = "quick_try";

/**
 * A Quick try's data. Never its answer: the server works that out again from the Topic file, the key naming the item
 * and seeding the draw. `halfDone` is the first step, shown done above the ask; `drill` places it in a drill of `of`.
 */
export type QuickTryData = {
  key: string;
  checkId: string;
  skillId: string;
  prompt: string;
  kind: "number" | "truth";
  unit?: string;
  halfDone?: string;
  drill?: { n: number; of: number; reason: string };
};

/** The kind of a Quick try's result: its verdict, and the line the Learner reads under it. */
export const QUICK_TRY_RESULT = "quick_try_result";

/** A Quick try result's data. The line is "Right.", the Known mistake's fix, or "Not quite.". */
export type QuickTryResultData = { key: string; verdict: "right" | "known_mistake" | "wrong"; line: string };
