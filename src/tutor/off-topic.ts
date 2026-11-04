import { and, eq } from "drizzle-orm";
import type { CourseMap } from "@/course/map";
import { navigate } from "@/course/navigator";
import { sessions } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadProgress } from "@/learner/memory";
import { saveItemAfterLatest, stepDivider } from "./session-items";
import { OFF_TOPIC, type OffTopicData, type SessionItem } from "./session-item-kinds";

/**
 * The Off-Topic answer block: a quiet display-only Session item stored after a Tutor answer that left the Topic, with
 * "↩ Back to <Topic>" (src/app/session-item-view.tsx). It marks the answer; it never moves the Learner to another Topic
 * (one Session per Topic, ADR 0004), and the model never sees it.
 */

/** The block for a Session's Topic, pointing back at the Learner's current step; null for a Session with no Topic on the Course Map. */
export async function offTopicItem(db: Db, map: CourseMap, learnerId: number, sessionId: number): Promise<SessionItem | null> {
  const [session] = await db
    .select({ topicId: sessions.topicId })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.learnerId, learnerId)));
  const topic = session?.topicId ? map.topic(session.topicId) : undefined;
  if (!topic) return null;
  const progress = await loadProgress(db, learnerId);
  const here = navigate(map, progress)?.topic.id === topic.id ? stepDivider(map, progress, topic.id) : null;
  const data: OffTopicData = { topicId: topic.id, title: topic.title, ...(typeof here?.data.number === "number" && { step: here.data.number }) };
  return { kind: OFF_TOPIC, data };
}

/** Stores the block after the Session's latest message and returns it, or null (nothing stored). */
export async function storeOffTopic(db: Db, map: CourseMap, learnerId: number, sessionId: number, now: Date): Promise<SessionItem | null> {
  const item = await offTopicItem(db, map, learnerId, sessionId);
  if (item) await saveItemAfterLatest(db, learnerId, sessionId, item, now);
  return item;
}
