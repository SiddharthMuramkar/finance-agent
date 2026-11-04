import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { CONVERTED_TOPIC_DATA, topicFileOf } from "@/course/lesson-fixture";
import { parseCourseMap, type CourseMap } from "@/course/map";
import { OWNER_LEARNER_ID, practiceAnswers, topicProgress } from "@/db/schema";
import { openQuiz } from "@/learner/quiz";
import { skillStates } from "@/learner/skill-state";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { submitQuizAnswers } from "./check-results";
import { runTutorTurn } from "./turn";

/**
 * Seam: a submitted quiz in Learner Memory (ticket #248, go-live fixes). Several wrong answers on one Skill in one attempt
 * are one miss on the ladder, so a Learner's first failed quiz never jumps straight to a re-teach or the park offer.
 */

const me = OWNER_LEARNER_ID;
const t0 = new Date("2026-11-04T10:00:00Z");

/** Check 1 asks three basis-point questions from one template: three questions on one Skill. */
function oneSkillQuizMap(): CourseMap {
  const data = structuredClone(CONVERTED_TOPIC_DATA) as { checks: Record<string, unknown>[] };
  data.checks[0] = { ...data.checks[0], templates: ["bp-from-move"], perAttempt: 3, passRule: { correct: 3 } };
  const { map, errors } = parseCourseMap([topicFileOf(data)]);
  if (!map) throw new Error(errors.join("\n"));
  return map;
}

describe("a missed quiz on the ladder", () => {
  it("counts three wrong answers on one Skill in a first attempt as one miss, and still logs each answer", async () => {
    const map = oneSkillQuizMap();
    const db = await testDb();
    const { client } = scriptedClient([{ content: [{ type: "text", text: "Hello." }] }]);
    for await (const e of runTutorTurn({ db, client, map, learnerId: me, now: () => t0 }, "Hi")) void e;
    await db.update(topicProgress).set({ step: "check" }).where(and(eq(topicProgress.learnerId, me), eq(topicProgress.topicId, "pct-demo")));

    const quiz = (await openQuiz(db, map, t0, me))!;
    expect(quiz.questions).toHaveLength(3);
    const result = await submitQuizAnswers(db, map, quiz.attemptId, Object.fromEntries(quiz.questions.map((q) => [q.id, "9999"])), t0, me);
    expect(result).toMatchObject({ ok: true, passed: false });

    expect((await skillStates(db, me, "pct-demo"))["pts-to-bp"]).toMatchObject({ missesInRow: 1, tries: 1 });
    expect(await db.select().from(practiceAnswers).where(eq(practiceAnswers.learnerId, me))).toHaveLength(3);
  });
});
