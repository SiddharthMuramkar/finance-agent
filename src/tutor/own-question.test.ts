import { describe, expect, it } from "vitest";
import { CONVERTED_TOPIC_DATA, topicFileOf } from "@/course/lesson-fixture";
import { parseCourseMap, type CourseMap } from "@/course/map";
import { OWNER_LEARNER_ID } from "@/db/schema";
import type { Db } from "@/db/types";
import { saveFinishedStep } from "@/learner/memory";
import { testDb } from "@/test/pglite";
import { scriptedClient, type ScriptedReply } from "@/test/scripted-client";
import { isOwnQuestion, OWN_QUESTION_FALLBACK } from "./own-question";
import { QUICK_TRY, type QuickTryData } from "./session-item-kinds";
import { loadSessionItems } from "./session-items";
import { loadThread } from "./transcript";
import { runTutorTurn, type TurnEvent, type TurnInput } from "./turn";

/**
 * The fallback tells the truth (spec 2026-11-12, A4; ADR 0006). When a reply fails its checks and its retry fails too,
 * an own-question turn (A5) gets one fixed line and the open step item again; a step-led turn keeps the card's
 * write-down line. The Topic is the converted lesson fixture, whose Concept card's write-down line is below.
 */

const map = parseCourseMap([topicFileOf(CONVERTED_TOPIC_DATA)]).map as CourseMap;
const me = OWNER_LEARNER_ID;
const WRITE_DOWN = "Points times 100 give basis points. Basis points divided by 100 give points.";
/** About 150 words: over the limit at every step, so the draft and its retry both fail. */
const LONG = `${"A basis point is a hundredth of a percentage point. ".repeat(17).trim()}\nWhich one is smaller?`;
const say = (text: string): ScriptedReply => ({ content: [{ type: "text", text }] });

async function turn(db: Db, input: TurnInput, replies: ScriptedReply[] = [say("In 1994 the Fed held its rate at 3%.")]) {
  const { client } = scriptedClient(replies);
  const events: TurnEvent[] = [];
  for await (const e of runTutorTurn({ db, client, map, learnerId: me }, input)) events.push(e);
  return events;
}

const texts = (events: TurnEvent[]) => events.flatMap((e) => (e.type === "text" ? [e.text] : []));
const tries = async (db: Db, sessionId: number) => (await loadSessionItems(db, sessionId, me)).filter((i) => i.kind === QUICK_TRY).map((i) => i.data as QuickTryData);
const sessionOf = (events: TurnEvent[]) => (events.at(-1) as Extract<TurnEvent, { type: "done" }>).ref.sessionId;

/** A Learner at Your turn with the first Quick try open (the turn that reached it posted it). */
async function atYourTurn(db: Db) {
  await turn(db, "Hi");
  await saveFinishedStep(db, map, "story", new Date(), me);
  await saveFinishedStep(db, map, "concept", new Date(), me);
  return sessionOf(await turn(db, "Ready."));
}

describe("an own-question turn (A5)", () => {
  it("is a message the Learner typed, with no quiz Check open and no conversation Check waiting for its answer", () => {
    expect(isOwnQuestion({ typed: true, quizOpen: false, conversationCheckWaiting: false })).toBe(true);
    expect(isOwnQuestion({ typed: false, quizOpen: false, conversationCheckWaiting: false })).toBe(false);
    expect(isOwnQuestion({ typed: true, quizOpen: true, conversationCheckWaiting: false })).toBe(false);
    expect(isOwnQuestion({ typed: true, quizOpen: false, conversationCheckWaiting: true })).toBe(false);
  });
});

describe("the fallback tells the truth (A4)", () => {
  // An own question streams (A5): the fixed line is what follows a sentence the stream guard stopped on, never the
  // write-down line. (A long reply is no longer refused there: the word count is a soft check.)
  const TIP = "A rate cut lowers what banks pay to borrow. You should buy HDFC Bank now. It will rise.";

  it("answers an own question whose reply the guard stopped with what was shown, the fixed line, then the open Quick try again, never the write-down line", async () => {
    const db = await testDb();
    const sessionId = await atYourTurn(db);
    const [open] = await tries(db, sessionId);
    expect(open).toBeDefined();

    const events = await turn(db, "RBI just cut rates. should I buy HDFC Bank shares now? just tell me yes or no", [say(TIP)]);
    expect(texts(events).join("")).toBe(`A rate cut lowers what banks pay to borrow. \n\n${OWN_QUESTION_FALLBACK}`);
    expect(JSON.stringify(events)).not.toContain(WRITE_DOWN);
    expect(JSON.stringify(events)).not.toContain("You should buy");
    // The line comes first, then the open try, shown again: the same try, so answering either copy answers it.
    const line = events.findLastIndex((e) => e.type === "text");
    const again = events.findIndex((e) => e.type === "item" && e.item.kind === QUICK_TRY);
    expect(again).toBeGreaterThan(line);
    expect((events[again] as Extract<TurnEvent, { type: "item" }>).item.data).toEqual(open);
    expect(events.at(-1)).toMatchObject({ type: "done", usage: { replyCheck: { retried: false, fallback: true, failed: ["guard"] } } });
    // A reload shows the same: what was shown and the line as the Tutor's reply, and the try under it.
    const thread = await loadThread(db, sessionId, map, me);
    const shown = thread.findLastIndex((l) => l.role === "assistant");
    expect(thread[shown]).toMatchObject({ role: "assistant", text: `A rate cut lowers what banks pay to borrow. \n\n${OWN_QUESTION_FALLBACK}` });
    expect(thread.slice(shown + 1).some((l) => l.role === "item" && l.kind === QUICK_TRY && (l.data as QuickTryData).key === open.key)).toBe(true);
  });

  it("at a step with no Quick try open, an own question gets the line alone", async () => {
    const db = await testDb();
    await turn(db, "Hi");
    await saveFinishedStep(db, map, "story", new Date(), me);
    const events = await turn(db, "Should I buy HDFC Bank?", [say("Buy. It is cheap.")]);
    expect(texts(events)).toEqual([OWN_QUESTION_FALLBACK]);
    expect(events.some((e) => e.type === "item" && e.item.kind === QUICK_TRY)).toBe(false);
  });

  it("a step-led turn (a Choice pressed) keeps the card's write-down line", async () => {
    const db = await testDb();
    await turn(db, "Hi");
    await saveFinishedStep(db, map, "story", new Date(), me);
    const events = await turn(db, "Show me.", [say(LONG), say(LONG)]);
    expect(texts(events)).toEqual([WRITE_DOWN]);
    expect(JSON.stringify(events)).not.toContain(OWN_QUESTION_FALLBACK);
  });

  it("a step-led turn at Your turn keeps the write-down line and shows no second copy of the open try", async () => {
    const db = await testDb();
    const sessionId = await atYourTurn(db);
    const before = await tries(db, sessionId);
    const events = await turn(db, "Show me.", [say(LONG), say(LONG)]);
    expect(texts(events)).toEqual([WRITE_DOWN]);
    expect(await tries(db, sessionId)).toEqual(before);
  });
});
