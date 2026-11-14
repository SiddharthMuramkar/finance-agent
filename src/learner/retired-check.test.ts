import { describe, expect, it } from "vitest";
import { loadCourseMap } from "@/course/map";
import { navigate } from "@/course/navigator";
import { checkResults, learnerState, OWNER_LEARNER_ID, quizAttempts, reviewCards, topicProgress } from "@/db/schema";
import { testDb } from "@/test/pglite";
import { loadProgress } from "./memory";
import { checkTabNow, openQuiz, pendingQuizNote } from "./quiz";
import { enrollPassedQuestions, reviewState } from "./review";

// Spec 2026-11-12 H1 took the log-return Check (cp-quiz-log-return) and its six questions out of Growth and compounding.
// A Learner whose place was at that Check, with an open attempt, a missed one not yet told to the Tutor and a Review card
// for one of its questions, is moved on safely: nothing shows for the removed Check, and what was saved is kept untouched.

const map = loadCourseMap();
const TOPIC = "num-compounding";
const BEFORE_LOGS = ["cp-quiz-compounding", "cp-quiz-fall-recover", "cp-quiz-rule-72", "cp-quiz-steady-rate"];
const now = new Date("2026-11-13T09:00:00Z");
const learnerId = OWNER_LEARNER_ID;

async function atTheRemovedCheck() {
  const db = await testDb();
  await db.insert(learnerState).values({ id: learnerId, learnerId, currentTopicId: TOPIC });
  await db.insert(topicProgress).values({ learnerId, topicId: TOPIC, step: "check", revealShown: false, status: "in_progress" });
  for (const checkId of [...BEFORE_LOGS, "cp-quiz-log-return"]) {
    await db.insert(checkResults).values({ learnerId, topicId: TOPIC, checkId, passed: true });
  }
  // A missed attempt at the removed Check that the Tutor never heard about, then the open one.
  await db.insert(quizAttempts).values({ learnerId, checkId: "cp-quiz-log-return", attemptNo: 0, questionIds: ["cp-q-log-return", "cp-q-log-why"], answers: { "cp-q-log-return": "b" }, correctCount: 0, passed: false, submittedAt: now });
  await db.insert(quizAttempts).values({ learnerId, checkId: "cp-quiz-log-return", attemptNo: 1, questionIds: ["cp-q-log-smaller", "cp-q-log-two-years"] });
  await db.insert(reviewCards).values({ learnerId, questionId: "cp-q-log-smaller", due: new Date("2026-11-01T00:00:00Z"), stability: 1, difficulty: 5, elapsedDays: 0, scheduledDays: 1, reps: 1, lapses: 0, learningSteps: 0, state: 2 });
  return db;
}

describe("a Learner whose place was at the removed log-return Check", () => {
  it("stands at the conversation Check that now follows, with no quiz and no Check tab for the removed Check", async () => {
    const db = await atTheRemovedCheck();
    expect(navigate(map, await loadProgress(db, learnerId))).toMatchObject({ step: "check", check: { id: "cp-sensex-rate", kind: "conversation" } });
    expect(await openQuiz(db, map, now, learnerId)).toBeNull();
    expect(await checkTabNow(db, map, now, learnerId)).toEqual({ quiz: null, missed: null });
  });

  it("keeps every saved row: the attempts, the results and the Review card stay, and none reaches the Tutor or the Review panel", async () => {
    const db = await atTheRemovedCheck();
    expect(await pendingQuizNote(db, map, learnerId, TOPIC)).toBeNull();
    await enrollPassedQuestions(db, map, learnerId);
    const review = await reviewState(db, map, now, learnerId);
    expect(review.question?.id).not.toBe("cp-q-log-smaller");
    expect(review.dueCount).toBe(0);
    expect(await db.select().from(quizAttempts)).toHaveLength(2);
    expect((await db.select().from(checkResults)).map((r) => r.checkId)).toContain("cp-quiz-log-return");
    expect((await db.select().from(reviewCards)).map((c) => c.questionId)).toEqual(["cp-q-log-smaller"]);
  });
});
