import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { parseCourseMap, type CourseMap } from "@/course/map";
import { messages, reviewCards, reviewLog, settings } from "@/db/schema";
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

  it("stops at the cap, a changeable setting, counting reviews since the Session started", async () => {
    const passAt = new Date("2026-03-01T10:00:00Z");
    const { db, map } = await passedQuiz(passAt);
    const now = new Date(passAt.getTime() + 60 * day);
    await db.insert(settings).values({ key: "review_cap", value: "2" });
    await startSession(db, now);
    expect((await reviewState(db, map, now)).cap).toBe(2);
    await answerReview(db, map, "q3", "a", now);
    await answerReview(db, map, "q1", "a", now);
    const after = await reviewState(db, map, now);
    expect(after).toMatchObject({ question: null, done: 2, dueCount: 1 });
    expect(await answerReview(db, map, "q2", "a", now)).toMatchObject({ ok: false });
  });

  it("reviews done in an earlier Session do not count against a new one", async () => {
    const passAt = new Date("2026-03-01T10:00:00Z");
    const { db, map } = await passedQuiz(passAt);
    const first = new Date(passAt.getTime() + 60 * day);
    await db.insert(settings).values({ key: "review_cap", value: "1" });
    const s1 = await startSession(db, first);
    await db.insert(messages).values({ sessionId: s1.id, seq: 0, role: "user", content: "hi", createdAt: first });
    await answerReview(db, map, "q3", "a", first);
    expect((await reviewState(db, map, first)).question).toBeNull();
    // Next day: the old Session has gone idle, so a new one is due and its count starts at zero.
    const next = new Date(first.getTime() + day);
    const state = await reviewState(db, map, next);
    expect(state).toMatchObject({ done: 0 });
    expect(state.question).not.toBeNull();
  });

  it("reviews done before the first message of a new Session still count once it starts", async () => {
    const passAt = new Date("2026-03-01T10:00:00Z");
    const { db, map } = await passedQuiz(passAt);
    const first = new Date(passAt.getTime() + 60 * day);
    await db.insert(settings).values({ key: "review_cap", value: "1" });
    const s1 = await startSession(db, first);
    await db.insert(messages).values({ sessionId: s1.id, seq: 0, role: "user", content: "hi", createdAt: first });
    const next = new Date(first.getTime() + day);
    await answerReview(db, map, "q3", "a", next);
    await startSession(db, new Date(next.getTime() + 60_000)); // the first turn of the new Session
    expect((await reviewState(db, map, new Date(next.getTime() + 120_000))).question).toBeNull();
  });
});
