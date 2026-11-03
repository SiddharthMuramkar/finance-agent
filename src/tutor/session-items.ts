import { and, asc, eq, max } from "drizzle-orm";
import type { CourseMap } from "@/course/map";
import { stepSequence, type Progress } from "@/course/navigator";
import { messages, sessionItems } from "@/db/schema";
import type { Db } from "@/db/types";

/**
 * Session items: what the Study Workspace draws between messages and never sends to the model (step
 * dividers now; "Picking up" and Due Check dividers, Check result cards and Topic complete cards later).
 * Each is stored in order, after the message it follows, with a kind and its data; the thread draws
 * each by its kind and skips a kind it does not know. The model's history is read only from the
 * messages table (session-log.ts), so nothing here ever reaches a request.
 */

export type SessionItem = { kind: string; data: Record<string, unknown> };
/** A stored item: it sits after the message with seq `afterSeq` in its Session (-1: before the first). */
export type StoredItem = SessionItem & { afterSeq: number };

/** The kind of a "Step k of N · <step>" divider, stored when the Learner moves onto a new Teaching Step. */
export const STEP_DIVIDER = "step";

/**
 * The divider for the Learner's place in a Topic, numbered and named by the Course Navigator
 * ("Step 3 of 9 · Your turn"), or null when the Topic has no current step (it is passed).
 */
export function stepDivider(map: CourseMap, progress: Progress, topicId: string): SessionItem | null {
  const seq = stepSequence(map, progress, topicId);
  if (!seq || seq.current === null) return null;
  const at = seq.steps[seq.current];
  return { kind: STEP_DIVIDER, data: { step: at.step, number: at.number, label: at.label } };
}

/** Stores an item after the Session's latest message (the one it follows). */
export async function saveItemAfterLatest(db: Db, learnerId: number, sessionId: number, item: SessionItem, now: Date): Promise<void> {
  const [{ last }] = await db.select({ last: max(messages.seq) }).from(messages).where(eq(messages.sessionId, sessionId));
  await db.insert(sessionItems).values({ learnerId, sessionId, afterSeq: last ?? -1, kind: item.kind, data: item.data, createdAt: now });
}

/** The Learner's items in one of their Sessions, in order; another Learner's Session has none. */
export async function loadSessionItems(db: Db, sessionId: number, learnerId: number): Promise<StoredItem[]> {
  return db
    .select({ afterSeq: sessionItems.afterSeq, kind: sessionItems.kind, data: sessionItems.data })
    .from(sessionItems)
    .where(and(eq(sessionItems.sessionId, sessionId), eq(sessionItems.learnerId, learnerId)))
    .orderBy(asc(sessionItems.afterSeq), asc(sessionItems.id));
}
