import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { loadCourseMap } from "@/course/map";
import {
  checkResults,
  insightAttempts,
  learners,
  learnerState,
  messages,
  misconceptions,
  noteItems,
  practiceAnswers,
  quizAttempts,
  reviewCards,
  sessionItems,
  sessions,
  skillState,
  topicProgress,
  topicRestarts,
  widgetState,
} from "@/db/schema";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";
import { liveSession, sessionForTurn } from "@/tutor/session-log";
import { jumpTo } from "@/course/navigator";
import { loadProgress } from "./memory";
import { restartTopic } from "./restart";

/**
 * Starting one Topic over (B3a, ADR 0004 amendment): the Topic's progress rows move into a snapshot and are
 * cleared, the live Session becomes an Earlier attempt, and nothing of another Topic or Learner changes.
 * In-memory Postgres with the real migrations.
 */

const map = loadCourseMap();
const [P, Q] = map.topics.filter((t) => t.checks.length > 0).map((t) => t.id);
const checkOf = (topicId: string) => map.topic(topicId)!.checks[0].id;
const NOW = new Date("2026-11-05T10:00:00Z");

async function newSession(db: Db, learnerId: number, topicId: string) {
  const [s] = await db
    .insert(sessions)
    .values({ learnerId, topicId, older: false, instructions: "i", tools: [], model: "m", effort: "low", fingerprint: "f" })
    .returning();
  await db.insert(messages).values([
    { sessionId: s.id, seq: 0, role: "user", content: "hello" },
    { sessionId: s.id, seq: 1, role: "assistant", content: [{ type: "text", text: "hi" }] },
  ]);
  await db.insert(sessionItems).values({ learnerId, sessionId: s.id, afterSeq: 0, kind: "step_divider", data: { step: "story" } });
  return s;
}

/** A Learner's full set of rows for one Topic. */
async function seedTopic(db: Db, learnerId: number, topicId: string, status: "in_progress" | "passed" = "in_progress") {
  const tag = `${learnerId}-${topicId}`;
  const check = checkOf(topicId);
  const session = await newSession(db, learnerId, topicId);
  await db.insert(topicProgress).values({ learnerId, topicId, step: "check", status });
  await db.insert(checkResults).values([
    { learnerId, topicId, checkId: check, passed: true, toolCallId: `cr1-${tag}` },
    { learnerId, topicId, checkId: check, passed: false, toolCallId: `cr2-${tag}` },
  ]);
  await db.insert(misconceptions).values({ learnerId, topicId, description: "mixes up", model: "m", toolCallId: `mc-${tag}` });
  await db.insert(insightAttempts).values({ learnerId, topicId, reported: "found", released: "found", words: "w", toolCallId: `ia-${tag}` });
  await db.insert(quizAttempts).values([
    { learnerId, checkId: check, attemptNo: 0, questionIds: ["a"] },
    { learnerId, checkId: check, attemptNo: 1, questionIds: ["b"] },
  ]);
  await db.insert(skillState).values({ learnerId, topicId, skillId: "s1", tries: 3 });
  await db.insert(practiceAnswers).values([
    { learnerId, topicId, skillId: "s1", sessionId: session.id, itemKey: `k1-${tag}`, itemId: "i", input: "1", verdict: "right", source: "quick_try" },
    { learnerId, topicId, skillId: "s1", sessionId: session.id, itemKey: `k2-${tag}`, itemId: "i", input: "2", verdict: "wrong", source: "quick_try" },
  ]);
  await db.insert(widgetState).values([
    { sessionId: session.id, widgetKey: "w1", learnerId, values: { rate: 3 } },
    { sessionId: session.id, widgetKey: "w2", learnerId, ticked: ["t1"] },
  ]);
  await db.insert(reviewCards).values({
    learnerId, questionId: `q-${topicId}`, due: NOW, stability: 1, difficulty: 1, elapsedDays: 0, scheduledDays: 1, reps: 1, lapses: 0, learningSteps: 0, state: 2,
  });
  await db.insert(noteItems).values({ learnerId, topicId, kind: "reply", sessionId: session.id, turnSeq: 0 });
  return session;
}

/** Every row this Learner has for this Topic, in every table the restart looks at. */
async function dump(db: Db, learnerId: number, topicId: string) {
  const check = checkOf(topicId);
  const sess = await db.select().from(sessions).where(and(eq(sessions.learnerId, learnerId), eq(sessions.topicId, topicId)));
  return {
    sess,
    progress: await db.select().from(topicProgress).where(and(eq(topicProgress.learnerId, learnerId), eq(topicProgress.topicId, topicId))),
    checks: await db.select().from(checkResults).where(and(eq(checkResults.learnerId, learnerId), eq(checkResults.topicId, topicId))),
    mis: await db.select().from(misconceptions).where(and(eq(misconceptions.learnerId, learnerId), eq(misconceptions.topicId, topicId))),
    insight: await db.select().from(insightAttempts).where(and(eq(insightAttempts.learnerId, learnerId), eq(insightAttempts.topicId, topicId))),
    quiz: await db.select().from(quizAttempts).where(and(eq(quizAttempts.learnerId, learnerId), eq(quizAttempts.checkId, check))),
    skill: await db.select().from(skillState).where(and(eq(skillState.learnerId, learnerId), eq(skillState.topicId, topicId))),
    practice: await db.select().from(practiceAnswers).where(and(eq(practiceAnswers.learnerId, learnerId), eq(practiceAnswers.topicId, topicId))),
    widgets: await db.select().from(widgetState).where(eq(widgetState.learnerId, learnerId)),
    cards: await db.select().from(reviewCards).where(eq(reviewCards.learnerId, learnerId)),
    notes: await db.select().from(noteItems).where(and(eq(noteItems.learnerId, learnerId), eq(noteItems.topicId, topicId))),
  };
}

async function setUp() {
  const db = await testDb();
  const [two] = await db.insert(learners).values({ name: "second" }).returning();
  const pSession = await seedTopic(db, 1, P);
  await seedTopic(db, 1, Q);
  await seedTopic(db, two.id, P);
  await db.insert(learnerState).values({ id: 1, learnerId: 1, currentTopicId: P, shownSessionId: pSession.id });
  return { db, two: two.id, pSession };
}

describe("Starting a Topic over", () => {
  it("restart snapshots and clears only this Topic", async () => {
    const { db, pSession } = await setUp();
    const result = await restartTopic(db, map, 1, P, NOW);
    expect(result).toMatchObject({ restarted: true, oldSessionId: pSession.id });

    const live = await dump(db, 1, P);
    expect([live.progress, live.checks, live.mis, live.insight, live.quiz, live.skill, live.practice].map((r) => r.length)).toEqual([0, 0, 0, 0, 0, 0, 0]);

    const rows = await db.select().from(topicRestarts);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ learnerId: 1, topicId: P, attemptNo: 1, sessionId: pSession.id });
    const snap = rows[0].snapshot as Record<string, unknown[] | null>;
    expect(snap.topic_progress).toMatchObject({ topicId: P, status: "in_progress" });
    expect(snap.check_results).toHaveLength(2);
    expect(snap.misconceptions).toHaveLength(1);
    expect(snap.insight_attempts).toHaveLength(1);
    expect(snap.quiz_attempts).toHaveLength(2);
    expect(snap.skill_state).toHaveLength(1);
    expect(snap.practice_answers).toHaveLength(2);
    expect(snap.widget_state).toHaveLength(2);

    const [old] = await db.select().from(sessions).where(eq(sessions.id, pSession.id));
    expect(old.older).toBe(true);
    expect(old.restartedAt?.getTime()).toBe(NOW.getTime());
  });

  it("other Topics' and other Learners' rows are unchanged", async () => {
    const { db, two } = await setUp();
    const beforeQ = await dump(db, 1, Q);
    const beforeTwo = await dump(db, two, P);
    const beforeP = await dump(db, 1, P);
    await restartTopic(db, map, 1, P, NOW);
    expect(await dump(db, 1, Q)).toEqual(beforeQ);
    expect(await dump(db, two, P)).toEqual(beforeTwo);
    const afterP = await dump(db, 1, P);
    expect(afterP.cards).toEqual(beforeP.cards);
    expect(afterP.notes).toEqual(beforeP.notes);
  });

  it("double submit is idempotent", async () => {
    const { db } = await setUp();
    await restartTopic(db, map, 1, P, NOW);
    expect(await restartTopic(db, map, 1, P, NOW)).toEqual({ restarted: false, reason: "nothing_to_restart" });
    expect(await db.select().from(topicRestarts)).toHaveLength(1);

    const fresh = await setUp();
    const both = await Promise.all([restartTopic(fresh.db, map, 1, P, NOW), restartTopic(fresh.db, map, 1, P, NOW)]);
    expect(both.filter((r) => r.restarted)).toHaveLength(1);
    expect(await fresh.db.select().from(topicRestarts)).toHaveLength(1);
  });

  it("old Session stays readable", async () => {
    const { db, pSession } = await setUp();
    const before = {
      msgs: await db.select().from(messages).where(eq(messages.sessionId, pSession.id)),
      items: await db.select().from(sessionItems).where(eq(sessionItems.sessionId, pSession.id)),
      widgets: await db.select().from(widgetState).where(eq(widgetState.sessionId, pSession.id)),
    };
    await restartTopic(db, map, 1, P, NOW);
    expect(await db.select().from(messages).where(eq(messages.sessionId, pSession.id))).toEqual(before.msgs);
    expect(await db.select().from(sessionItems).where(eq(sessionItems.sessionId, pSession.id))).toEqual(before.items);
    expect(await db.select().from(widgetState).where(eq(widgetState.sessionId, pSession.id))).toEqual(before.widgets);
    const notes = await db.select().from(noteItems).where(and(eq(noteItems.learnerId, 1), eq(noteItems.topicId, P)));
    expect(notes).toHaveLength(1);
    expect(notes[0].sessionId).toBe(pSession.id);
  });

  it("a new turn opens a fresh Session", async () => {
    const { db, pSession } = await setUp();
    await restartTopic(db, map, 1, P, NOW);
    const [state] = await db.select().from(learnerState).where(eq(learnerState.learnerId, 1));
    expect(state.shownSessionId).toBeNull();
    expect(state.currentTopicId).toBe(P);
    expect(await liveSession(db, 1, P)).toBeUndefined();
    const fresh = await sessionForTurn(db, NOW, 1, P);
    expect(fresh.id).not.toBe(pSession.id);
    expect(fresh.older).toBe(false);
    expect((await liveSession(db, 1, P))?.id).toBe(fresh.id);
  });

  it("constraints don't fire", async () => {
    const { db } = await setUp();
    await restartTopic(db, map, 1, P, NOW);
    const check = checkOf(P);
    await db.insert(topicProgress).values({ learnerId: 1, topicId: P, step: "story", status: "in_progress" });
    await db.insert(insightAttempts).values({ learnerId: 1, topicId: P, reported: "found", released: "found", words: "w", toolCallId: "new-ia" });
    await db.insert(quizAttempts).values({ learnerId: 1, checkId: check, attemptNo: 0, questionIds: ["a"] });
    await db.insert(skillState).values({ learnerId: 1, topicId: P, skillId: "s1" });
    await db.insert(practiceAnswers).values({ learnerId: 1, topicId: P, skillId: "s1", itemKey: `k1-1-${P}`, itemId: "i", input: "1", verdict: "right", source: "quick_try" });
    await newSession(db, 1, P);
    expect((await restartTopic(db, map, 1, P, NOW)).restarted).toBe(true);
    const rows = await db.select().from(topicRestarts).where(eq(topicRestarts.topicId, P));
    expect(rows.map((r) => r.attemptNo).sort()).toEqual([1, 2]);
  });

  it("a passed Topic can be restarted", async () => {
    const db = await testDb();
    await seedTopic(db, 1, P, "passed");
    await restartTopic(db, map, 1, P, NOW);
    const progress = await loadProgress(db, 1);
    expect(progress.topics[P]).toBeUndefined();
    expect(jumpTo(map, progress, P).ok).toBe(true);
  });

  it("a failure leaves everything", async () => {
    const { db, pSession } = await setUp();
    await db.insert(topicRestarts).values({ learnerId: 1, topicId: "other", sessionId: pSession.id, attemptNo: 1, snapshot: {} });
    const before = await dump(db, 1, P);
    await expect(restartTopic(db, map, 1, P, NOW)).rejects.toThrow();
    expect(await dump(db, 1, P)).toEqual(before);
  });
});
