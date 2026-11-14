import { recordIncident } from "@/tutor/incidents";
import type { Db } from "@/db/types";

/**
 * Widget state save timing (spec 2026-11-12 A9): a save's budget is 0.5 s at the median and 1 s at the 95th percentile,
 * and it never waits for a turn. The route times each save from the request's arrival to its answer; a save over 0.5 s
 * is recorded as one `tutor_incidents` row of kind `widget_save_slow` with its time, so the Tutor speed report counts
 * how many saves broke each budget line. Saves within budget are not stored (there is no timing table without a
 * migration), so the report gives counts over each line, not a median.
 */
export const WIDGET_SAVE_BUDGET = { medianMs: 500, p95Ms: 1000 } as const;

export const WIDGET_SAVE_SLOW = "widget_save_slow";

/** Which budget line a save's time crossed: none, the median's (over 0.5 s) or the 95th percentile's (over 1 s). */
export function saveOverBudget(ms: number): "none" | "median" | "p95" {
  if (ms > WIDGET_SAVE_BUDGET.p95Ms) return "p95";
  if (ms > WIDGET_SAVE_BUDGET.medianMs) return "median";
  return "none";
}

/** Records a save that took longer than 0.5 s; one within budget writes nothing. Fails soft, like every incident. */
export async function recordSaveTime(db: Db, save: { learnerId: number; sessionId: number; widgetKey: string; ms: number }): Promise<boolean> {
  const over = saveOverBudget(save.ms);
  if (over === "none") return false;
  await recordIncident(db, {
    learnerId: save.learnerId,
    sessionId: save.sessionId,
    turnId: null,
    kind: WIDGET_SAVE_SLOW,
    requestId: null,
    detail: { ms: Math.round(save.ms), over, widgetKey: save.widgetKey },
  });
  return true;
}
