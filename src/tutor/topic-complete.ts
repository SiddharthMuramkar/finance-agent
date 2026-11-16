import { and, desc, eq, inArray } from "drizzle-orm";
import type { CourseMap } from "@/course/map";
import { navigate, whatComesNext } from "@/course/navigator";
import { foundLines } from "@/course/outcome";
import { sessionItems, sessions } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadProgress } from "@/learner/memory";
import { loadWidgetStates } from "@/learner/widget-state";
import type { WidgetStates } from "@/widgets/widget-state";
import { DUE_CHECK } from "./coming-back";
import { saveItemAfterLatest, type SessionItem } from "./session-items";
import { principleLine, TOPIC_COMPLETE, type TopicCompleteData } from "./topic-complete-card";

export { TOPIC_COMPLETE, type TopicCompleteData } from "./topic-complete-card";

/**
 * The Topic complete card: a display-only Session item stored at the end of a Topic's conversation when the
 * Topic is passed (its Principle finished, or its last Due Check passed). It shows the principle in a line or
 * two, "Saved to your Notebook ✓", What comes next and the Course Map; the model never sees it. It is stored by
 * the turn that passed the Topic, after its closing reply, or with a quiz result that passed the last Due Check.
 * It also says What the Learner found, which is never stored: see `cardFound`.
 */

/**
 * What the Learner found, a line each, for a Topic complete card of `topicId`, from its Session's saved Widget state
 * (none for a Topic no longer on the Course Map). Worked out each time the card is drawn, never stored: the turn or
 * quiz that stores the card sends it with these, and the pages add them to every stored card, old ones too.
 */
export function cardFound(map: CourseMap, topicId: unknown, states: WidgetStates): string[] {
  const topic = typeof topicId === "string" ? map.topic(topicId) : undefined;
  return topic ? foundLines(topic, states) : [];
}

/**
 * Stores the Topic complete card after the Session's latest message when its Topic is passed and the card is
 * owed: the Topic is not being reopened for a Due Check, and no card follows the Session's latest Due Check
 * divider (or, with none, the Session has no card yet). Returns the card it stored, with What the Learner found in
 * the Session so far, for the browser to draw at once; or null.
 */
export async function storeTopicComplete(db: Db, map: CourseMap, learnerId: number, sessionId: number, now: Date): Promise<SessionItem | null> {
  const [session] = await db
    .select({ topicId: sessions.topicId })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.learnerId, learnerId)));
  const topic = session?.topicId ? map.topic(session.topicId) : undefined;
  if (!topic) return null;
  const progress = await loadProgress(db, learnerId);
  if (progress.topics[topic.id]?.status !== "passed" || navigate(map, progress)?.topic.id === topic.id) return null;
  const [latest] = await db
    .select({ kind: sessionItems.kind })
    .from(sessionItems)
    .where(and(eq(sessionItems.sessionId, sessionId), eq(sessionItems.learnerId, learnerId), inArray(sessionItems.kind, [TOPIC_COMPLETE, DUE_CHECK])))
    .orderBy(desc(sessionItems.afterSeq), desc(sessionItems.id))
    .limit(1);
  if (latest?.kind === TOPIC_COMPLETE) return null;
  const data: TopicCompleteData = { topicId: topic.id, title: topic.title, principle: principleLine(topic.principle), next: whatComesNext(map, progress)?.label ?? null, ...(topic.dailyLife && { dailyLife: topic.dailyLife }) };
  await saveItemAfterLatest(db, learnerId, sessionId, { kind: TOPIC_COMPLETE, data }, now);
  const found = cardFound(map, topic.id, await loadWidgetStates(db, sessionId, learnerId));
  return { kind: TOPIC_COMPLETE, data: { ...data, found } };
}
