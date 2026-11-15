import { APIError } from "openai";
import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { learners, messages, OWNER_LEARNER_ID, sessions, turns, tutorIncidents } from "@/db/schema";
import type { Db } from "@/db/types";
import { saveFinishedStep } from "@/learner/memory";
import { presentValueOnly } from "@/test/present-value-map";
import { testDb } from "@/test/pglite";
import { replayRefusal, scriptedClient, type ScriptedOptions, type ScriptedReply } from "@/test/scripted-client";
import { incidentCount } from "./incidents";
import { TUTOR_MODEL, type Message } from "./model";
import { isReplayRefusal, REPLAY_STRIPPED, withoutReplay } from "./replay-heal";
import { withoutRejected } from "./session-log";
import { runTutorTurn, type TurnEvent, type TurnInput } from "./turn";

/**
 * What was sent stays sent, and a Session heals itself (spec 2026-11-12, A1 and A2), on OpenAI (ADR 0007).
 * Every scripted step returns a reasoning item in its raw output (`replay`), and the double plays the API's replay
 * check: a reasoning item from an edited step, or one in the current turn whose turn no longer reads as it did, is
 * refused with the API's 400, so a code change that edits history without dropping raw output fails here, in CI.
 */

const map = presentValueOnly({ withoutInsight: true });
const say = (text: string): ScriptedReply => ({ content: [{ type: "text", text }] });
const texts = (events: TurnEvent[]) => events.filter((e): e is Extract<TurnEvent, { type: "text" }> => e.type === "text").map((e) => e.text);
type Sent = { role: string; content?: unknown };
const blocks = (m: Sent | undefined) => (Array.isArray(m?.content) ? (m.content as { type?: string; text?: string; id?: string; items?: unknown[] }[]) : []);
const replays = (m: Sent | undefined) => blocks(m).some((b) => b.type === "replay");
const saying = (sent: Sent[], words: string) => sent.find((m) => m.role === "assistant" && blocks(m).some((b) => b.type === "text" && b.text?.includes(words)));

/** About 150 words, then one ask: fails only V1 at the 80-word concept step. */
const LONG = `${"Money today is worth more than money later. ".repeat(19).trim()}\nWhich would you pick?`;
const SHORT = "Money today is worth more than money later, because you can use it now.\nWhich would you pick, money today or later?";
const reply = (word: string) => say(`Yes, money today, and ${word} reason is that you can spend it.\nWhat would you do with it?`);

/** The Show me Choice's words: a step-led turn, whose reply is held and checked, so a draft can be rejected (a typed question streams, A5). */
const STEP_LED = "Show me.";

async function run(db: Db, replies: ScriptedReply[], input: TurnInput = STEP_LED, o: ScriptedOptions = {}) {
  const { client, requests } = scriptedClient(replies, o);
  const events: TurnEvent[] = [];
  for await (const e of runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, input)) events.push(e);
  return { events, requests };
}

/** A Learner at the concept step, after a first turn that told the story. */
async function atConcept(db: Db) {
  await run(db, [say("Once, a lottery winner had a choice.")], "Hi");
  await saveFinishedStep(db, map, "story", new Date(), OWNER_LEARNER_ID);
}

/** The API's 400 for replayed encrypted reasoning it cannot verify, as the SDK throws it. */
function unverified(requestId: string, item = "rs_0a1b2c"): APIError {
  const message = `The encrypted content for item ${item} could not be verified.`;
  return APIError.generate(400, { error: { message, type: "invalid_request_error", param: "input[3]", code: "invalid_encrypted_content" } }, message, new Headers({ "x-request-id": requestId }));
}

const latest = async (db: Db) => (await db.select().from(turns).orderBy(sql`${turns.id} desc`).limit(1))[0];
const incidents = (db: Db) => db.select().from(tutorIncidents).orderBy(tutorIncidents.id);

describe("the replay-checking test double", () => {
  const ask = async (client: ReturnType<typeof scriptedClient>["client"], sent: Message[]) =>
    (await client.step({ model: TUTOR_MODEL, effort: "medium", instructions: "S", tools: [], messages: sent, maxOutputTokens: 100 }).final()).content;
  const edit = (m: Message, text: string): Message => ({ ...m, content: (m.content as { type: string }[]).map((b) => (b.type === "text" ? { ...b, text } : b)) as Message["content"] });

  it("passes an unchanged history, and one whose edited step lost its raw output", async () => {
    const { client } = scriptedClient(["A.", "B.", "C.", "D."].map(say));
    const h1: Message[] = [{ role: "user", content: "Hi" }, { role: "assistant", content: await ask(client, [{ role: "user", content: "Hi" }]) }, { role: "user", content: "Why?" }];
    const h2: Message[] = [...h1, { role: "assistant", content: await ask(client, h1) }, { role: "user", content: "And?" }];
    expect(replays(h2[1])).toBe(true);
    await ask(client, h2);
    await ask(client, withoutReplay(h2.map((m, i) => (i === 1 ? edit(m, "Edited.") : m))));
  });

  it("refuses an edited step that kept its raw output, with the API's 400 and a request id", async () => {
    const { client } = scriptedClient(["A.", "B."].map(say));
    const h1: Message[] = [{ role: "user", content: "Hi" }, { role: "assistant", content: await ask(client, [{ role: "user", content: "Hi" }]) }, { role: "user", content: "Why?" }];
    const refused = replayRefusal(h1.map((m, i) => (i === 1 ? edit(m, "Edited.") : m)));
    expect(refused).toMatchObject({ status: 400, code: "invalid_encrypted_content", type: "invalid_request_error", requestID: expect.stringMatching(/^req_/) });
    expect(refused?.message).toMatch(/^400 The encrypted content for item rs_\S+ could not be verified\.$/);
    expect(isReplayRefusal(refused)).toBe(true);
  });

  it("refuses reasoning in the current turn whose turn no longer reads as it did, but not an edit in an earlier turn (current_turn)", async () => {
    const { client } = scriptedClient(["A.", "B.", "C."].map(say));
    const turn1: Message[] = [{ role: "user", content: "Hi" }];
    const a = { role: "assistant", content: await ask(client, turn1) } as Message;
    // In the current turn: a step written after a code note, then the note left out.
    const turn2: Message[] = [...turn1, a, { role: "user", content: "Why?" }, { role: "system", content: "A note." }];
    const b = { role: "assistant", content: await ask(client, turn2) } as Message;
    const without: Message[] = [...turn1, a, { role: "user", content: "Why?" }, b];
    expect(replayRefusal(without)).toMatchObject({ status: 400, code: "invalid_encrypted_content" });
    // In an earlier turn, the same edit goes unseen: the model does not read that reasoning.
    expect(replayRefusal([...without, { role: "user", content: "And?" }])).toBeNull();
  });

  it("refuses raw output that ends in a reasoning item, and an item id sent twice", () => {
    const step = (items: unknown[]): Message => ({ role: "assistant", content: [{ type: "text", text: "A." }, { type: "replay", items }] });
    const cut = replayRefusal([{ role: "user", content: "Hi" }, step([{ type: "reasoning", id: "rs_1", summary: [] }]), { role: "user", content: "Why?" }]);
    expect(cut?.message).toContain("Item 'rs_1' of type 'reasoning' was provided without its required following item.");
    expect(isReplayRefusal(cut)).toBe(true);
    const msg = { type: "message", id: "msg_1", role: "assistant", content: [{ type: "output_text", text: "A." }] };
    const twice = replayRefusal([{ role: "user", content: "Hi" }, step([msg]), { role: "user", content: "Why?" }, step([msg])]);
    expect(twice?.message).toContain("Duplicate item found with id msg_1");
  });
});

describe("what was sent stays sent (A1)", () => {
  it("after a rejected draft and an accepted retry, the compaction and the next three turns each go through", async () => {
    const db = await testDb();
    await atConcept(db);
    const retried = await run(db, [say(LONG), say(SHORT)]);
    expect(retried.requests).toHaveLength(2);
    expect(texts(retried.events)).toEqual([SHORT]);

    const later = [];
    for (const word of ["one", "another", "a third"]) {
      const next = await run(db, [reply(word)], `And ${word}?`);
      expect(next.events.at(-1)).toMatchObject({ type: "done", stopReason: "end_turn" });
      expect(texts(next.events).join("")).toContain(`and ${word} reason`);
      later.push(next);
    }
    // The retry is sent again without its raw output, which was written with the rejected draft and the correction
    // before it; the story's reply, in another turn, keeps its own.
    const sent = later[0].requests[0].messages;
    expect(replays(saying(sent, "Money today is worth more than money later, because"))).toBe(false);
    expect(replays(saying(sent, "Once, a lottery winner"))).toBe(true);
    // Turns after the edit keep theirs.
    expect(replays(saying(later[2].requests[0].messages, "and one reason"))).toBe(true);
    expect(await incidentCount(db, REPLAY_STRIPPED)).toBe(0);
    expect((await db.select().from(turns)).map((t) => t.status)).toEqual(["finished", "finished", "finished", "finished", "finished"]);
  });

  it("leaves out raw output only after the earliest rejected row of each turn, and only inside that turn", () => {
    const R = (n: number) => ({ type: "replay", items: [{ type: "reasoning", id: `rs_${n}` }] });
    const text = (t: string) => ({ type: "text", text: t });
    const rows = [
      { seq: 0, role: "user", content: "Hi" },
      { seq: 1, role: "assistant", content: [text("Story."), R(1)] },
      { seq: 2, role: "user", content: "Again" },
      { seq: 3, role: "assistant", content: [text("A long draft."), { type: "tool_use", id: "u1", name: "calculate", input: {} }, R(2)] },
      { seq: 4, role: "user", content: [{ type: "tool_result", tool_use_id: "u1", content: "42" }] },
      { seq: 5, role: "assistant", content: [text("More draft."), R(3)] },
      { seq: 6, role: "user", content: "Reply check by code: too long." },
      { seq: 7, role: "assistant", content: [text("The retry."), R(4)] },
      { seq: 8, role: "user", content: "Next" },
      { seq: 9, role: "assistant", content: [text("Next reply."), R(5)] },
    ];
    const kept = withoutRejected(rows, new Set([3, 5, 6]), [0, 2, 8]);
    expect(kept.map((r) => [r.seq, Array.isArray(r.content) ? r.content.map((b) => (b as { type: string }).type) : "text"])).toEqual([
      [0, "text"],
      [1, ["text", "replay"]],
      [2, "text"],
      // The rejected row with a call keeps the call, without its text or raw output.
      [3, ["tool_use"]],
      [4, ["tool_result"]],
      // Everything after it in the same turn loses its raw output.
      [7, ["text"]],
      [8, "text"],
      // Another turn's is untouched.
      [9, ["text", "replay"]],
    ]);
  });
});

describe("a Session heals itself (A2)", () => {
  it("a replay refusal is sent once more without raw output, gets a reply, moves the marker and records the incident", async () => {
    const db = await testDb();
    await atConcept(db);
    await run(db, [reply("one")], "I see");
    const healed = await run(db, [{ error: unverified("req_heal") }, reply("another")], "Go on");
    expect(healed.events.at(-1)).toMatchObject({ type: "done", stopReason: "end_turn" });
    expect(texts(healed.events).join("")).toContain("and another reason");
    expect(healed.requests).toHaveLength(2);
    expect(healed.requests[0].messages.some(replays)).toBe(true);
    expect(healed.requests[1].messages.some(replays)).toBe(false);
    const turn = await latest(db);
    expect(turn).toMatchObject({ status: "finished", error: null });
    const [session] = await db.select().from(sessions).where(eq(sessions.id, turn.sessionId!));
    expect(session.refrozenAtSeq).toBeGreaterThan(turn.turnSeq!);
    expect(await incidents(db)).toEqual([
      expect.objectContaining({
        kind: REPLAY_STRIPPED,
        learnerId: OWNER_LEARNER_ID,
        sessionId: session.id,
        turnId: turn.id,
        requestId: "req_heal",
        detail: expect.objectContaining({ at: "step", status: 400, turnSeq: turn.turnSeq }),
      }),
    ]);
    // The next turn sends the old history without raw output and needs no heal; the healed reply keeps its own.
    const next = await run(db, [reply("a third")], "And then?");
    expect(next.events.at(-1)).toMatchObject({ type: "done" });
    expect(next.requests).toHaveLength(1);
    expect(replays(saying(next.requests[0].messages, "lottery winner"))).toBe(false);
    expect(replays(saying(next.requests[0].messages, "and another reason"))).toBe(true);
    expect(await incidentCount(db, REPLAY_STRIPPED)).toBe(1);
  });

  it("a locked Session, whose stored step was edited but kept its raw output, gets a reply to its next message and stays healed", async () => {
    const db = await testDb();
    await atConcept(db);
    await run(db, [reply("one")], "Why?");
    // A step edited under its raw output, as a buggy filter would leave it: the API refuses every request from now on.
    const [step] = await db.select().from(messages).where(and(eq(messages.role, "assistant"), sql`${messages.content}::text like '%and one reason%'`));
    await db.update(messages).set({ content: JSON.parse(JSON.stringify(step.content).replace('"Yes, money today', '"Yes, money now')) }).where(eq(messages.id, step.id));

    const next = await run(db, [reply("a third")], "Go on");
    expect(next.events.at(-1)).toMatchObject({ type: "done", stopReason: "end_turn" });
    expect(texts(next.events).join("")).toContain("and a third reason");
    expect(next.requests).toHaveLength(2);
    const [incident] = await incidents(db);
    expect(incident).toMatchObject({ kind: REPLAY_STRIPPED, requestId: expect.stringMatching(/^req_/) });
    const after = await run(db, [reply("a fourth")], "More?");
    expect(after.events.at(-1)).toMatchObject({ type: "done" });
    expect(after.requests).toHaveLength(1);
    expect(await incidentCount(db, REPLAY_STRIPPED)).toBe(1);
  });

  it("a second refusal fails the turn in plain words, the provider's words stored for the Owner; Retry then works", async () => {
    const db = await testDb();
    await atConcept(db);
    await run(db, [reply("one")], "I see");
    const failed = await run(db, [{ error: unverified("req_first") }, { error: unverified("req_second") }], "Go on");
    expect(failed.events.at(-1)).toEqual({ type: "error", kind: "error", message: expect.stringMatching(/^Something went wrong on our side\. Everything so far is saved\. Press Retry\. Reference: [2-9A-Z]{6}$/) });
    expect(JSON.stringify(failed.events)).not.toMatch(/400|invalid_request_error|request_id/);
    const turn = await latest(db);
    expect(turn).toMatchObject({ status: "failed", providerRequestId: "req_second", providerStatus: 400, providerError: expect.stringContaining("could not be verified") });
    expect(failed.events.at(-1)).toMatchObject({ message: expect.stringContaining(`Reference: ${turn.failureRef}`) });
    expect(await incidentCount(db, REPLAY_STRIPPED)).toBe(1);

    const retried = await run(db, [reply("another")], { resume: true });
    expect(retried.events.at(-1)).toMatchObject({ type: "done" });
    expect(await latest(db)).toMatchObject({ status: "finished" });
  });

  it("sends the provider's words with the failure only to a Learner with Show developer details on", async () => {
    const db = await testDb();
    await atConcept(db);
    const off = await run(db, [{ error: new Error("boom") }], "Go on");
    expect(off.events.at(-1)).not.toHaveProperty("provider");
    await db.update(learners).set({ showDeveloperDetails: true }).where(eq(learners.id, OWNER_LEARNER_ID));
    const on = await run(db, [{ error: unverified("req_dev") }, { error: unverified("req_dev_2") }], { resume: true });
    expect(on.events.at(-1)).toMatchObject({ type: "error", provider: { requestId: "req_dev_2", status: 400, message: expect.stringContaining("could not be verified") } });
  });

  it("does not heal any other 400: it fails as usual, with no incident", async () => {
    const db = await testDb();
    await atConcept(db);
    const message = "Invalid schema for function 'calculate'.";
    const other = APIError.generate(400, { error: { message, type: "invalid_request_error", param: "tools[0]", code: "invalid_function_parameters" } }, message, new Headers());
    const failed = await run(db, [{ error: other }, reply("never")], "Go on");
    expect(failed.events.at(-1)).toMatchObject({ type: "error" });
    expect(failed.requests).toHaveLength(1);
    expect(await incidentCount(db, REPLAY_STRIPPED)).toBe(0);
  });

  it("with no tutor_incidents table, a heal still gives the reply", async () => {
    const db = await testDb();
    await atConcept(db);
    await db.execute(sql`DROP TABLE tutor_incidents`);
    const healed = await run(db, [{ error: unverified("req_no_table") }, reply("one")], "Go on");
    expect(healed.events.at(-1)).toMatchObject({ type: "done", stopReason: "end_turn" });
  });
});
