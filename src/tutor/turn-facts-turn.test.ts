import { describe, expect, it } from "vitest";
import type { Db } from "@/db/types";
import { OWNER_LEARNER_ID } from "@/db/schema";
import { saveFinishedStep, saveJump } from "@/learner/memory";
import { checkTabNow } from "@/learner/quiz";
import { presentValueOnly } from "@/test/present-value-map";
import { testDb } from "@/test/pglite";
import { scriptedClient, type ScriptedReply } from "@/test/scripted-client";
import { GO_DEEPER } from "./chips";
import { runTutorTurn, type TurnEvent, type TurnInput } from "./turn";

/**
 * Seam 1, Tutor Turn: the turn's facts reach the Tutor in the Course Navigator context (spec #229, ticket #238).
 * While a quiz is open the context names the numbers to keep away from, and the word limit follows the step.
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

async function toQuiz(db: Db) {
  await turn(db, "Hi", "Once, a lottery winner had a choice.");
  for (const step of ["story", "concept", "your_turn"] as const) await saveFinishedStep(db, map, step, new Date(), OWNER_LEARNER_ID);
  return (await checkTabNow(db, map, new Date(), OWNER_LEARNER_ID)).quiz!;
}

describe("a Tutor Turn while a quiz is open", () => {
  it("sends the blocked numbers, the 80-word limit and the rule to teach with other numbers", async () => {
    const db = await testDb();
    await toQuiz(db);
    const { requests, events } = await turn(db, "I'm stuck. Can you explain discounting again?");
    expect(events.at(-1)).toMatchObject({ type: "done" });
    const request = sent(requests[0]);
    expect(request).toContain("Word limit for this reply: 80 words.");
    // The open attempt's numbers ($1,100, 10%, $1,210) and the next attempt's ($5,000 and its choices).
    expect(request).toMatch(/Blocked numbers \(in the open quiz questions and the next attempt's\): [^"]*\b1100\b[^"]*\b1210\b[^"]*\b5000\b/);
    expect(request).toContain("help freely");
    expect(request).not.toContain("Do not write quiz questions");
  });

  it("the opener at an open quiz offers help now and names the numbers to keep away from", async () => {
    const db = await testDb();
    // The Learner reached the quiz in an earlier Session's time; this Topic's Session has no messages yet.
    await saveJump(db, map, "present-value", new Date(), OWNER_LEARNER_ID);
    for (const step of ["story", "concept", "your_turn"] as const) await saveFinishedStep(db, map, step, new Date(), OWNER_LEARNER_ID);
    const { requests } = await turn(db, { opener: true }, "Your quiz is in the Check tab.");
    const request = sent(requests[0]);
    expect(request).toContain("is open on the right, in the Check tab. Point the Learner to it");
    expect(request).toContain("offer help now");
    expect(request).toMatch(/Keep away from these numbers: [^"]*\b1100\b/);
    expect(request).not.toContain("Do not teach or hint");
  });
});

describe("a Go deeper turn", () => {
  it("is told the long word limit and its Reply kind", async () => {
    const db = await testDb();
    await turn(db, "Hi", "Once, a lottery winner had a choice.");
    const { requests } = await turn(db, GO_DEEPER);
    const request = sent(requests[0]);
    expect(request).toContain("Word limit for this reply: 120 words.");
    expect(request).toContain("Reply kind: go_deeper.");
  });
});
