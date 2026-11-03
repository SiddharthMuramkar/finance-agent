import { and, desc, eq, inArray } from "drizzle-orm";
import type { CourseMap } from "@/course/map";
import { navigate, whatComesNext } from "@/course/navigator";
import { sessionItems, sessions } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadProgress } from "@/learner/memory";
import { DUE_CHECK } from "./coming-back";
import { saveItemAfterLatest, type SessionItem } from "./session-items";

/**
 * The Topic complete card: a display-only Session item stored at the end of a Topic's conversation when the
 * Topic is passed (its Principle finished, or its last Due Check passed). It shows the principle in a line or
 * two, "Saved to your Notes ✓", What comes next and the Course Map; the model never sees it. It is stored by
 * the turn that passed the Topic, after its closing reply, or with a quiz result that passed the last Due Check.
 */

/** The kind of a Topic complete card. */
export const TOPIC_COMPLETE = "topic_complete";

/** The card's data: the passed Topic, its principle's first sentence, and What comes next's label when it was stored (null: every Topic passed). */
export type TopicCompleteData = { topicId: string; title: string; principle: string; next: string | null };

/** The principle in one or two lines: its first sentence. */
export function principleLine(principle: string): string {
  const flat = principle.replace(/\s+/g, " ").trim();
  return flat.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? flat;
}

/**
 * Stores the Topic complete card after the Session's latest message when its Topic is passed and the card is
 * owed: the Topic is not being reopened for a Due Check, and no card follows the Session's latest Due Check
 * divider (or, with none, the Session has no card yet). Returns the card it stored, or null.
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
  const data: TopicCompleteData = { topicId: topic.id, title: topic.title, principle: principleLine(topic.principle), next: whatComesNext(map, progress)?.label ?? null };
  const item = { kind: TOPIC_COMPLETE, data };
  await saveItemAfterLatest(db, learnerId, sessionId, item, now);
  return item;
}
