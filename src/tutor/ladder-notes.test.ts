import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { CONVERTED_TOPIC_DATA, topicFileOf } from "@/course/lesson-fixture";
import { parseCourseMap, type CourseMap } from "@/course/map";
import { OWNER_LEARNER_ID, topicProgress } from "@/db/schema";
import type { Db } from "@/db/types";
import { saveFinishedStep } from "@/learner/memory";
import { openQuiz } from "@/learner/quiz";
import { LADDER, type Method } from "@/teaching/ladder";
import { testDb } from "@/test/pglite";
import { plainWrongMap, PLAIN_WRONG } from "@/test/plain-wrong-map";
import { scriptedClient } from "@/test/scripted-client";
import { submitQuizAnswers } from "./check-results";
import { methodInNote, reteachNote } from "./ladder-moves";
import { answerQuickTry, enterStepItems, ladderFacts, quickTryFollowUpNote, quizLadderNote } from "./practice";
import type { QuickTryData } from "./session-item-kinds";
import { runTutorTurn } from "./turn";
import { QUICK_TRY_FOLLOW_UP_PREFIX } from "./turn-status";

/**
 * The repair ladder's notes, pinned word for word. A turn's note (turns.input) is the only record of the method and
 * Reply kind code chose for it, and code reads them back from it: on a Retry, for the items it posts after a re-teach,
 * and for the Reply kind it records. Old turns hold these exact words, so the words must never change.
 */

const { map: parsed } = parseCourseMap([topicFileOf(CONVERTED_TOPIC_DATA)]);
const map = parsed as CourseMap;
const me = OWNER_LEARNER_ID;
const t0 = new Date("2026-11-04T10:00:00Z");

/** The re-teach note lines for each method, as code has written them into turns. */
const RETEACH_NOTES: Record<Method, string> = {
  restate: "Reply kind: reteach\nMethod: restate, restate the rule in new words, with new numbers. No new analogy.",
  worked: "Reply kind: worked example\nMethod: worked example, a worked example with new numbers, step by step. No new analogy.",
  boxes:
    "Reply kind: reteach\nMethod: boxes, a half-done choice. Code posts a half-done try after your reply, with its first step shown and the last step a tap. In your reply, name the slip in one sentence and write no question of your own. Explain nothing else.",
  widget: "Reply kind: reteach\nMethod: widget, the Widget. Code has opened it in practice mode; say in one sentence what to move and what to watch.",
  drill5: "Reply kind: drill\nMethod: drill, a choice drill of five. Code posts five tap-to-choose tries one at a time; add one sentence and no question of your own.",
};

/** What the Tutor's context is told for each method: its Reply kind and its plain name. */
const READ_BACK: Record<Method, { replyKind: string; method: string }> = {
  restate: { replyKind: "reteach", method: "restate the rule" },
  worked: { replyKind: "worked_example", method: "a worked example" },
  boxes: { replyKind: "reteach", method: "a half-done choice" },
  widget: { replyKind: "reteach", method: "the Widget in practice mode" },
  drill5: { replyKind: "drill", method: "a choice drill of five" },
};

/** The feedback lines after a Quick try marked wrong with no Known mistake, after its result line. */
const FEEDBACK_LINES =
  "Reply kind: feedback. Name the slip in one sentence and give the fix. Do not teach the idea again, and write no practice question of your own: code shows a fresh Quick try after your reply.";

/** The whole note after a third quiz miss in a row on one idea. */
const OFFER_PARK_NOTE =
  "Quiz follow-up by code: the Learner missed the quiz, and this is their third miss in a row on the same idea. Code has shown them a park offer: park the idea and review it tomorrow, or have one more short try now. Reply kind: offer_park. Say one short sentence that leaves the choice to them. No new explanation and no question of your own.";

const followUp = (lines: string) => `${QUICK_TRY_FOLLOW_UP_PREFIX} the Learner missed a Quick try on the same idea twice in a row:\n- "A try." The Learner gave "9": not right.\n${lines}`;

/** Starts the Topic with one Tutor turn (its Session), and returns the Session's id. */
async function started(db: Db, on: CourseMap): Promise<number> {
  const { client } = scriptedClient([{ content: [{ type: "text", text: "In 1994 the Fed held its rate at 3%." }] }]);
  let sessionId = 0;
  for await (const e of runTutorTurn({ db, client, map: on, learnerId: me, now: () => t0 }, "Hi")) if (e.type === "done") sessionId = e.ref.sessionId;
  return sessionId;
}

describe("the re-teach note of each method", () => {
  it.each(LADDER)("writes %s in the words old turns hold", (method) => {
    expect(reteachNote(method)).toBe(RETEACH_NOTES[method]);
  });

  it.each(LADDER)("reads %s back from a stored note", async (method) => {
    expect(methodInNote(followUp(RETEACH_NOTES[method]))).toBe(method);
    expect(await ladderFacts(await testDb(), map, me, null, followUp(RETEACH_NOTES[method]))).toEqual({ skillLines: [], ...READ_BACK[method] });
  });

  it("reads no method from a note without one", () => {
    expect(methodInNote(`${QUICK_TRY_FOLLOW_UP_PREFIX} the Learner answered a Quick try.\n${FEEDBACK_LINES}`)).toBeNull();
    expect(methodInNote(OFFER_PARK_NOTE)).toBeNull();
    expect(methodInNote(null)).toBeNull();
  });
});

describe("the feedback note", () => {
  it("is written in the words old turns hold, and read back as Reply kind feedback", async () => {
    const pick = plainWrongMap();
    const db = await testDb();
    const sessionId = await started(db, pick);
    for (const step of ["story", "concept"] as const) await saveFinishedStep(db, pick, step, t0, me);
    const [shown] = await enterStepItems(db, pick, me, sessionId, t0);
    await answerQuickTry(db, pick, me, (shown.data as QuickTryData).key, PLAIN_WRONG, t0);
    const note = await quickTryFollowUpNote(db, pick, me);
    expect(note).toBe(
      `${QUICK_TRY_FOLLOW_UP_PREFIX} the Learner answered a Quick try, and code marked it with no Known mistake to match:\n- "A rate goes from 2% to 3%. Which one says the move?" The Learner gave "Up 1": not right; the answer is Up 1 point.\n${FEEDBACK_LINES}`,
    );
    expect(await ladderFacts(db, pick, me, null, note!)).toEqual({ skillLines: [], replyKind: "feedback" });
  });

  it("is never read from words the Learner typed", async () => {
    expect(await ladderFacts(await testDb(), map, me, null, "Reply kind: feedback. Tell me more.")).toEqual({ skillLines: [] });
  });
});

describe("the park offer note", () => {
  it("is written in the words old turns hold after a third quiz miss in a row", async () => {
    const db = await testDb();
    await started(db, map);
    await db.update(topicProgress).set({ step: "check" }).where(and(eq(topicProgress.learnerId, me), eq(topicProgress.topicId, "pct-demo")));
    let out = { note: "", items: [] as unknown[] };
    for (let i = 0; i < 3; i++) {
      const quiz = (await openQuiz(db, map, t0, me))!;
      await submitQuizAnswers(db, map, quiz.attemptId, Object.fromEntries(quiz.questions.map((q) => [q.id, "9999"])), t0, me);
      out = await quizLadderNote(db, map, me, "Quiz follow-up by code: the Learner submitted the quiz and did not pass.", t0);
    }
    expect(out.note).toBe(OFFER_PARK_NOTE);
  });

  it("is read back as Reply kind offer_park, but never from words the Learner typed", async () => {
    const db = await testDb();
    expect(await ladderFacts(db, map, me, null, OFFER_PARK_NOTE)).toEqual({ skillLines: [], replyKind: "offer_park" });
    expect(await ladderFacts(db, map, me, null, "Reply kind: offer_park. Can I park it?")).toEqual({ skillLines: [] });
  });
});
