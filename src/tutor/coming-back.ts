import { eq, max } from "drizzle-orm";
import type { CourseMap } from "@/course/map";
import { navigate, stepSequence, STEP_NAMES } from "@/course/navigator";
import { messages, settings } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadProgress } from "@/learner/memory";
import { saveItemAfterLatest, loadSessionItems, type SessionItem } from "./session-items";
import { DUE_CHECK, PICKING_UP } from "./session-item-kinds";
import { DEFAULT_SETTINGS, liveSession } from "./session-log";

/**
 * Coming back to a Topic: the dividers that mark why the Learner is here. They are worked out by code from
 * the Learner's place and the gap since the Session's last message, with no model call. The Study Workspace
 * draws them at the end of the thread, and they are stored only with the Learner's next action (a turn), so
 * drawing a page never adds a row.
 * - "Picking up where you left off · Step k of N · <step>": after a gap longer than the idle setting, or on a
 *   Topic carried over from before one Session per Topic (started, with no message in its own Session yet).
 * - "New Check · Check N" (or "New step · Explore"): a passed Topic gained a required Check (or a required
 *   Explore), and the Course Navigator takes the Learner back to it, in the Topic's own Session. It takes the
 *   place of Picking up, and marks each Due Check run once.
 */

export { DUE_CHECK, PICKING_UP };

/** How long a gap counts as a break, read without writing (a page render stores nothing). */
async function idleHours(db: Db): Promise<number> {
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, "session_idle_hours"));
  return Number(row?.value ?? DEFAULT_SETTINGS.session_idle_hours);
}

/**
 * The dividers the Learner's current Topic draws now and their next action stores: none while they are in
 * the middle of things, or once every Topic is passed.
 */
export async function comingBackItems(db: Db, map: CourseMap, learnerId: number, now: Date): Promise<SessionItem[]> {
  const progress = await loadProgress(db, learnerId);
  const place = navigate(map, progress);
  if (!place || place.status === "not_started") return [];
  const seq = stepSequence(map, progress, place.topic.id);
  if (!seq || seq.current === null) return [];
  const at = seq.steps[seq.current];
  const pickingUp: SessionItem = { kind: PICKING_UP, data: { step: at.step, number: at.number, label: `Picking up where you left off · ${at.label}` } };

  const session = await liveSession(db, learnerId, place.topic.id);
  const [last] = session
    ? await db
        .select({ seq: max(messages.seq), at: max(messages.createdAt) })
        .from(messages)
        .where(eq(messages.sessionId, session.id))
    : [];
  const stored = session ? await loadSessionItems(db, session.id, learnerId) : [];
  if (seq.dueRun) {
    // What is due in this run: a due Explore and each due Check. A run marked once is not marked again.
    const keys = [...new Set(seq.steps.map((s) => s.check?.id ?? s.step))];
    const marked = stored.some((i) => i.kind === DUE_CHECK && Array.isArray(i.data.keys) && i.data.keys.some((k) => keys.includes(k as string)));
    if (!marked) {
      const first = seq.steps[0];
      const label = first.check ? `New Check · Check ${first.check.number}` : `New step · ${STEP_NAMES[first.step]}`;
      return [{ kind: DUE_CHECK, data: { keys, label } }];
    }
  }
  if (!session || last?.seq === null || last?.seq === undefined) {
    // A started Topic whose own Session has no message yet: carried over from an Older Session.
    return stored.some((i) => i.kind === PICKING_UP) ? [] : [pickingUp];
  }
  const gap = now.getTime() - new Date(last.at!).getTime();
  if (gap <= (await idleHours(db)) * 3600_000) return [];
  // Already stored after the latest message (a turn that failed before saving the Learner's message).
  if (stored.some((i) => i.kind === PICKING_UP && i.afterSeq === last.seq)) return [];
  return [pickingUp];
}

/** Stores the dividers worked out before the Learner's action, after the Session's latest message. */
export async function storeComingBack(db: Db, learnerId: number, sessionId: number, items: SessionItem[], now: Date): Promise<void> {
  for (const item of items) await saveItemAfterLatest(db, learnerId, sessionId, item, now);
}
