import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Db } from "@/db/types";
import { messages, OWNER_LEARNER_ID, replyChecks, settings, turns } from "@/db/schema";
import { saveFinishedStep } from "@/learner/memory";
import { presentValueOnly } from "@/test/present-value-map";
import { testDb } from "@/test/pglite";
import { scriptedClient, type ScriptedReply } from "@/test/scripted-client";
import { WIDGET_OPENED } from "@/course/written-ahead";
import { WIDGET_SHOWN } from "@/widgets/shown-widget";
import { countWords, splitAsk } from "./reply-checks";
import { CHECKING_LABEL, FENCE_IN_ENGINE, REPLY_CHECK_PREFIX, toolWidgets } from "./reply-gate";
import { loadSessionItems } from "./session-items";
import { STOPPED } from "./session-item-kinds";
import { loadCurrentSession } from "./transcript";
import { runTutorTurn, type TurnDeps, type TurnEvent, type TurnInput } from "./turn";
import { requestStop } from "./turn-status";
import type { ProgressEvent } from "./tools";

/**
 * Seam 1, Tutor Turn: replies checked before the Learner sees them (spec #229, ticket #239, ADR 0008). The scripted
 * client stands in for the model; the Learner stands at the concept step, whose word limit is 80.
 */

const map = presentValueOnly({ withoutInsight: true });
const say = (text: string): ScriptedReply => ({ content: [{ type: "text", text }] });
const texts = (events: TurnEvent[]) => events.filter((e): e is Extract<TurnEvent, { type: "text" }> => e.type === "text");

/** About 150 words of plain prose, then one ask: fails only V1 at an 80-word step. */
const LONG = `${"Money today is worth more than money later. ".repeat(19).trim()}\nWhich would you pick?`;
const SHORT = "Money today is worth more than money later, because you can use it now.\nWhich would you pick, money today or later?";

async function run(db: Db, replies: ScriptedReply[], input: TurnInput = "Explain it again", extra: Partial<TurnDeps> = {}) {
  const { client, requests } = scriptedClient(replies);
  const events: TurnEvent[] = [];
  for await (const e of runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID, ...extra }, input)) events.push(e);
  return { events, requests };
}

/** A Learner at the concept step, after a first turn that told the story. */
async function atConcept(db: Db) {
  await run(db, [say("Once, a lottery winner had a choice.")], "Hi");
  await saveFinishedStep(db, map, "story", new Date(), OWNER_LEARNER_ID);
}

const records = (db: Db) => db.select().from(replyChecks).orderBy(replyChecks.turnSeq);

describe("a reply checked before the Learner sees it", () => {
  it("gives a 150-word draft at concept exactly one retry, ending with the correction, and shows only the passing reply as one text", async () => {
    const db = await testDb();
    await atConcept(db);
    const progress: ProgressEvent[] = [];
    const { events, requests } = await run(db, [say(LONG), say(SHORT)], "Explain it again", { notify: (e) => progress.push(e) });
    expect(requests).toHaveLength(2);
    const correction = String(requests[1].messages.at(-1)!.content);
    expect(correction.startsWith(REPLY_CHECK_PREFIX)).toBe(true);
    expect(correction).toMatch(/The limit is 80/);
    expect(correction).toMatch(/Write the whole reply again within 80 words/);
    expect(texts(events)).toEqual([{ type: "text", text: SHORT }]);
    expect(progress.map((p) => p.label)).toContain(CHECKING_LABEL);
    expect(events.at(-1)).toMatchObject({ type: "done", usage: { replyCheck: { failed: ["V1"], retried: true, fallback: false } } });
    // A reload shows what the Learner saw.
    expect((await loadCurrentSession(db, map, OWNER_LEARNER_ID)).at(-1)).toMatchObject({ role: "assistant", text: SHORT });
  });

  it("shows the fallback when the retry fails too, with nothing over the cap, and stores it as the turn's final text", async () => {
    const db = await testDb();
    await atConcept(db);
    const { events, requests } = await run(db, [say(LONG), say(LONG)]);
    expect(requests).toHaveLength(2);
    const [shown] = texts(events);
    expect(countWords(shown.text)).toBeLessThanOrEqual(80);
    expect(shown.text.endsWith("Which would you pick?")).toBe(true);
    expect((await loadCurrentSession(db, map, OWNER_LEARNER_ID)).at(-1)).toMatchObject({ role: "assistant", text: shown.text });
    const [, record] = await records(db);
    expect(record).toMatchObject({ retried: true, fallback: true, shownText: shown.text });
  });

  it("after a failed V8 retry, shows a fallback with no ask line: the sum it asked is dropped", async () => {
    const db = await testDb();
    await atConcept(db);
    const SUM = "Money today is worth more than money later.\nWhat would ₹1 lakh be worth after 10 years?";
    const { events, requests } = await run(db, [say(SUM), say(SUM)]);
    expect(requests).toHaveLength(2);
    expect(String(requests[1].messages.at(-1)!.content)).toContain("Your reply asks the Learner to work out a sum");
    const [shown] = texts(events);
    expect(shown.text).toBe("Money today is worth more than money later.");
    expect(splitAsk(shown.text).ask).toBeNull();
    expect(events.at(-1)).toMatchObject({ type: "done", usage: { replyCheck: { failed: ["V8"], retried: true, fallback: true } } });
  });

  it("goes straight to the fallback when the draft fails after the time limit", async () => {
    const db = await testDb();
    await atConcept(db);
    const { events, requests } = await run(db, [say(LONG)], "Explain it again", { retryWithinMs: 0 });
    expect(requests).toHaveLength(1);
    expect(countWords(texts(events)[0].text)).toBeLessThanOrEqual(80);
    expect(events.at(-1)).toMatchObject({ type: "done", usage: { replyCheck: { retried: false, fallback: true } } });
  });

  it("fixes emoji, an arrow and a heading with no retry", async () => {
    const db = await testDb();
    await atConcept(db);
    const { events, requests } = await run(db, [say("## Money now\nMoney today 🙂 beats money later.\n→ You can use it now.\nWhich would you pick?")]);
    expect(requests).toHaveLength(1);
    expect(texts(events)).toEqual([{ type: "text", text: "Money now\nMoney today beats money later.\nYou can use it now.\nWhich would you pick?" }]);
    expect((await loadCurrentSession(db, map, OWNER_LEARNER_ID)).at(-1)!.text).toBe("Money now\nMoney today beats money later.\nYou can use it now.\nWhich would you pick?");
  });

  it("sends no text when the Learner stops while the retry runs; their message stays and the turn is Stopped", async () => {
    const db = await testDb();
    await atConcept(db);
    const { client, requests } = scriptedClient([say(LONG), { ...say(SHORT), holdAfterFirstText: new Promise(() => {}) }]);
    const events: TurnEvent[] = [];
    const done = (async () => {
      for await (const e of runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Explain it again")) events.push(e);
    })();
    while (requests.length < 2) await new Promise((r) => setTimeout(r, 5));
    await requestStop(db, OWNER_LEARNER_ID);
    await done;
    expect(texts(events)).toEqual([]);
    expect(events.map((e) => e.type).slice(-2)).toEqual(["stopped", "done"]);
    const lines = await loadCurrentSession(db, map, OWNER_LEARNER_ID);
    expect(lines.at(-1)).toMatchObject({ role: "user", text: "Explain it again" });
    const [turn] = await db.select().from(turns).orderBy(sql`${turns.id} desc`).limit(1);
    expect(turn.stopReason).toBe("stopped");
    const sessionId = turn.sessionId!;
    expect((await loadSessionItems(db, sessionId, OWNER_LEARNER_ID)).map((i) => i.kind)).toContain(STOPPED);
  });

  it("leaves the rejected draft and its correction out of the next request, and the record keeps them with their reasons", async () => {
    const db = await testDb();
    await atConcept(db);
    await run(db, [say(LONG), say(SHORT)]);
    const { requests } = await run(db, [say("Yes, money today.\nWhat would you do with it?")], "I see");
    const sent = JSON.stringify(requests[0].messages);
    expect(sent).not.toContain("Money today is worth more than money later. Money today");
    expect(sent).not.toContain(REPLY_CHECK_PREFIX);
    expect(sent).toContain(SHORT.split("\n")[0]);
    const [, record] = await records(db);
    expect(record.draftProblems).toEqual([expect.objectContaining({ rule: "V1", message: expect.stringMatching(/The limit is 80/) })]);
    expect(record.correction).toMatch(/^Reply check by code:/);
    expect(record.retried).toBe(true);
    expect(record.rejectedSeqs.length).toBe(2);
    // The rows stay stored.
    const stored = await db.select().from(messages).where(eq(messages.sessionId, record.sessionId));
    expect(stored.some((m) => JSON.stringify(m.content).includes(REPLY_CHECK_PREFIX))).toBe(true);
  });

  it("checks a resumed draft that was stored but never checked before it shows", async () => {
    const db = await testDb();
    await atConcept(db);
    await run(db, [say("Short.")]);
    // As if the function died after the draft was stored, before it was checked.
    const [last] = await db.select().from(turns).orderBy(sql`${turns.id} desc`).limit(1);
    await db.delete(replyChecks);
    await db
      .update(messages)
      .set({ content: [{ type: "text", text: LONG }] })
      .where(and(eq(messages.sessionId, last.sessionId!), eq(messages.seq, last.turnSeq! + 2)));
    await db.update(turns).set({ status: "cut_off" }).where(eq(turns.id, last.id));
    const { events, requests } = await run(db, [say(SHORT)], { resume: true });
    expect(requests).toHaveLength(1);
    expect(events[0]).toEqual({ type: "replay", text: "" });
    expect(texts(events).map((e) => e.text)).toEqual([SHORT]);
  });

  it("a resumed cited reply keeps its markers and its sources line", async () => {
    const db = await testDb();
    const cite = (source: string, title: string) => ({ type: "search_result_location", source, title, cited_text: "x", search_result_index: 0, start_block_index: 1, end_block_index: 2 });
    await run(db, [{ content: [{ type: "text", text: "Money today", citations: [cite("/passages/7", "Bonds")] }, { type: "text", text: " is worth more." }] }], "Hi");
    const [last] = await db.select().from(turns).orderBy(sql`${turns.id} desc`).limit(1);
    const live = (await loadCurrentSession(db, map, OWNER_LEARNER_ID)).at(-1)!.text;
    expect(live).toContain("[1](/passages/7?blocks=1-2)");
    await db.delete(replyChecks);
    await db.update(turns).set({ status: "cut_off" }).where(eq(turns.id, last.id));
    const { events } = await run(db, [], { resume: true });
    expect(texts(events)).toEqual([{ type: "text", text: live }]);
    expect(live).toMatch(/Bonds/);
  });

  it("in an engine Session, sends a reply with an openui-lang fence back for the retry (V4)", async () => {
    const db = await testDb();
    await db.insert(settings).values({ key: "widget_engine", value: "on" }).onConflictDoUpdate({ target: settings.key, set: { value: "on" } });
    await atConcept(db);
    const fence = "```openui-lang\nroot = Widget(\"PV\", [])\n```";
    const { events, requests } = await run(db, [say(`Here it is.\n${fence}\nWhat do you see?`), say(SHORT)]);
    expect(requests).toHaveLength(2);
    expect(String(requests[1].messages.at(-1)!.content)).toContain(FENCE_IN_ENGINE);
    expect(texts(events)).toEqual([{ type: "text", text: SHORT }]);
  });

  it("with the reply_checks table missing, a turn still runs and shows its reply", async () => {
    const db = await testDb();
    await atConcept(db);
    await db.execute(sql`drop table reply_checks`);
    const { events } = await run(db, [say(LONG), say(SHORT)]);
    expect(texts(events)).toEqual([{ type: "text", text: SHORT }]);
    expect(events.at(-1)).toMatchObject({ type: "done", stopReason: "end_turn" });
    expect((await loadCurrentSession(db, map, OWNER_LEARNER_ID)).at(-1)).toMatchObject({ role: "assistant" });
  });
});

describe("the draft's Widgets", () => {
  const rows = [
    { seq: 4, role: "assistant", content: [{ type: "tool_use", id: "toolu_show", name: "show_widget", input: {} }, { type: "tool_use", id: "toolu_open", name: "open_widget", input: { id: "pv-slider" } }] },
  ];
  it("are only those the draft's own show_widget and open_widget calls stored; a Widget code stored never counts", () => {
    const items = [
      // A step's own Widget, stored by code with the turn: no tool call of the draft's stored it.
      { afterSeq: 3, kind: WIDGET_SHOWN, data: { id: "step-widget", recipe: "present_value", params: { rate: 5 }, title: "Step", code: "x" } },
      { afterSeq: 4, kind: WIDGET_SHOWN, data: { id: "toolu_show", recipe: "rate_move", params: { from: 4 }, title: "Rates", code: "x" } },
      { afterSeq: 5, kind: WIDGET_OPENED, data: { id: "pv-slider", title: "PV" } },
    ];
    expect(toolWidgets(rows, 3, items)).toEqual([
      { kind: "recipe", id: "rate_move", params: { from: 4 } },
      { kind: "written", id: "pv-slider" },
    ]);
  });
});
