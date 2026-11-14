import { and, asc, desc, eq, inArray, max } from "drizzle-orm";
import type { CourseMap } from "@/course/map";
import { foundLines } from "@/course/outcome";
import { messages, sessions, topicRestarts, widgetState } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadProgress } from "@/learner/memory";
import { summariseRows } from "./session-summary";

/**
 * What the Notebook lists (spec #119, then 2026-11-05 B2a), worked out by code. No model call.
 * - A Topic Session (ADR 0004) is one row, titled by its Topic, ordered by the Learner's last activity in it.
 *   The every-Topic-passed Session (no Topic) is a row of its own, titled FREE_QUESTIONS.
 * - A Session the Learner restarted is an Earlier attempt of its Topic (B3b), not an Older session.
 * - Every Session from before one Session per Topic is Older: its own group, by the date it began, with the
 *   Topics its messages named.
 */

/** The title of the every-Topic-passed Session, which has no Topic. */
export const FREE_QUESTIONS = "Free questions";

/** `found` is what the Learner found in the Session, a line each (the Topic's `found` lines that their saved Widget state meets); absent when none. */
export type TopicSessionRow = { id: number; topicId: string | null; title: string; lastActive: Date; found?: string[] };
export type OlderSessionRow = { id: number; date: Date; topics: string[] };
/**
 * An Earlier attempt (B3b): a Session the Learner restarted (`older` with `restarted_at`), as the Notebook lists it under its
 * Topic. `status` and the Checks come from the snapshot taken when the Topic was started over; `found` from the old Session.
 */
export type EarlierAttemptRow = {
  sessionId: number;
  topicId: string;
  attemptNo: number;
  /** When the Learner started the Topic over: the attempt's end. */
  date: Date;
  status: "passed" | "not_finished";
  checksPassed: number;
  checksTotal: number;
  found: string[];
};
export type PastSessions = { topics: TopicSessionRow[]; older: OlderSessionRow[]; earlier: EarlierAttemptRow[] };

/** A Past Session page's header: a Topic Session's Topic, last activity and whether it passed, or an Older Session's date and Topics. */
export type PastSessionHeader =
  | { kind: "topic"; topicId: string | null; title: string; lastActive: Date; passed: boolean; found?: string[] }
  | { kind: "older"; date: Date; topics: string[] }
  | { kind: "earlier"; topicId: string; title: string; date: Date; attemptNo: number };

const titleOf = (map: CourseMap, topicId: string | null) => (topicId === null ? FREE_QUESTIONS : (map.topic(topicId)?.title ?? topicId));

/** The Learner's Sessions with their last activity: the latest message (or the Session's start), and its id to break ties. */
async function sessionsWithActivity(db: Db, learnerId: number, sessionId?: number) {
  const rows = await db
    .select({ id: sessions.id, topicId: sessions.topicId, older: sessions.older, restartedAt: sessions.restartedAt, createdAt: sessions.createdAt, lastAt: max(messages.createdAt), lastId: max(messages.id) })
    .from(sessions)
    .leftJoin(messages, eq(messages.sessionId, sessions.id))
    .where(sessionId === undefined ? eq(sessions.learnerId, learnerId) : and(eq(sessions.learnerId, learnerId), eq(sessions.id, sessionId)))
    .groupBy(sessions.id)
    .orderBy(desc(sessions.id));
  return rows.map((r) => ({ ...r, lastActive: r.lastAt ? new Date(r.lastAt) : r.createdAt }));
}

/** What the Learner found in each of these Sessions, from their saved Widget state and the Topic's `found` lines. */
async function foundIn(db: Db, map: CourseMap, learnerId: number, rows: { id: number; topicId: string | null }[]): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>();
  const wanted = rows.filter((r) => r.topicId && map.topic(r.topicId)?.found?.length);
  if (wanted.length === 0) return out;
  const saved = await db
    .select({ sessionId: widgetState.sessionId, widgetKey: widgetState.widgetKey, values: widgetState.values, ticked: widgetState.ticked })
    .from(widgetState)
    .where(and(eq(widgetState.learnerId, learnerId), inArray(widgetState.sessionId, wanted.map((r) => r.id))));
  for (const r of wanted) {
    const states = Object.fromEntries(saved.filter((s) => s.sessionId === r.id).map((s) => [s.widgetKey, { values: s.values, ticked: s.ticked }]));
    out.set(r.id, foundLines(map.topic(r.topicId!)!, states));
  }
  return out;
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

/** The Learner's Earlier attempts (restarted Sessions), newest first, worked out from `topic_restarts` and the old Session's saved Widgets. */
async function earlierAttempts(db: Db, map: CourseMap, learnerId: number, rows: { id: number; topicId: string | null }[]): Promise<EarlierAttemptRow[]> {
  if (rows.length === 0) return [];
  const found = await foundIn(db, map, learnerId, rows);
  const restarts = await db
    .select()
    .from(topicRestarts)
    .where(and(eq(topicRestarts.learnerId, learnerId), inArray(topicRestarts.sessionId, rows.map((r) => r.id))));
  return rows
    .flatMap((r) => {
      const restart = restarts.find((x) => x.sessionId === r.id);
      if (!restart || !r.topicId) return [];
      const snapshot = restart.snapshot as { topic_progress?: { status?: string } | null; check_results?: { checkId: string; passed: boolean }[] };
      const passedChecks = new Set((snapshot.check_results ?? []).filter((c) => c.passed).map((c) => c.checkId));
      return [{
        sessionId: r.id,
        topicId: r.topicId,
        attemptNo: restart.attemptNo,
        date: restart.restartedAt,
        status: snapshot.topic_progress?.status === "passed" ? ("passed" as const) : ("not_finished" as const),
        checksPassed: passedChecks.size,
        checksTotal: map.topic(r.topicId)?.checks.length ?? 0,
        found: found.get(r.id) ?? [],
      }];
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime() || b.attemptNo - a.attemptNo);
}

/** A Session the Learner restarted: `older` and `restarted_at` set. Every other `older` Session is from before one Session per Topic. */
const isEarlier = (s: { older: boolean; restartedAt: Date | null }) => s.older && s.restartedAt !== null;

/** The Learner's Sessions for the Notebook: Topic Sessions, the most recently worked on first, and the Older ones, newest first. */
export async function loadPastSessions(db: Db, map: CourseMap, learnerId: number): Promise<PastSessions> {
  const all = await sessionsWithActivity(db, learnerId);
  const found = await foundIn(db, map, learnerId, all.filter((s) => !s.older));
  const earlier = await earlierAttempts(db, map, learnerId, all.filter(isEarlier));
  const topics = all
    .filter((s) => !s.older)
    .sort((a, b) => b.lastActive.getTime() - a.lastActive.getTime() || (b.lastId ?? 0) - (a.lastId ?? 0) || b.id - a.id)
    .map((s) => ({ id: s.id, topicId: s.topicId, title: titleOf(map, s.topicId), lastActive: s.lastActive, ...(found.get(s.id)?.length && { found: found.get(s.id) }) }));
  const olderRows = all.filter((s) => s.older && !isEarlier(s));
  const named = await olderTopics(db, olderRows.map((s) => s.id));
  return { topics, older: olderRows.map((s) => ({ id: s.id, date: s.createdAt, topics: named.get(s.id) ?? [] })), earlier };
}

/** One of the Learner's Sessions as its page's header shows it; null for an id that is not theirs. */
export async function loadPastSession(db: Db, map: CourseMap, sessionId: number, learnerId: number): Promise<PastSessionHeader | null> {
  const [s] = await sessionsWithActivity(db, learnerId, sessionId);
  if (!s) return null;
  if (isEarlier(s) && s.topicId) {
    const [attempt] = await earlierAttempts(db, map, learnerId, [s]);
    if (attempt) return { kind: "earlier", topicId: s.topicId, title: titleOf(map, s.topicId), date: attempt.date, attemptNo: attempt.attemptNo };
  }
  if (s.older) return { kind: "older", date: s.createdAt, topics: (await olderTopics(db, [s.id])).get(s.id) ?? [] };
  const progress = await loadProgress(db, learnerId);
  const passed = s.topicId !== null && progress.topics[s.topicId]?.status === "passed";
  const found = (await foundIn(db, map, learnerId, [s])).get(s.id);
  return { kind: "topic", topicId: s.topicId, title: titleOf(map, s.topicId), lastActive: s.lastActive, passed, ...(found?.length && { found }) };
}
