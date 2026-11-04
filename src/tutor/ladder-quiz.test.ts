import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { CONVERTED_TOPIC_DATA, topicFileOf } from "@/course/lesson-fixture";
import { parseCourseMap, type CourseMap } from "@/course/map";
import { OWNER_LEARNER_ID, topicProgress } from "@/db/schema";
import type { Db } from "@/db/types";
import { openQuiz } from "@/learner/quiz";
import { skillStates } from "@/learner/skill-state";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { submitQuizAnswers } from "./check-results";
import { PARK_OFFER } from "./park-items";
import { runTutorTurn, type TurnEvent, type TurnInput } from "./turn";

/**
 * Seam: the quiz follow-up turn on the repair ladder (ticket #245). T13 records each Skill-tagged quiz answer, so misses
 * in a row on a Skill count across quiz attempts: the second re-teaches, the third shows the park offer instead.
 */

const { map: parsed } = parseCourseMap([topicFileOf(CONVERTED_TOPIC_DATA)]);
const map = parsed as CourseMap;
const me = OWNER_LEARNER_ID;
const t0 = new Date("2026-11-04T10:00:00Z");

async function turn(db: Db, input: TurnInput) {
  const { client, requests } = scriptedClient([{ content: [{ type: "text", text: "One slip, one fix.\n\nTry this one?" }] }]);
  const events: TurnEvent[] = [];
  for await (const e of runTutorTurn({ db, client, map, learnerId: me, now: () => t0 }, input)) events.push(e);
  // What this turn added: the messages after the last reply in the history it sent.
  const sent = requests[0]?.messages ?? [];
  const lastReply = sent.map((m) => m.role).lastIndexOf("assistant");
  return { events, body: JSON.stringify(sent.slice(lastReply + 1)), items: events.flatMap((e) => (e.type === "item" ? [e.item] : [])) };
}

/** Opens the first Check's quiz and answers every question wrong. */
async function missQuiz(db: Db) {
  const quiz = (await openQuiz(db, map, t0, me))!;
  const answers = Object.fromEntries(quiz.questions.map((q) => [q.id, "9999"]));
  const result = await submitQuizAnswers(db, map, quiz.attemptId, answers, t0, me);
  expect(result).toMatchObject({ ok: true, passed: false });
}

async function atQuiz(db: Db) {
  await turn(db, "Hi");
  await db.update(topicProgress).set({ step: "check" }).where(and(eq(topicProgress.learnerId, me), eq(topicProgress.topicId, "pct-demo")));
}

describe("quiz questions climb the same ladder", () => {
  it("gives feedback on a first miss, re-teaches on the second, and shows the park offer on the third", async () => {
    const db = await testDb();
    await atQuiz(db);

    await missQuiz(db);
    const first = await turn(db, { quizFollowUp: true });
    expect(first.body).not.toContain("Reply kind: reteach");

    await missQuiz(db);
    const second = await turn(db, { quizFollowUp: true });
    expect(second.body).toContain("Reply kind: reteach");
    expect(second.body).toContain("Method: restate");
    expect((await skillStates(db, me, "pct-demo"))["pts-to-bp"].methodsUsed).toEqual(["restate"]);

    await missQuiz(db);
    const third = await turn(db, { quizFollowUp: true });
    expect(third.items.map((i) => i.kind)).toContain(PARK_OFFER);
    expect(third.body).toContain("park offer");
    expect(third.body).not.toContain("Reply kind: reteach");
  });
});
