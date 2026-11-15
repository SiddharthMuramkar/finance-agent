import { and, eq, gt, lt, sql } from "drizzle-orm";
import type { CourseMap } from "@/course/map";
import { messages, toolCalls, turns } from "@/db/schema";
import type { Db } from "@/db/types";
import { pendingQuizNote } from "@/learner/quiz";
import { DUE_CHECK } from "./session-item-kinds";
import { liveSession } from "./session-log";
import { loadSessionItems, STEP_DIVIDER, type SessionItem } from "./session-items";

/**
 * Pacing (ADR 0001): whether the Learner's current Teaching Step has been taught yet. A step is taught in one
 * reply and finished, its Check marked or its Insight attempt recorded only in a later turn, once the Learner has
 * answered; code holds that, not the prompt. There is no column for it: the answer is read from the marks code
 * already leaves when it moves the Learner on, and every reader asks here.
 * - The turn's fresh-step mark (turns.started_topic): the step began before this turn's reply without being taught.
 *   The turn started the Topic, or is an Opener or a Next, or a Due Check reopened a passed Topic, or a quiz pass
 *   marked by code moved the Learner on.
 * - A tool call in this turn that moved the Learner on (tool_calls.began_step).
 * - A step divider with no Tutor reply after it: code moved the Learner on between replies (a right Quick try that
 *   finished Your turn, a step finished from a Widget) and no reply has taught the new step since.
 */

/**
 * Whether the Session's latest step divider has no Tutor reply after it. With `beforeSeq` (a turn's first message),
 * only replies before it count: the ones the Learner has read and answered. A refreeze summary (compaction) is stored as
 * a Tutor row but teaches nothing, so it never counts.
 */
async function dividerUntaught(db: Db, sessionId: number, learnerId: number, beforeSeq?: number): Promise<boolean> {
  const divider = (await loadSessionItems(db, sessionId, learnerId)).findLast((i) => i.kind === STEP_DIVIDER);
  if (!divider) return false;
  const replies = [
    eq(messages.sessionId, sessionId),
    eq(messages.role, "assistant"),
    gt(messages.seq, divider.afterSeq),
    sql`not (${messages.content} @> '[{"type":"compaction"}]'::jsonb)`,
  ];
  if (beforeSeq !== undefined) replies.push(lt(messages.seq, beforeSeq));
  const [later] = await db.select({ id: messages.id }).from(messages).where(and(...replies)).limit(1);
  return !later;
}

/**
 * In a Tutor turn: whether the Learner's current step began during it, so no reply they have answered has taught it.
 * Then the turn cannot finish the step, record its Check verdict or record an Insight attempt at it.
 */
export async function stepBeganThisTurn(db: Db, turnId: number): Promise<boolean> {
  const [turn] = await db
    .select({ freshStep: turns.freshStep, learnerId: turns.learnerId, sessionId: turns.sessionId, turnSeq: turns.turnSeq })
    .from(turns)
    .where(eq(turns.id, turnId));
  if (!turn) return false;
  if (turn.freshStep) return true;
  const [began] = await db
    .select({ id: toolCalls.toolCallId })
    .from(toolCalls)
    .where(and(eq(toolCalls.turnId, turnId), eq(toolCalls.beganStep, true)))
    .limit(1);
  if (began) return true;
  // A turn repairing an earlier cut-off before it has its own first message counts every reply so far.
  return turn.sessionId !== null && dividerUntaught(db, turn.sessionId, turn.learnerId, turn.turnSeq ?? undefined);
}

/**
 * Between turns: whether the Learner's current step in a Topic has been taught in its Session, which decides what the
 * Next chip offers. A step reached outside a Tutor turn has not been: a quiz pass marked by code moved the Learner on
 * and the Tutor has not heard of it yet; a Due Check reopening a passed Topic starts a step nothing has taught
 * (`comingBack` is what comingBackItems gives now, its divider not yet stored); or code stored the step's divider and
 * no reply has followed it.
 */
export async function stepTaught(db: Db, map: CourseMap, learnerId: number, topicId: string, comingBack: SessionItem[]): Promise<boolean> {
  if (comingBack.some((i) => i.kind === DUE_CHECK)) return false;
  const session = await liveSession(db, learnerId, topicId);
  if (session && (await dividerUntaught(db, session.id, learnerId))) return false;
  return !(await pendingQuizNote(db, map, learnerId, topicId))?.passed;
}
