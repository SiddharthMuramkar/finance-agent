import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { importBank } from "@/bank/ingest";
import type { BankQuestion } from "@/bank/normalise";
import { parseCourseMap, type CourseMap } from "@/course/map";
import { learners, messages, OWNER_LEARNER_ID, reviewCards, reviewLog, settings } from "@/db/schema";
import type { Db } from "@/db/types";
import { startSession } from "@/tutor/session-log";
import { testDb } from "@/test/pglite";
import { ensureTopicStarted, loadProgress, saveFinishedStep } from "./memory";
import { openQuiz, submitQuiz } from "./quiz";
import { answerReview, reviewState } from "./review";

const day = 86_400_000;
const question = (n: number) => `
  - id: q${n}
    prompt: Question ${n}?
    choices: [{ id: a, text: Right ${n} }, { id: b, text: Wrong ${n} }]
    answer: a
    explanation: Because ${n}.
    source: Source ${n}`;

function testMap(): CourseMap {
  const { map, errors } = parseCourseMap([
    {
      name: "t.yaml",
      text: `
id: t
title: T
stage: foundation
path: 1
cases: [{ id: c, title: C, asOf: 2018-10-24, story: S, reveal: R }]
concept: C
principle: P
questions:${[1, 2, 3, 4].map(question).join("")}
checks:
  - id: quiz
    kind: quiz
    questions: [q1, q2, q3, q4]
    passRule: { correct: 2 }
    perAttempt: 3
  - id: talk
    kind: conversation
    prompt: Explain.
    passCriteria: Explains.
`,
    },
  ]);
  if (!map) throw new Error(errors.join("\n"));
  return map;
}

/** A Learner who has taken the quiz: first attempt q1 right, q2 right, q3 wrong, passing. */
async function passedQuiz(passAt: Date) {
  const db = await testDb();
  const map = testMap();
  await ensureTopicStarted(db, map);
  for (const step of ["story", "concept", "your_turn"] as const) await saveFinishedStep(db, map, step);
  const quiz = (await openQuiz(db, map))!;
  await submitQuiz(db, map, quiz.attemptId, { q1: "a", q2: "a", q3: "b" }, passAt);
  return { db, map };
}

describe("spaced review", () => {
  it("offers nothing before a Check is passed", async () => {
    const db = await testDb();
    const state = await reviewState(db, testMap(), new Date());
    expect(state).toMatchObject({ question: null, dueCount: 0, done: 0 });
  });

  it("a question enters review once its Check is passed, not before", async () => {
    const db = await testDb();
    const map = testMap();
    await ensureTopicStarted(db, map);
    for (const step of ["story", "concept", "your_turn"] as const) await saveFinishedStep(db, map, step);
    const quiz = (await openQuiz(db, map))!;
    await submitQuiz(db, map, quiz.attemptId, { q1: "a", q2: "b", q3: "b" }); // 1 right: not passed
    await reviewState(db, map, new Date(Date.now() + 100 * day));
    expect(await db.select().from(reviewCards)).toHaveLength(0);
  });

  it("enters the shown questions with correct as Good and incorrect as Again, so a wrong one comes back sooner", async () => {
    const passAt = new Date("2026-03-01T10:00:00Z");
    const { db, map } = await passedQuiz(passAt);
    await reviewState(db, map, passAt);
    const cards = await db.select().from(reviewCards);
    expect(cards.map((c) => c.questionId).sort()).toEqual(["q1", "q2", "q3"]);
    const due = (id: string) => cards.find((c) => c.questionId === id)!.due.getTime();
    expect(due("q3")).toBeLessThan(due("q1"));
    const log = await db.select().from(reviewLog);
    expect(log.filter((l) => l.questionId === "q3").map((l) => l.rating)).toEqual([1]);
    expect(log.filter((l) => l.questionId === "q1").map((l) => l.rating)).toEqual([3]);
    // Entering twice changes nothing.
    await reviewState(db, map, passAt);
    expect(await db.select().from(reviewCards)).toHaveLength(3);
  });

  it("offers the most overdue question first, with no key in what the browser gets", async () => {
    const passAt = new Date("2026-03-01T10:00:00Z");
    const { db, map } = await passedQuiz(passAt);
    const state = await reviewState(db, map, new Date(passAt.getTime() + 60 * day));
    expect(state.dueCount).toBe(3);
    expect(state.question?.id).toBe("q3");
    const text = JSON.stringify(state.question);
    for (const secret of ["Because", "Source", "answer"]) expect(text).not.toContain(secret);
  });

  it("marks a review: correct is Good, incorrect is Again, and the question leaves the due list", async () => {
    const passAt = new Date("2026-03-01T10:00:00Z");
    const { db, map } = await passedQuiz(passAt);
    const now = new Date(passAt.getTime() + 60 * day);
    const wrong = await answerReview(db, map, "q3", "b", now);
    expect(wrong).toMatchObject({ ok: true, correct: false, answer: "a", explanation: "Because 3." });
    const [card] = await db.select().from(reviewCards).where(eq(reviewCards.questionId, "q3"));
    expect(card.lapses).toBe(1);
    expect(card.due.getTime()).toBeGreaterThan(now.getTime());
    expect(await answerReview(db, map, "q3", "a", now)).toMatchObject({ ok: false });
    expect((await reviewState(db, map, now)).done).toBe(1);
  });

  it("rejects an answer to a question that is not due", async () => {
    const passAt = new Date("2026-03-01T10:00:00Z");
    const { db, map } = await passedQuiz(passAt);
    expect(await answerReview(db, map, "q1", "a", passAt)).toMatchObject({ ok: false });
    expect(await answerReview(db, map, "nope", "a", passAt)).toMatchObject({ ok: false });
  });

  it("a missed review never changes a Topic's passed status", async () => {
    const passAt = new Date("2026-03-01T10:00:00Z");
    const { db, map } = await passedQuiz(passAt);
    const before = await loadProgress(db);
    await answerReview(db, map, "q3", "b", new Date(passAt.getTime() + 60 * day));
    expect(await loadProgress(db)).toEqual(before);
  });

  it("stops at the cap, a changeable setting, counting reviews done in the last 24 hours", async () => {
    const passAt = new Date("2026-03-01T10:00:00Z");
    const { db, map } = await passedQuiz(passAt);
    const now = new Date(passAt.getTime() + 60 * day);
    expect((await reviewState(db, map, now)).cap).toBe(10);
    await db.update(settings).set({ value: "2" }).where(eq(settings.key, "review_cap"));
    expect((await reviewState(db, map, now)).cap).toBe(2);
    await answerReview(db, map, "q3", "a", now);
    await answerReview(db, map, "q1", "a", now);
    const after = await reviewState(db, map, now);
    expect(after).toMatchObject({ question: null, done: 2, dueCount: 1 });
    expect(await answerReview(db, map, "q2", "a", now)).toMatchObject({ ok: false });
  });

  it("a new Session does not reset the cap: reviews in the last 24 hours still count", async () => {
    const passAt = new Date("2026-03-01T10:00:00Z");
    const { db, map } = await passedQuiz(passAt);
    const first = new Date(passAt.getTime() + 60 * day);
    await db.insert(settings).values({ key: "review_cap", value: "1" });
    await answerReview(db, map, "q3", "a", first);
    const later = new Date(first.getTime() + 20 * 3600_000);
    const s = await startSession(db, later);
    await db.insert(messages).values({ sessionId: s.id, seq: 0, role: "user", content: "hi", createdAt: later });
    expect(await reviewState(db, map, later)).toMatchObject({ question: null, done: 1 });
  });

  it("a review done more than 24 hours ago no longer counts toward the cap", async () => {
    const passAt = new Date("2026-03-01T10:00:00Z");
    const { db, map } = await passedQuiz(passAt);
    const first = new Date(passAt.getTime() + 60 * day);
    await db.insert(settings).values({ key: "review_cap", value: "1" });
    // One Session, never idle and never restarted: only the clock moves the window.
    await startSession(db, first);
    await answerReview(db, map, "q3", "a", first);
    expect((await reviewState(db, map, new Date(first.getTime() + day - 60_000))).question).toBeNull();
    const state = await reviewState(db, map, new Date(first.getTime() + day + 60_000));
    expect(state).toMatchObject({ done: 0 });
    expect(state.question).not.toBeNull();
  });
});

describe("spaced review for two Learners", () => {
  /** A second Learner beside the owner, who takes the same quiz the same way: q1 and q2 right, q3 wrong. */
  async function secondPasses(db: Db, map: CourseMap, passAt: Date): Promise<number> {
    const [row] = await db.insert(learners).values({ name: "second" }).returning();
    await ensureTopicStarted(db, map, passAt, row.id);
    for (const step of ["story", "concept", "your_turn"] as const) await saveFinishedStep(db, map, step, passAt, row.id);
    const quiz = (await openQuiz(db, map, passAt, row.id))!;
    await submitQuiz(db, map, quiz.attemptId, { q1: "a", q2: "a", q3: "b" }, passAt, row.id);
    return row.id;
  }

  it("each Learner has their own card for the same question, and the daily cap counts only their own Reviews", async () => {
    const passAt = new Date("2026-03-01T10:00:00Z");
    const { db, map } = await passedQuiz(passAt);
    const second = await secondPasses(db, map, passAt);
    await db.insert(settings).values({ key: "review_cap", value: "1" });
    const now = new Date(passAt.getTime() + 60 * day);

    // The owner reviews q3 and reaches the cap of one.
    expect(await reviewState(db, map, now, OWNER_LEARNER_ID)).toMatchObject({ question: { id: "q3" }, done: 0 });
    expect(await answerReview(db, map, "q3", "a", now, OWNER_LEARNER_ID)).toMatchObject({ ok: true, correct: true });
    expect(await reviewState(db, map, now, OWNER_LEARNER_ID)).toMatchObject({ question: null, done: 1 });

    // The second Learner's own q3 card is still due, and the owner's Review doesn't count toward their cap.
    expect(await reviewState(db, map, now, second)).toMatchObject({ question: { id: "q3" }, done: 0, dueCount: 3 });
    expect(await answerReview(db, map, "q3", "b", now, second)).toMatchObject({ ok: true, correct: false });
    expect(await reviewState(db, map, now, second)).toMatchObject({ question: null, done: 1 });
    expect(await reviewState(db, map, now, OWNER_LEARNER_ID)).toMatchObject({ question: null, done: 1 });
  });

  it("a Learner who hasn't passed the Check has no cards, whatever another Learner passed", async () => {
    const passAt = new Date("2026-03-01T10:00:00Z");
    const { db, map } = await passedQuiz(passAt);
    const [row] = await db.insert(learners).values({ name: "second" }).returning();
    const now = new Date(passAt.getTime() + 60 * day);
    expect(await reviewState(db, map, now, row.id)).toMatchObject({ question: null, dueCount: 0, done: 0 });
    expect(await answerReview(db, map, "q3", "a", now, row.id)).toMatchObject({ ok: false });
    expect((await reviewState(db, map, now, OWNER_LEARNER_ID)).dueCount).toBe(3);
  });
});

describe("spaced review of Question Bank questions", () => {
  it("enrols a passed bank question, offers it when due without the key, and marks and reschedules it", async () => {
    const db = await testDb();
    await importBank(db, [bankChoice(1), bankChoice(2)]);
    const map = bankReviewMap();
    await ensureTopicStarted(db, map);
    for (const step of ["story", "concept", "your_turn"] as const) await saveFinishedStep(db, map, step);
    const quiz = (await openQuiz(db, map))!;
    const passAt = new Date("2026-01-01T10:00:00Z");
    expect(quiz.questions.map((q) => q.id)).toEqual(["bank:eab:R-1", "bank:eab:R-2"]);
    await submitQuiz(db, map, quiz.attemptId, { "bank:eab:R-1": "B", "bank:eab:R-2": "A" }, passAt);

    const later = new Date(passAt.getTime() + 30 * day);
    const state = await reviewState(db, map, later);
    expect(state.dueCount).toBe(2);
    expect(state.question?.id).toBe("bank:eab:R-2"); // the missed one comes back first
    for (const secret of ["Bank because", "Executive Assessment Bank", '"answer"']) expect(JSON.stringify(state.question)).not.toContain(secret);

    const graded = await answerReview(db, map, "bank:eab:R-2", "B", later);
    expect(graded).toMatchObject({ ok: true, correct: true, answer: "B", explanation: "Bank because 2.", credit: "Executive Assessment Bank, CC-BY-4.0", verified: false });
    expect(await db.select().from(reviewLog).where(eq(reviewLog.questionId, "bank:eab:R-2"))).toHaveLength(2);
    expect((await reviewState(db, map, later)).dueCount).toBe(1);
  });
});

function bankChoice(n: number): BankQuestion {
  return {
    id: `bank:eab:R-${n}`,
    source: "eab",
    bankTitle: "MBA core - Test",
    topic: "tvm",
    kind: "choice",
    prompt: `Review question ${n}?`,
    context: null,
    choices: [
      { id: "A", text: `Wrong ${n}` },
      { id: "B", text: `Right ${n}` },
    ],
    answer: "B",
    explanation: `Bank because ${n}.`,
    licence: "CC-BY-4.0",
    credit: "Executive Assessment Bank, CC-BY-4.0",
    sourceUrl: "https://example.org",
    upstreamReview: "self-checked",
    verified: false,
    verifiedNote: null,
  };
}

function bankReviewMap(): CourseMap {
  const { map, errors } = parseCourseMap([
    {
      name: "t.yaml",
      text: `
id: t
title: T
stage: foundation
path: 1
cases: [{ id: c, title: C, asOf: 2018-10-24, story: S, reveal: R }]
concept: C
principle: P
checks:
  - id: quiz
    kind: quiz
    questions: ["bank:eab:R-1", "bank:eab:R-2"]
    passRule: { correct: 1 }
    perAttempt: 2
  - id: talk
    kind: conversation
    prompt: Explain.
    passCriteria: Explains.
`,
    },
  ]);
  if (!map) throw new Error(errors.join("\n"));
  return map;
}
