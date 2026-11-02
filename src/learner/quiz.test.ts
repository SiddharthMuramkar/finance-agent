import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { parseCourseMap, type CourseMap } from "@/course/map";
import { quizAttempts } from "@/db/schema";
import { testDb } from "@/test/pglite";
import { ensureTopicStarted, loadCheckResults, loadProgress, saveFinishedStep } from "./memory";
import { markQuizReported, openQuiz, pendingQuizNote, submitQuiz } from "./quiz";

const question = (n: number) => `
  - id: q${n}
    prompt: Question ${n}?
    choices: [{ id: a, text: Right ${n} }, { id: b, text: Wrong ${n} }]
    answer: a
    explanation: Because ${n}.
    source: Source ${n}`;

/** One Topic: a quiz Check (4 questions, 2 per attempt, 2 correct to pass), then a conversation Check. */
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

async function atQuiz() {
  const db = await testDb();
  const map = testMap();
  await ensureTopicStarted(db, map);
  for (const step of ["story", "concept", "your_turn"] as const) await saveFinishedStep(db, map, step);
  return { db, map };
}

describe("quiz Check flow", () => {
  it("shows no quiz until the Course Navigator reaches the quiz Check step", async () => {
    const db = await testDb();
    const map = testMap();
    await ensureTopicStarted(db, map);
    expect(await openQuiz(db, map)).toBeNull();
  });

  it("opens the questions chosen by code, without the key, and reopens the same attempt", async () => {
    const { db, map } = await atQuiz();
    const quiz = await openQuiz(db, map);
    expect(quiz?.questions.map((q) => q.id)).toEqual(["q1", "q2"]);
    expect(quiz?.checkId).toBe("quiz");
    const text = JSON.stringify(quiz);
    for (const secret of ["answer", "explanation", "Because", "Source"]) expect(text).not.toContain(secret);
    expect((await openQuiz(db, map))?.attemptId).toBe(quiz?.attemptId);
  });

  it("if saving the Learner's place fails, nothing of the result is saved, the Learner gets a plain message, and can submit again", async () => {
    const { db, map } = await atQuiz();
    const quiz = (await openQuiz(db, map))!;
    await db.execute(sql`CREATE FUNCTION refuse_write() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'disk full'; END $$ LANGUAGE plpgsql`);
    await db.execute(sql`CREATE TRIGGER refuse_progress BEFORE UPDATE ON topic_progress FOR EACH ROW EXECUTE FUNCTION refuse_write()`);
    const failed = await submitQuiz(db, map, quiz.attemptId, { q1: "a", q2: "a" });
    expect(failed).toEqual({ ok: false, reason: expect.stringMatching(/nothing was recorded/i), saveFailed: true });
    expect(await loadCheckResults(db)).toHaveLength(0);
    expect((await loadProgress(db)).topics.t.step).toBe("check");
    expect((await openQuiz(db, map))?.attemptId).toBe(quiz.attemptId);

    await db.execute(sql`DROP TRIGGER refuse_progress ON topic_progress`);
    expect(await submitQuiz(db, map, quiz.attemptId, { q1: "a", q2: "a" })).toMatchObject({ ok: true, passed: true });
    expect((await loadProgress(db)).topics.t.step).toBe("concept");
  });

  it("marks on submit, reveals the key then, saves a pass and moves the Learner on", async () => {
    const { db, map } = await atQuiz();
    const quiz = (await openQuiz(db, map))!;
    const result = await submitQuiz(db, map, quiz.attemptId, { q1: "a", q2: "a" });
    expect(result).toMatchObject({ ok: true, passed: true, correctCount: 2, shown: 2, needed: 2 });
    if (!result.ok) throw new Error();
    expect(result.questions[0]).toMatchObject({ correct: true, explanation: "Because 1." });
    const results = await loadCheckResults(db);
    expect(results).toMatchObject([{ checkId: "quiz", passed: true, evidence: null, model: null }]);
    expect((await loadProgress(db)).topics.t.passedChecks).toEqual(["quiz"]);
    // The next Check is a conversation Check, so no quiz is open now.
    expect(await openQuiz(db, map)).toBeNull();
  });

  it("keeps the Learner at the Check after a miss, and the retry uses different questions", async () => {
    const { db, map } = await atQuiz();
    const first = (await openQuiz(db, map))!;
    const result = await submitQuiz(db, map, first.attemptId, { q1: "a", q2: "b" });
    expect(result).toMatchObject({ ok: true, passed: false, correctCount: 1 });
    expect((await loadProgress(db)).topics.t.passedChecks).toEqual([]);
    expect(await loadCheckResults(db)).toMatchObject([{ checkId: "quiz", passed: false }]);
    const retry = (await openQuiz(db, map))!;
    expect(retry.attemptId).not.toBe(first.attemptId);
    expect(retry.questions.map((q) => q.id)).toEqual(["q3", "q4"]);
  });

  it("marks a submission once: sending the same attempt again changes nothing", async () => {
    const { db, map } = await atQuiz();
    const quiz = (await openQuiz(db, map))!;
    await submitQuiz(db, map, quiz.attemptId, { q1: "b", q2: "b" });
    const again = await submitQuiz(db, map, quiz.attemptId, { q1: "a", q2: "a" });
    expect(again).toMatchObject({ ok: true, passed: false, correctCount: 0 });
    expect(await loadCheckResults(db)).toHaveLength(1);
  });

  it("ignores answers to questions that were not shown and rejects an unknown attempt", async () => {
    const { db, map } = await atQuiz();
    const quiz = (await openQuiz(db, map))!;
    const result = await submitQuiz(db, map, quiz.attemptId, { q1: "a", q3: "a" });
    expect(result).toMatchObject({ ok: true, correctCount: 1, passed: false });
    expect(await submitQuiz(db, map, 999, {})).toEqual({ ok: false, reason: "No such quiz attempt." });
  });

  it("rejects an attempt once its Check is no longer the current one", async () => {
    const { db, map } = await atQuiz();
    const quiz = (await openQuiz(db, map))!;
    const [stale] = await db.insert(quizAttempts).values({ checkId: "quiz", attemptNo: 5, questionIds: ["q1", "q2"] }).returning();
    await submitQuiz(db, map, quiz.attemptId, { q1: "a", q2: "a" });
    const result = await submitQuiz(db, map, stale.id, { q1: "a", q2: "a" });
    expect(result.ok).toBe(false);
    expect(await loadCheckResults(db)).toHaveLength(1);
  });
});

describe("quiz results for the Tutor", () => {
  it("writes a note for each submitted result not yet reported, then none once reported", async () => {
    const { db, map } = await atQuiz();
    expect(await pendingQuizNote(db, map)).toBeNull();
    const first = (await openQuiz(db, map))!;
    await submitQuiz(db, map, first.attemptId, { q1: "a", q2: "b" });
    const second = (await openQuiz(db, map))!;
    await submitQuiz(db, map, second.attemptId, { q3: "a", q4: "a" });

    const note = (await pendingQuizNote(db, map))!;
    expect(note.text).toContain("Quiz result by code, Check quiz, attempt 1: 1 of 2 correct (needs 2).\nNot passed");
    expect(note.text).toContain('Question 2? The Learner chose "Wrong 2"; the right answer is "Right 2".');
    expect(note.text).toContain("attempt 2: 2 of 2 correct (needs 2).\nPassed");
    await markQuizReported(db, note.attemptIds);
    expect(await pendingQuizNote(db, map)).toBeNull();
    const rows = await db.select().from(quizAttempts).where(eq(quizAttempts.id, first.attemptId));
    expect(rows[0].reportedAt).not.toBeNull();
  });
});
