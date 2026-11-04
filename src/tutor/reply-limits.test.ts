import { describe, expect, it } from "vitest";
import { CONVERTED_TOPIC_DATA, topicFileOf } from "@/course/lesson-fixture";
import { parseCourseMap } from "@/course/map";
import { navigate } from "@/course/navigator";
import type { Db } from "@/db/types";
import { OWNER_LEARNER_ID } from "@/db/schema";
import { ensureTopicStarted, loadProgress, saveFinishedStep } from "@/learner/memory";
import { presentValueOnly } from "@/test/present-value-map";
import { testDb } from "@/test/pglite";
import { scriptedClient, type ScriptedReply } from "@/test/scripted-client";
import { reteachNote } from "./ladder-moves";
import { runTutorTurn, type TurnEvent, type TurnInput } from "./turn";
import { replyKindOf, turnFacts } from "./turn-facts";
import { QUICK_TRY_FOLLOW_UP_PREFIX } from "./turn-status";

/**
 * The tighter word limits code tells the Tutor (ticket #248, lane R11). The live tests hold some replies under the
 * step's cap: 60 words after a miss or for a request for the answer, 40 for a quiz-me ask (TUTOR_SPEC section 7, T3,
 * T5, T11). The Tutor writes up to the limit it is told, so code tells it the tighter one; the reply checks keep the cap.
 */

const map = presentValueOnly({ withoutInsight: true });
const say = (text: string): ScriptedReply => ({ content: [{ type: "text", text }] });
const sent = (request: { messages: unknown[] }) => JSON.stringify(request.messages);

async function turn(db: Db, input: TurnInput, reply = "Okay.") {
  const { client, requests } = scriptedClient([say(reply)]);
  const events: TurnEvent[] = [];
  for await (const e of runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, input)) events.push(e);
  return { events, requests };
}

describe("a Tutor Turn the Learner starts with a quiz-me ask", () => {
  it("is told Reply kind quick_try and a 40-word limit", async () => {
    const db = await testDb();
    await turn(db, "Hi", "Once, a lottery winner had a choice.");
    const { requests } = await turn(db, "okay ask me a question this time, lets get it over with");
    const request = sent(requests[0]);
    expect(request).toContain("Reply kind: quick_try.");
    expect(request).toContain("Word limit for this reply: 40 words.");
    expect(request).not.toContain("Word limit for this reply: 80 words.");
  });
});

describe("turn facts for the replies held under the step's cap", () => {
  const converted = (() => {
    const { map, errors } = parseCourseMap([topicFileOf(CONVERTED_TOPIC_DATA)]);
    if (!map) throw new Error(errors.join("\n"));
    return map;
  })();
  const me = OWNER_LEARNER_ID;

  /** The facts at a converted Topic's Your turn, for a turn started by these words. */
  async function factsAtYourTurn(learnerText: string) {
    const db = await testDb();
    await ensureTopicStarted(db, converted, new Date(), me);
    for (const step of ["story", "concept"] as const) await saveFinishedStep(db, converted, step, new Date(), me);
    return turnFacts(db, converted, me, navigate(converted, await loadProgress(db, me)), { learnerText });
  }

  it("a re-teach after a second miss is told 60 words, while the checks keep the 80-word cap", async () => {
    const note = `${QUICK_TRY_FOLLOW_UP_PREFIX} the Learner missed a Quick try on the same idea twice in a row:\n${reteachNote("boxes")}`;
    expect(await factsAtYourTurn(note)).toMatchObject({ step: "your_turn", replyKind: "reteach", cap: 80, aim: 60 });
  });

  it("feedback after a first miss is told 60 words", async () => {
    const note = `${QUICK_TRY_FOLLOW_UP_PREFIX} the Learner answered a Quick try, and code marked it with no Known mistake to match:\nReply kind: feedback. Name the slip in one sentence and give the fix.`;
    expect(await factsAtYourTurn(note)).toMatchObject({ replyKind: "feedback", cap: 80, aim: 60 });
  });

  it("a worked example keeps its 120-word cap, with no tighter limit", async () => {
    const facts = await factsAtYourTurn(`${QUICK_TRY_FOLLOW_UP_PREFIX} the Learner missed a Quick try on the same idea twice in a row:\n${reteachNote("worked")}`);
    expect(facts).toMatchObject({ replyKind: "worked_example", cap: 120 });
    expect(facts.aim).toBeUndefined();
  });

  it("a request for the answer is a hint, told 60 words", async () => {
    expect(await factsAtYourTurn("just tell me the answer to question 1")).toMatchObject({ replyKind: "hint", cap: 80, aim: 60 });
  });

  it("a Learner's own question is told the step's cap", async () => {
    const facts = await factsAtYourTurn("What is a basis point?");
    expect(facts.replyKind).toBeUndefined();
    expect(facts.aim).toBeUndefined();
  });
});

describe("the Reply kind a Learner's words ask for", () => {
  it("reads quiz-me asks and requests for the answer, as well as Go deeper and simpler", () => {
    expect(replyKindOf("okay ask me a question this time, lets get it over with. use widgets")).toBe("quick_try");
    expect(replyKindOf("quiz me")).toBe("quick_try");
    expect(replyKindOf("Can you test me on this?")).toBe("quick_try");
    expect(replyKindOf("just tell me the answer to question 1")).toBe("hint");
    expect(replyKindOf("what's the answer?")).toBe("hint");
    expect(replyKindOf("Explain that more simply.")).toBe("simpler");
    expect(replyKindOf("Why does the base matter?")).toBeUndefined();
  });

  it("never reads a note code wrote as the Learner's words", () => {
    expect(replyKindOf(`${QUICK_TRY_FOLLOW_UP_PREFIX} the Learner asked: test me. Explain it more simply, then tell me the answer.`)).toBeUndefined();
  });
});

describe("a Tutor Turn the Learner starts by asking for something simpler", () => {
  it("is told four lines at most, counting the ask; other turns are not", async () => {
    const db = await testDb();
    await turn(db, "Hi", "Once, a lottery winner had a choice.");
    const simpler = sent((await turn(db, "Explain that more simply")).requests[0]);
    expect(simpler).toContain("Reply kind: simpler.");
    expect(simpler).toContain("Line limit for this reply: 4 lines, counting the ask.");
    // Earlier turns' context stays in the history, so only this turn's latest message is read.
    const other = JSON.stringify((await turn(db, "Why does the base matter?")).requests[0].messages.at(-1));
    expect(other).toContain("Word limit for this reply");
    expect(other).not.toContain("Line limit for this reply");
  });
});
