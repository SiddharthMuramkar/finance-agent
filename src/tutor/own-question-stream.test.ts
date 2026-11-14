import { desc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { CONVERTED_TOPIC_DATA, topicFileOf } from "@/course/lesson-fixture";
import { parseCourseMap, type CourseMap } from "@/course/map";
import { messages, OWNER_LEARNER_ID, replyChecks, turns } from "@/db/schema";
import type { Db } from "@/db/types";
import { saveFinishedStep } from "@/learner/memory";
import { testDb } from "@/test/pglite";
import { scriptedClient, type ScriptedOptions, type ScriptedReply } from "@/test/scripted-client";
import { OWN_QUESTION_FALLBACK } from "./own-question";
import { CHECKING_LABEL } from "./reply-gate";
import { QUICK_TRY, REPLY_CHOICES, type QuickTryData } from "./session-item-kinds";
import { loadSessionItems } from "./session-items";
import { loadThread } from "./transcript";
import { runTutorTurn, type TurnDeps, type TurnEvent, type TurnInput } from "./turn";
import { requestStop } from "./turn-status";
import type { ProgressEvent } from "./tools";

/**
 * Own-question replies stream behind the stream guard (spec 2026-11-12, A5 and A7; ADR 0017). A message the Learner
 * types, with no quiz Check open and no conversation Check waiting, shows sentence by sentence as the model writes it;
 * a sentence telling the Learner to buy, sell or hold something, or holding an internal word, never shows; word count,
 * a second question and the currency are measured afterwards and never cost a retry; under the reply code shows the open
 * Quick try again. Step-led turns stay held. The Topic is the converted lesson fixture, at the 80-word Your turn.
 */

const map = parseCourseMap([topicFileOf(CONVERTED_TOPIC_DATA)]).map as CourseMap;
const me = OWNER_LEARNER_ID;
const say = (text: string): ScriptedReply => ({ content: [{ type: "text", text }] });
const texts = (events: TurnEvent[]) => events.flatMap((e) => (e.type === "text" ? [e.text] : []));
const doneOf = (events: TurnEvent[]) => events.at(-1) as Extract<TurnEvent, { type: "done" }>;

async function turn(db: Db, input: TurnInput, replies: ScriptedReply[], o: ScriptedOptions = {}, extra: Partial<TurnDeps> = {}) {
  const { client, requests } = scriptedClient(replies, o);
  const events: TurnEvent[] = [];
  for await (const e of runTutorTurn({ db, client, map, learnerId: me, ...extra }, input)) events.push(e);
  return { events, requests };
}

/** A Learner at Your turn with the first Quick try open (the turn that reached it posted it). Returns the Session. */
async function atYourTurn(db: Db) {
  await turn(db, "Hi", [say("In 1994 the Fed held its rate at 3%.")]);
  await saveFinishedStep(db, map, "story", new Date(), me);
  await saveFinishedStep(db, map, "concept", new Date(), me);
  return doneOf((await turn(db, "Ready.", [say("Here is your first try.")])).events).ref.sessionId;
}

const openTries = async (db: Db, sessionId: number) => (await loadSessionItems(db, sessionId, me)).filter((i) => i.kind === QUICK_TRY).map((i) => i.data as QuickTryData);
const lastRecord = async (db: Db) => (await db.select().from(replyChecks).orderBy(desc(replyChecks.id)).limit(1))[0];

const ANSWER = "A basis point is one hundredth of a percentage point. Traders use it so a small move reads as a whole number. A move from 4% to 4.25% is 25 basis points.";

describe("an own question's reply streams (A5)", () => {
  it("shows its first sentence while the model is still writing the rest", async () => {
    const db = await testDb();
    await atYourTurn(db);
    let release: () => void = () => {};
    const writing = new Promise<void>((r) => (release = r));
    const { client } = scriptedClient(
      [{ content: [{ type: "text", text: "A basis point is one hundredth of a percentage point. " }, { type: "text", text: "Traders use it for small moves." }], holdAfterFirstText: writing }],
      { deltaChars: 7 },
    );
    const events: TurnEvent[] = [];
    const running = (async () => {
      for await (const e of runTutorTurn({ db, client, map, learnerId: me }, "What is a basis point?")) events.push(e);
    })();
    while (!texts(events).join("").includes("percentage point.")) await new Promise((r) => setTimeout(r, 5));
    // The model has not finished: the turn has sent the first sentence, and nothing has ended.
    expect(texts(events).join("")).toBe("A basis point is one hundredth of a percentage point. ");
    expect(events.some((e) => e.type === "done")).toBe(false);
    release();
    await running;
    expect(texts(events).join("")).toBe("A basis point is one hundredth of a percentage point. Traders use it for small moves.");
    expect(texts(events).length).toBeGreaterThan(1);
  });

  it("a step-led turn (a Choice pressed) is still held: nothing shows until the whole reply is checked", async () => {
    const db = await testDb();
    await atYourTurn(db);
    let release: () => void = () => {};
    const writing = new Promise<void>((r) => (release = r));
    const { client, requests } = scriptedClient([{ content: [{ type: "text", text: "A basis point is one hundredth of a percentage point. " }, { type: "text", text: "Traders use it." }], holdAfterFirstText: writing }], { deltaChars: 7 });
    const events: TurnEvent[] = [];
    const running = (async () => {
      for await (const e of runTutorTurn({ db, client, map, learnerId: me }, "Show me.")) events.push(e);
    })();
    while (requests.length < 1) await new Promise((r) => setTimeout(r, 5));
    await new Promise((r) => setTimeout(r, 50));
    expect(texts(events)).toEqual([]);
    release();
    await running;
    expect(texts(events)).toEqual(["A basis point is one hundredth of a percentage point. Traders use it."]);
  });

  it("measures word count, a second question and the currency after the reply, recorded with no retry, and shows the reply as written", async () => {
    const db = await testDb();
    await atYourTurn(db);
    // Over the 120 words an own question is told, two questions, and dollars in a rupee Topic: three soft slips.
    const reply = `${"A basis point is one hundredth of a percentage point, and traders count small moves with it. ".repeat(8)}Why so small? Who uses it? Say $100 moved.`;
    const { events, requests } = await turn(db, "Why are basis points so small?", [say(reply)], { deltaChars: 11 });
    expect(requests).toHaveLength(1);
    expect(texts(events).join("")).toBe(reply);
    const record = await lastRecord(db);
    expect(record).toMatchObject({ retried: false, fallback: false, correction: null });
    expect(record.draftProblems.map((p) => p.rule)).toEqual(expect.arrayContaining(["V1", "V2", "V7"]));
    expect(record.shownText).toBe(reply);
  });

  it("under the reply, shows the open Quick try again: the same try, after the text and before the Choices", async () => {
    const db = await testDb();
    const sessionId = await atYourTurn(db);
    const [open] = await openTries(db, sessionId);
    const { events } = await turn(db, "What is a basis point?", [say(ANSWER)]);
    const kinds = events.map((e) => (e.type === "item" ? e.item.kind : e.type));
    const again = kinds.indexOf(QUICK_TRY);
    expect(again).toBeGreaterThan(kinds.lastIndexOf("text"));
    expect(again).toBeLessThan(kinds.indexOf(REPLY_CHOICES));
    expect((events[again] as Extract<TurnEvent, { type: "item" }>).item.data).toEqual(open);
    // After five own questions in a row the open try sits under the latest reply (spec A5, "Done when").
    for (const q of ["Why?", "Who uses it?", "Since when?", "Is it the same as a percent?", "And in India?"]) await turn(db, q, [say(ANSWER)]);
    const thread = await loadThread(db, sessionId, map, me);
    const lastReply = thread.findLastIndex((l) => l.role === "assistant");
    expect(thread.slice(lastReply + 1).some((l) => l.role === "item" && l.kind === QUICK_TRY && (l.data as QuickTryData).key === open.key)).toBe(true);
  });

  it("sends no Checking label: the reply is not held for checks", async () => {
    const db = await testDb();
    await atYourTurn(db);
    const progress: ProgressEvent[] = [];
    await turn(db, "What is a basis point?", [say(ANSWER)], {}, { notify: (e) => progress.push(e) });
    expect(progress.map((p) => p.label)).not.toContain(CHECKING_LABEL);
  });
});

describe("the stream guard in a turn (A5)", () => {
  it("stops before a sentence holding an internal word: it never shows or is stored, the runner stops, and the line follows", async () => {
    const db = await testDb();
    const sessionId = await atYourTurn(db);
    const calc = { type: "tool_use", id: "toolu_never", name: "calculate", input: { calculator: "emi", inputs: { principal: 100000, ratePercent: 8, years: 5 } } };
    const { events, requests } = await turn(db, "Where am I in the Topic?", [{ content: [{ type: "text", text: "You are practising basis points. This is the your_turn step of the Topic. More to come." }, calc] }, say("Never asked.")], {
      deltaChars: 9,
    });
    expect(texts(events).join("")).toBe(`You are practising basis points. \n\n${OWN_QUESTION_FALLBACK}`);
    expect(JSON.stringify(events)).not.toContain("your_turn");
    // The stream stopped: the step was never stored, its tool call never ran, and no second request was made.
    expect(requests).toHaveLength(1);
    const stored = (await db.select().from(messages).where(eq(messages.sessionId, sessionId))).filter((m) => m.role === "assistant");
    expect(JSON.stringify(stored)).not.toContain("your_turn");
    expect(JSON.stringify(stored)).not.toContain("toolu_never");
    expect((await lastRecord(db)).draftProblems).toEqual([expect.objectContaining({ rule: "guard", message: expect.stringContaining("internal_word") })]);
    // The next turn runs on a valid history.
    const next = await turn(db, "Thanks", [say("Glad to help.")]);
    expect(doneOf(next.events)).toMatchObject({ type: "done", stopReason: "end_turn" });
  });
});

describe("a streamed reply cut off and resumed", () => {
  it("shows its stored text again once, and streams on after it: no text twice, and a reload reads the same", async () => {
    const db = await testDb();
    const sessionId = await atYourTurn(db);
    const calc = { type: "tool_use", id: "toolu_emi", name: "calculate", input: { calculator: "emi", inputs: { principal: 100000, ratePercent: 8, years: 5 } } };
    const first = await turn(db, "What would a loan cost?", [{ content: [{ type: "text", text: "Let me work it out. " }, calc] }, { ...say("Lost."), delayMs: 400 }], {}, { timeBudgetMs: 150 });
    expect(texts(first.events).join("")).toBe("Let me work it out. ");
    expect(first.events.at(-1)).toEqual({ type: "cut_off" });

    const resumed = await turn(db, { resume: true }, [say("About ₹2,028 a month.")]);
    // What the browser does with the events: a replay replaces the reply's text, and each text event adds to it.
    let screen = "";
    for (const e of resumed.events) {
      if (e.type === "replay") screen = e.text;
      if (e.type === "text") screen += e.text;
    }
    expect(resumed.events[0]).toMatchObject({ type: "replay", text: expect.stringContaining("Let me work it out.") });
    expect(screen.match(/Let me work it out/g)).toHaveLength(1);
    expect(screen).toContain("About ₹2,028 a month.");
    const thread = await loadThread(db, sessionId, map, me);
    const reloaded = thread.findLast((l) => l.role === "assistant");
    expect(reloaded && "text" in reloaded ? reloaded.text : undefined).toBe(screen);
  });
});

describe("Stop during a streamed reply", () => {
  it("keeps ADR 0008's rule: the reply in progress is dropped, the Learner's message stays, marked Stopped", async () => {
    const db = await testDb();
    const sessionId = await atYourTurn(db);
    const never = new Promise<never>(() => {});
    const { client, requests } = scriptedClient([{ content: [{ type: "text", text: "A basis point is small. " }, { type: "text", text: "More." }], holdAfterFirstText: never }]);
    const events: TurnEvent[] = [];
    const running = (async () => {
      for await (const e of runTutorTurn({ db, client, map, learnerId: me }, "What is a basis point?")) events.push(e);
    })();
    while (requests.length < 1 || !texts(events).length) await new Promise((r) => setTimeout(r, 5));
    await requestStop(db, me);
    await running;
    expect(events.map((e) => e.type).slice(-2)).toEqual(["stopped", "done"]);
    const thread = await loadThread(db, sessionId, map, me);
    expect(thread.at(-1)).toMatchObject({ role: "item" });
    expect(thread.findLast((l) => l.role === "user")).toMatchObject({ text: "What is a basis point?" });
    expect(thread.findLastIndex((l) => l.role === "assistant")).toBeLessThan(thread.findLastIndex((l) => l.role === "user"));
    const [row] = await db.select().from(turns).orderBy(desc(turns.id)).limit(1);
    expect(row.stopReason).toBe("stopped");
  });
});
