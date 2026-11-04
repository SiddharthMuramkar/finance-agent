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

export { WIDGET_SHOWN } from "@/widgets/shown-widget";
