import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { parseCourseMap, type CourseMap } from "@/course/map";
import { courseOverview, navigate } from "@/course/navigator";
import { checkResults, learners, OWNER_LEARNER_ID, reviewCards, reviewLog, skipAheadAttempts } from "@/db/schema";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";
import { ensureTopicStarted, loadProgress } from "./memory";
import { skipAheadState, startSkipAhead, submitSkipAhead, TRIED_TODAY, type SkipAheadQuiz } from "./skip-ahead";

// Skip ahead in Learner Memory (spec 2026-11-12 A8): "I know this: quiz me" on the Topic Start card. Missing no more than
// one question passes the whole Topic (every Check passed, so the Course Map shows it passed) and schedules its questions
// as Reviews; missing two leaves the Topic where it was, with no penalty; one attempt per Topic per day; never on a Topic
// whose last Check is a conversation Check about the Learner's own work.

const question = (n: number) => `
  - id: q${n}
    prompt: Question ${n}?
    choices: [{ id: a, text: Right ${n} }, { id: b, text: Wrong ${n}, mistake: { fix: Fix ${n}. } }]
    answer: a
    explanation: Because ${n}.
    source: Source ${n}`;

/** One Topic with no Skills: a quiz Check of six written questions (three a try, two to pass), then a conversation Check. */
const topicFile = ({ ownWork = false } = {}) => `
id: t
title: T
stage: foundation
path: 1
cases: [{ id: c, title: C, asOf: 2018-10-24, story: S, reveal: R }]
concept: C
principle: P
questions:${[1, 2, 3, 4, 5, 6].map(question).join("")}
checks:
  - id: quiz
    kind: quiz
    questions: [q1, q2, q3, q4, q5, q6]
    perAttempt: 3
    passRule: { correct: 2 }
  - id: talk
    kind: conversation
    prompt: Explain.
    passCriteria: Explains.${ownWork ? "\n    ownWork: true" : ""}
`;

function testMap(options?: { ownWork?: boolean }): CourseMap {
  const { map, errors } = parseCourseMap([{ name: "t.yaml", text: topicFile(options) }]);
  if (!map) throw new Error(errors.join("\n"));
  return map;
}

const day1 = new Date("2026-11-13T09:00:00Z");
const later1 = new Date("2026-11-13T20:00:00Z");
const day2 = new Date("2026-11-14T09:00:00Z");
const me = OWNER_LEARNER_ID;

async function atStory(map = testMap()) {
  const db = await testDb();
  await ensureTopicStarted(db, map, day1, me);
  return { db, map };
}

async function open(db: Db, map: CourseMap, now = day1, learnerId = me): Promise<SkipAheadQuiz> {
  const started = await startSkipAhead(db, map, "t", now, learnerId);
  if (!started.ok) throw new Error(started.reason);
  return started.quiz;
}

/** Answers every question right except the first `misses`. */
const answersMissing = (quiz: SkipAheadQuiz, misses: number) => Object.fromEntries(quiz.questions.map((q, i) => [q.id, i < misses ? "b" : "a"]));

describe("skip ahead", () => {
  it("offers one question for each idea, at least four and at most eight, without their key", async () => {
    const { db, map } = await atStory();
    expect(await skipAheadState(db, map, await loadProgress(db, me), "t", day1, me)).toBe("offer");
    const quiz = await open(db, map);
    expect(quiz.questions.map((q) => q.id)).toEqual(["q1", "q2", "q3", "q4", "q5", "q6"]);
    expect(quiz.needed).toBe(5);
    expect(JSON.stringify(quiz)).not.toContain("Because");
    expect(quiz.questions[0]).not.toHaveProperty("answer");
  });

  it("passes the whole Topic with one miss: every Check passed, the Course Map shows it passed, and its questions come back as Reviews", async () => {
    const { db, map } = await atStory();
    const quiz = await open(db, map);
    const result = await submitSkipAhead(db, map, quiz.attemptId, answersMissing(quiz, 1), later1, me);
    expect(result).toMatchObject({ ok: true, passed: true, correctCount: 5, shown: 6 });

    const progress = await loadProgress(db, me);
    expect(progress.topics.t).toMatchObject({ status: "passed" });
    expect(progress.topics.t.passedChecks.sort()).toEqual(["quiz", "talk"]);
    expect(courseOverview(map, progress).find((t) => t.id === "t")).toMatchObject({ status: "passed" });
    expect(navigate(map, progress)).toBeNull();

    const results = await db.select().from(checkResults);
    expect(results.map((r) => [r.checkId, r.passed])).toEqual([["quiz", true], ["talk", true]]);
    expect(results[0].evidence).toBe("Passed through skip ahead: 5 of 6 right.");

    const cards = await db.select().from(reviewCards);
    expect(cards.map((c) => c.questionId).sort()).toEqual(["q1", "q2", "q3", "q4", "q5", "q6"]);
    const log = await db.select().from(reviewLog);
    expect(log.find((r) => r.questionId === "q1")?.rating).toBe(1);
    expect(log.find((r) => r.questionId === "q2")?.rating).toBe(3);
  });

  it("leaves the Topic at its story with two misses: no Check result, no Review, no penalty", async () => {
    const { db, map } = await atStory();
    const quiz = await open(db, map);
    const result = await submitSkipAhead(db, map, quiz.attemptId, answersMissing(quiz, 2), later1, me);
    expect(result).toMatchObject({ ok: true, passed: false, correctCount: 4, needed: 5, next: null });
    if (result.ok) expect(result.questions[0].mistake?.fix).toBe("Fix 1.");

    expect(navigate(map, await loadProgress(db, me))).toMatchObject({ topic: { id: "t" }, status: "in_progress", step: "story" });
    expect(await db.select().from(checkResults)).toEqual([]);
    expect(await db.select().from(reviewCards)).toEqual([]);
  });

  it("allows one attempt per Topic per day: refused again that day, offered again the next", async () => {
    const { db, map } = await atStory();
    const quiz = await open(db, map);
    await submitSkipAhead(db, map, quiz.attemptId, answersMissing(quiz, 2), day1, me);

    expect(await skipAheadState(db, map, await loadProgress(db, me), "t", later1, me)).toBe("tried_today");
    expect(await startSkipAhead(db, map, "t", later1, me)).toEqual({ ok: false, reason: TRIED_TODAY, status: 409 });

    expect(await skipAheadState(db, map, await loadProgress(db, me), "t", day2, me)).toBe("offer");
    const tomorrow = await open(db, map, day2);
    expect(tomorrow.attemptId).not.toBe(quiz.attemptId);
    expect(await db.select().from(skipAheadAttempts)).toHaveLength(2);
  });

  it("reopens the same quiz, unanswered, when it is opened again the same day", async () => {
    const { db, map } = await atStory();
    const first = await open(db, map);
    const again = await open(db, map, later1);
    expect(again).toEqual(first);
  });

  it("marks a repeat submission as the first and changes nothing", async () => {
    const { db, map } = await atStory();
    const quiz = await open(db, map);
    await submitSkipAhead(db, map, quiz.attemptId, answersMissing(quiz, 2), day1, me);
    const repeat = await submitSkipAhead(db, map, quiz.attemptId, answersMissing(quiz, 0), later1, me);
    expect(repeat).toMatchObject({ ok: true, passed: false, correctCount: 4 });
    expect(await db.select().from(checkResults)).toEqual([]);
  });

  it("is not offered on a Topic whose last Check is a conversation Check about the Learner's own work (Spine 15)", async () => {
    const map = testMap({ ownWork: true });
    const { db } = await atStory(map);
    expect(await skipAheadState(db, map, await loadProgress(db, me), "t", day1, me)).toBeNull();
    expect(await startSkipAhead(db, map, "t", day1, me)).toMatchObject({ ok: false, status: 409 });
    expect(await db.select().from(skipAheadAttempts)).toEqual([]);
  });

  it("answers another Learner's attempt as no such quiz", async () => {
    const { db, map } = await atStory();
    const quiz = await open(db, map);
    const [{ id: other }] = await db.insert(learners).values({ name: "second" }).returning({ id: learners.id });
    expect(await submitSkipAhead(db, map, quiz.attemptId, answersMissing(quiz, 0), day1, other)).toMatchObject({ ok: false, status: 404 });
  });

  it("fails soft without its table: nothing offered, and a press is answered plainly", async () => {
    const { db, map } = await atStory();
    await db.execute(sql`drop table skip_ahead_attempts`);
    expect(await skipAheadState(db, map, await loadProgress(db, me), "t", day1, me)).toBeNull();
    expect(await startSkipAhead(db, map, "t", day1, me)).toMatchObject({ ok: false, status: 503 });
    expect(await submitSkipAhead(db, map, 1, {}, day1, me)).toMatchObject({ ok: false, status: 503 });
  });

  it("marks two submissions sent at once by the first to arrive: one stored marking, never a pass bought by sending both", async () => {
    const { db, map } = await atStory();
    const quiz = await open(db, map);
    // One answer set misses two (a fail), the other misses none (a pass): only one of them may count.
    const [a, b] = await Promise.all([
      submitSkipAhead(db, map, quiz.attemptId, answersMissing(quiz, 2), later1, me),
      submitSkipAhead(db, map, quiz.attemptId, answersMissing(quiz, 0), later1, me),
    ]);
    expect(a).toEqual(b);
    const [row] = await db.select().from(skipAheadAttempts);
    expect(row.passed).toBe(a.ok && a.passed);
    expect(row.correctCount).toBe(a.ok ? a.correctCount : null);
    expect((await db.select().from(checkResults)).length).toBe(a.ok && a.passed ? 2 : 0);
  });

  it("refuses an attempt opened on an earlier day and never submitted, so attempts cannot be saved up", async () => {
    const { db, map } = await atStory();
    const monday = await open(db, map, day1);
    expect(await submitSkipAhead(db, map, monday.attemptId, answersMissing(monday, 0), day2, me)).toMatchObject({ ok: false, status: 409 });
    expect(await db.select().from(checkResults)).toEqual([]);
    expect((await db.select().from(skipAheadAttempts))[0].finishedAt).toBeNull();
  });

  it("refuses a quiz whose questions fell below four while it was open, so one right answer cannot pass a Topic", async () => {
    const { db, map } = await atStory();
    const quiz = await open(db, map);
    // The Topic file loses q4 to q6 while the quiz is open.
    const text = topicFile().replace(/\n  - id: q4[\s\S]*?(?=\nchecks:)/, "").replace("[q1, q2, q3, q4, q5, q6]", "[q1, q2, q3]");
    const { map: shrunk, errors } = parseCourseMap([{ name: "t.yaml", text }]);
    if (!shrunk) throw new Error(errors.join("\n"));
    expect(shrunk.topic("t")!.questions).toHaveLength(3);
    expect(await submitSkipAhead(db, shrunk, quiz.attemptId, answersMissing(quiz, 0), later1, me)).toMatchObject({ ok: false, status: 409 });
    expect(await db.select().from(checkResults)).toEqual([]);
  });
});
