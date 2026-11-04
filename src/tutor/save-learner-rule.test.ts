import { asc } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { convertedTopic, CONVERTED_TOPIC_DATA, topicFileOf } from "@/course/lesson-fixture";
import { parseCourseMap } from "@/course/map";
import { noteItems, OWNER_LEARNER_ID, sessions } from "@/db/schema";
import { loadNotes, removeLine } from "@/learner/notes";
import { ownRules } from "@/learner/own-rule";
import { recordAnswer } from "@/learner/skill-state";
import { presentValueOnly } from "@/test/present-value-map";
import { testDb } from "@/test/pglite";
import { scriptedClient, type ScriptedReply } from "@/test/scripted-client";
import { OWN_RULE_SAVED, savedRuleOf } from "./own-rule-item";
import { loadSessionItems } from "./session-items";
import { runTutorTurn, type TurnEvent, type TurnInput } from "./turn";

/**
 * save_learner_rule (spec #229, "The Learner's own words"): code keeps the Learner's own rule on their Topic Note, only
 * from words they typed, once per turn, and in a converted Topic only right after a right practice answer.
 */

const RULE_MESSAGE = "so its basically change × 100 then divide by original";
const RULE_WORDS = "change × 100 then divide by original";

const map = presentValueOnly({ withoutQuiz: true });
const topicId = "present-value";

const converted = parseCourseMap([topicFileOf(CONVERTED_TOPIC_DATA)]).map!;
const convertedId = convertedTopic().id;

const save = (id: string, words: string) => ({ content: [{ type: "tool_use", id, name: "save_learner_rule", input: { learner_words: words } }] });
const say = (text: string): ScriptedReply => ({ content: [{ type: "text", text }] });

type Db = Awaited<ReturnType<typeof testDb>>;
type Request = ReturnType<typeof scriptedClient>["requests"][number];
const toolResults = (request: Request) =>
  request.messages.flatMap((m) =>
    Array.isArray(m.content) ? (m.content as { type: string; tool_use_id?: string; is_error?: boolean; content?: unknown }[]).filter((b) => b.type === "tool_result") : [],
  );

/** The result of the turn's last tool call: the final request holds every earlier turn's results too. */
const lastResult = (requests: Request[]) => toolResults(requests.at(-1)!).at(-1)!;

async function turn(db: Db, courseMap: typeof map, message: TurnInput, replies: ScriptedReply[]) {
  const { client, requests } = scriptedClient(replies);
  const events: TurnEvent[] = [];
  for await (const e of runTutorTurn({ db, client, map: courseMap, learnerId: OWNER_LEARNER_ID }, message)) events.push(e);
  return { requests, events };
}
const itemsOf = (events: TurnEvent[]) => events.flatMap((e) => (e.type === "item" ? [e.item] : []));
const ownItems = (events: TurnEvent[]) => itemsOf(events).filter((i) => i.kind === OWN_RULE_SAVED);
const notes = async (db: Db) => (await db.select().from(noteItems).orderBy(asc(noteItems.id))).filter((n) => n.kind === "own_rule");

describe("save_learner_rule in an unconverted Topic", () => {
  it("saves the Learner's words as typed, streams one item and tells the Tutor to confirm in one sentence", async () => {
    const db = await testDb();
    const { requests, events } = await turn(db, map, RULE_MESSAGE, [save("r1", RULE_WORDS), say("Yes, that is it.")]);
    const rows = await notes(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ topicId, kind: "own_rule", text: RULE_WORDS, learnerId: OWNER_LEARNER_ID });
    expect(rows[0].sessionId).not.toBeNull();
    expect(rows[0].turnSeq).not.toBeNull();

    const own = ownItems(events);
    expect(own).toHaveLength(1);
    expect(own[0].data).toEqual({ noteId: rows[0].id, topicId, text: RULE_WORDS, skillId: null });
    expect(savedRuleOf(itemsOf(events))).toBe(RULE_WORDS);

    const result = lastResult(requests);
    expect(result.is_error).not.toBe(true);
    expect(result.content).toContain(`Saved by code to the Learner's Topic Note: "${RULE_WORDS}".`);
    expect(result.content).toContain("Confirm their rule in one sentence");
    expect(result.content).toContain("don't say you saved it");

    // The item is stored in the Session, after the Learner's message, and never sent to the model.
    const [session] = await db.select().from(sessions);
    const stored = await loadSessionItems(db, session.id, OWNER_LEARNER_ID);
    expect(stored.filter((i) => i.kind === OWN_RULE_SAVED)).toHaveLength(1);
    expect(JSON.stringify(requests.map((r) => r.messages))).not.toContain(OWN_RULE_SAVED);
  });

  it("refuses a second call in the same turn", async () => {
    const db = await testDb();
    const { requests, events } = await turn(db, map, RULE_MESSAGE, [save("r1", RULE_WORDS), save("r2", "change × 100"), say("Yes.")]);
    expect(toolResults(requests[2]).find((r) => r.tool_use_id === "r2")).toMatchObject({ is_error: true });
    expect(toolResults(requests[2]).find((r) => r.tool_use_id === "r2")!.content).toContain("Not saved");
    expect(await notes(db)).toHaveLength(1);
    expect(ownItems(events)).toHaveLength(1);
  });

  it("refuses words that are not in the Learner's message", async () => {
    const db = await testDb();
    const { requests } = await turn(db, map, RULE_MESSAGE, [save("r1", "multiply by 100 and divide"), say("Hm.")]);
    const result = lastResult(requests);
    expect(result.is_error).toBe(true);
    expect(result.content).toContain("Not saved");
    expect(await notes(db)).toHaveLength(0);
  });

  it("refuses words over 300 characters", async () => {
    const db = await testDb();
    const long = `the rule is ${"change times a hundred then divide by the original ".repeat(8)}`.trim();
    expect(long.length).toBeGreaterThan(300);
    const { requests } = await turn(db, map, long, [save("r1", long), say("Hm.")]);
    expect(lastResult(requests).is_error).toBe(true);
    expect(await notes(db)).toHaveLength(0);
  });

  it("refuses a chip, a note code wrote and a word-for-word Continue", async () => {
    const db = await testDb();
    const chip = await turn(db, map, "Go deeper.", [save("c1", "Go deeper"), say("Ok.")]);
    expect(lastResult(chip.requests).is_error).toBe(true);
    const next = await turn(await testDb(), map, { opener: true }, [save("n1", "Opener by code"), say("Ok.")]);
    expect(lastResult(next.requests).is_error).toBe(true);
    expect(await notes(db)).toHaveLength(0);
  });

  it("saves one rule per Topic: a second turn is refused, and an Undo does not free the slot", async () => {
    const db = await testDb();
    await turn(db, map, RULE_MESSAGE, [save("r1", RULE_WORDS), say("Yes.")]);
    const [first] = await notes(db);
    const second = await turn(db, map, "and the old rate is the bottom of the fraction", [save("r2", "the old rate is the bottom of the fraction"), say("Yes.")]);
    expect(lastResult(second.requests).is_error).toBe(true);
    expect(await notes(db)).toHaveLength(1);

    // Undo (the Notes page's delete) takes the rule off the note.
    expect((await loadNotes(db, map, OWNER_LEARNER_ID)).find((n) => n.topicId === topicId)!.lines.map((l) => l.text)).toEqual([RULE_WORDS]);
    expect(await removeLine(db, first.id, OWNER_LEARNER_ID)).toBe(true);
    expect((await loadNotes(db, map, OWNER_LEARNER_ID)).find((n) => n.topicId === topicId)!.lines).toEqual([]);
    expect(await ownRules(db, OWNER_LEARNER_ID)).toEqual([]);

    // The slot stays used: the Learner who took a rule off is not offered it again.
    const third = await turn(db, map, "so its change × 100 over the start", [save("r3", "change × 100 over the start"), say("Yes.")]);
    expect(lastResult(third.requests).is_error).toBe(true);
    expect(await notes(db)).toHaveLength(0);
  });
});

describe("save_learner_rule in a converted Topic", () => {
  const start = async () => {
    const db = await testDb();
    // A first turn makes the Session; its start is the "previous turn" later answers are measured against.
    await turn(db, converted, "hello", [say("Hi.")]);
    const [session] = await db.select().from(sessions);
    return { db, sessionId: session.id };
  };
  let n = 0;
  const answer = (db: Db, sessionId: number, skillId: string, verdict: "right" | "wrong", offsetMs: number) =>
    recordAnswer(
      db,
      { learnerId: OWNER_LEARNER_ID, topicId: convertedId, skillId, sessionId, itemKey: `k-${++n}`, itemId: "x", input: "60", verdict, source: "quick_try" },
      new Date(Date.now() + offsetMs),
    );

  it("refuses with no practice answer, and with a wrong one", async () => {
    const { db, sessionId } = await start();
    const none = await turn(db, converted, RULE_MESSAGE, [save("r1", RULE_WORDS), say("Ok.")]);
    expect(lastResult(none.requests).is_error).toBe(true);
    await answer(db, sessionId, "pts-to-bp", "wrong", 5000);
    const wrong = await turn(db, converted, "so its change × 100 over the start", [save("r2", "change × 100 over the start"), say("Ok.")]);
    expect(lastResult(wrong.requests).is_error).toBe(true);
    expect(await notes(db)).toHaveLength(0);
  });

  it("refuses a right answer recorded before the previous turn began", async () => {
    const { db, sessionId } = await start();
    await answer(db, sessionId, "pts-to-bp", "right", -3_600_000);
    const old = await turn(db, converted, RULE_MESSAGE, [save("r1", RULE_WORDS), say("Ok.")]);
    expect(lastResult(old.requests).is_error).toBe(true);
  });

  it("saves right after a right answer, with that answer's Skill; one rule per Skill, another Skill after a right answer there", async () => {
    const { db, sessionId } = await start();
    await answer(db, sessionId, "pts-to-bp", "right", 5000);
    const saved = await turn(db, converted, RULE_MESSAGE, [save("r1", RULE_WORDS), say("Yes.")]);
    expect(lastResult(saved.requests).is_error).not.toBe(true);
    expect(ownItems(saved.events)[0].data).toMatchObject({ topicId: convertedId, text: RULE_WORDS, skillId: "pts-to-bp" });
    expect(await ownRules(db, OWNER_LEARNER_ID, convertedId)).toMatchObject([{ text: RULE_WORDS, skillId: "pts-to-bp" }]);

    // A second right answer on the same Skill: the save is refused.
    await answer(db, sessionId, "pts-to-bp", "right", 20_000);
    const again = await turn(db, converted, "points times 100 is basis points", [save("r2", "points times 100 is basis points"), say("Yes.")]);
    expect(lastResult(again.requests).is_error).toBe(true);
    expect(lastResult(again.requests).content).toContain("this Skill");

    // A right answer on another Skill: allowed.
    await answer(db, sessionId, "bp-to-pts", "right", 40_000);
    const other = await turn(db, converted, "bp over 100 is points", [save("r3", "bp over 100 is points"), say("Yes.")]);
    expect(lastResult(other.requests).is_error).not.toBe(true);
    expect((await ownRules(db, OWNER_LEARNER_ID, convertedId)).map((r) => r.skillId)).toEqual(["pts-to-bp", "bp-to-pts"]);
  });
});
