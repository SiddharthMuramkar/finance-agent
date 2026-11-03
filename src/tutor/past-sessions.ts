import { and, asc, desc, eq, inArray, max } from "drizzle-orm";
import type { CourseMap } from "@/course/map";
import { messages, sessions } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadProgress } from "@/learner/memory";
import { summariseRows } from "./session-summary";

/**
 * What Past Sessions lists (spec #119, "Pages › Past Sessions"), worked out by code. No model call.
 * - A Topic Session (ADR 0004) is one row, titled by its Topic, ordered by the Learner's last activity in it.
 *   The every-Topic-passed Session (no Topic) is a row of its own, titled FREE_QUESTIONS.
 * - Every Session from before one Session per Topic is Older: its own group, by the date it began, with the
 *   Topics its messages named.
 */

/** The title of the every-Topic-passed Session, which has no Topic. */
export const FREE_QUESTIONS = "Free questions";

export type TopicSessionRow = { id: number; topicId: string | null; title: string; lastActive: Date };
export type OlderSessionRow = { id: number; date: Date; topics: string[] };
export type PastSessions = { topics: TopicSessionRow[]; older: OlderSessionRow[] };

/** A Past Session page's header: a Topic Session's Topic, last activity and whether it passed, or an Older Session's date and Topics. */
export type PastSessionHeader =
  | { kind: "topic"; topicId: string | null; title: string; lastActive: Date; passed: boolean }
  | { kind: "older"; date: Date; topics: string[] };

const titleOf = (map: CourseMap, topicId: string | null) => (topicId === null ? FREE_QUESTIONS : (map.topic(topicId)?.title ?? topicId));

/** The Learner's Sessions with their last activity: the latest message (or the Session's start), and its id to break ties. */
async function sessionsWithActivity(db: Db, learnerId: number, sessionId?: number) {
  const rows = await db
    .select({ id: sessions.id, topicId: sessions.topicId, older: sessions.older, createdAt: sessions.createdAt, lastAt: max(messages.createdAt), lastId: max(messages.id) })
    .from(sessions)
    .leftJoin(messages, eq(messages.sessionId, sessions.id))
    .where(sessionId === undefined ? eq(sessions.learnerId, learnerId) : and(eq(sessions.learnerId, learnerId), eq(sessions.id, sessionId)))
    .groupBy(sessions.id)
    .orderBy(desc(sessions.id));
  return rows.map((r) => ({ ...r, lastActive: r.lastAt ? new Date(r.lastAt) : r.createdAt }));
}

/** Topics an Older Session's messages named, in order. */
async function olderTopics(db: Db, ids: number[]): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>(ids.map((id) => [id, []]));
  if (ids.length === 0) return out;
  const rows = await db.select({ sessionId: messages.sessionId, role: messages.role, content: messages.content }).from(messages)
    .where(inArray(messages.sessionId, ids))
    .orderBy(asc(messages.sessionId), asc(messages.seq));
  for (const id of ids) out.set(id, summariseRows(rows.filter((r) => r.sessionId === id)).topics);
  return out;
}

/** The Learner's Past Sessions: Topic Sessions, the most recently worked on first, and the Older ones, newest first. */
export async function loadPastSessions(db: Db, map: CourseMap, learnerId: number): Promise<PastSessions> {
  const all = await sessionsWithActivity(db, learnerId);
  const topics = all
    .filter((s) => !s.older)
    .sort((a, b) => b.lastActive.getTime() - a.lastActive.getTime() || (b.lastId ?? 0) - (a.lastId ?? 0) || b.id - a.id)
    .map((s) => ({ id: s.id, topicId: s.topicId, title: titleOf(map, s.topicId), lastActive: s.lastActive }));
  const olderRows = all.filter((s) => s.older);
  const named = await olderTopics(db, olderRows.map((s) => s.id));
  return { topics, older: olderRows.map((s) => ({ id: s.id, date: s.createdAt, topics: named.get(s.id) ?? [] })) };
}

/** One of the Learner's Sessions as its page's header shows it; null for an id that is not theirs. */
export async function loadPastSession(db: Db, map: CourseMap, sessionId: number, learnerId: number): Promise<PastSessionHeader | null> {
  const [s] = await sessionsWithActivity(db, learnerId, sessionId);
  if (!s) return null;
  if (s.older) return { kind: "older", date: s.createdAt, topics: (await olderTopics(db, [s.id])).get(s.id) ?? [] };
  const progress = await loadProgress(db, learnerId);
  const passed = s.topicId !== null && progress.topics[s.topicId]?.status === "passed";
  return { kind: "topic", topicId: s.topicId, title: titleOf(map, s.topicId), lastActive: s.lastActive, passed };
}
