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
import { CHECKING_LABEL, FENCE_IN_ENGINE, rejectedRows, REPLY_CHECK_PREFIX, toolWidgets } from "./reply-gate";
import { withoutRejected } from "./session-log";
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

/**
 * A press of the Show me Choice: a step-led turn, held, checked and then shown (ADR 0008), whose fallback is the reply cut
 * to its cap. A message the Learner types is an own question, whose reply streams behind the stream guard instead (A5,
 * own-question-stream.test.ts), so the held gate is tested on step-led turns.
 */
const STEP_LED = "Show me.";

/** About 150 words of plain prose, then one ask: fails only V1 at an 80-word step. */
const LONG = `${"Money today is worth more than money later. ".repeat(19).trim()}\nWhich would you pick?`;
const SHORT = "Money today is worth more than money later, because you can use it now.\nWhich would you pick, money today or later?";

async function run(db: Db, replies: ScriptedReply[], input: TurnInput = STEP_LED, extra: Partial<TurnDeps> = {}) {
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

/** A tool call the draft makes: it runs, and its effects stand whatever happens to the draft's text. */
const EMI = { type: "tool_use", id: "toolu_draft_emi", name: "calculate", input: { calculator: "emi", inputs: { principal: 5_000_000, ratePercent: 8.5, years: 20 } } };

/**
 * A draft that calls a tool and runs long (V1 fails), then a retry still being written when the run's time is up: the
 * turn is cut off after the correction was stored and before anything of the retry was.
 */
const cutOffInRetry = (db: Db) =>
  run(db, [{ content: [{ type: "text", text: LONG }, EMI] }, say("That is the monthly payment."), { ...say(SHORT), delayMs: 2_500 }], STEP_LED, { timeBudgetMs: 2_000 });

/** Both ways, as OpenAI requires of a function call and its output: a tool_use needs its tool_result in the next message, and a tool_result its tool_use in the one before. */
function orphans(sent: { role: string; content?: unknown }[]): string[] {
  const blocks = (m: { content?: unknown } | undefined) => (Array.isArray(m?.content) ? (m.content as { type?: string; id?: string; tool_use_id?: string }[]) : []);
  return sent.flatMap((m, i) =>
    blocks(m).flatMap((b) => {
      if (b.type === "tool_use" && !blocks(sent[i + 1]).some((r) => r.type === "tool_result" && r.tool_use_id === b.id)) return [`tool_use ${b.id} at ${i}`];
      if (b.type === "tool_result" && !blocks(sent[i - 1]).some((u) => u.type === "tool_use" && u.id === b.tool_use_id)) return [`tool_result ${b.tool_use_id} at ${i}`];
      return [];
    }),
  );
}

describe("a reply checked before the Learner sees it", () => {
  it("gives a 150-word draft at concept exactly one retry, ending with the correction, and shows only the passing reply as one text", async () => {
    const db = await testDb();
    await atConcept(db);
    const progress: ProgressEvent[] = [];
    const { events, requests } = await run(db, [say(LONG), say(SHORT)], STEP_LED, { notify: (e) => progress.push(e) });
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

  it("folds the Session into a summary only once the reply has passed: never before a retry, never from the rejected draft", async () => {
    const db = await testDb();
    await atConcept(db);
    await db.insert(settings).values({ key: "compact_at_tokens", value: "1000" }).onConflictDoUpdate({ target: settings.key, set: { value: "1000" } });
    const big = { input_tokens: 2000, output_tokens: 100 };
    const summary = { type: "compaction", items: [{ type: "compaction", encrypted_content: "Summary after the passing reply." }] };
    const { events, requests } = await run(db, [
      { ...say(LONG), usage: big },
      { ...say(SHORT), usage: big },
      { content: [summary], stop_reason: "compaction", usage: { input_tokens: 2100, output_tokens: 200 } },
    ]);
    // The draft, its retry, then one compaction: the retry carried the whole draft history, with no summary in it.
    expect(requests.map((r) => Boolean(r.compaction))).toEqual([false, false, true]);
    expect(JSON.stringify(requests[1].messages)).not.toContain("compaction");
    // The summary folds what the next turn would send: the passing reply, not the rejected draft or the correction.
    const folded = JSON.stringify(requests[2].messages);
    expect(folded).toContain("Which would you pick, money today or later?");
    expect(folded).not.toContain(REPLY_CHECK_PREFIX);
    expect(folded).not.toContain("Money today is worth more than money later. Money today");
    expect(texts(events)).toEqual([{ type: "text", text: SHORT }]);
    expect(events.at(-1)).toMatchObject({ type: "done", usage: { steps: expect.arrayContaining([expect.objectContaining({ tools: ["compaction"] })]) } });
    // The summary is stored after the reply, and the next request starts from it.
    const next = await run(db, [say("Carrying on from the summary.")], "Go on");
    expect(next.requests[0].messages[0]).toEqual({ role: "assistant", content: [summary] });
  });

  it("shows the fallback when the retry fails too, with nothing over the cap, and stores it as the turn's final text", async () => {
    const db = await testDb();
    await atConcept(db);
    const { events, requests } = await run(db, [say(LONG), say(LONG)], STEP_LED);
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
    const { events, requests } = await run(db, [say(SUM), say(SUM)], STEP_LED);
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
    const { events, requests } = await run(db, [say(LONG)], STEP_LED, { retryWithinMs: 0 });
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

  it("stores the reply that passed: a reply in several blocks is fixed as one text, so only its first bold span stays", async () => {
    const db = await testDb();
    await atConcept(db);
    // Paragraph and cited blocks, as the OpenAI adapter stores a reply; each has its own bold span or arrow.
    const reply: ScriptedReply = {
      content: [
        { type: "text", text: "**Money today** beats money later." },
        { type: "text", text: "\n\nYou can **use it** now" },
        { type: "text", text: " → or **invest** it." },
        { type: "text", text: "\nWhich would you pick?" },
      ],
    };
    const { events, requests } = await run(db, [reply]);
    expect(requests).toHaveLength(1);
    const shown = "**Money today** beats money later.\n\nYou can use it now to or invest it.\nWhich would you pick?";
    expect(texts(events).map((e) => e.text).join("")).toBe(shown);
    expect((await loadCurrentSession(db, map, OWNER_LEARNER_ID)).at(-1)!.text).toBe(shown);
  });

  it("sends no text when the Learner stops while the retry runs; their message stays and the turn is Stopped", async () => {
    const db = await testDb();
    await atConcept(db);
    const { client, requests } = scriptedClient([say(LONG), { ...say(SHORT), holdAfterFirstText: new Promise(() => {}) }]);
    const events: TurnEvent[] = [];
    const done = (async () => {
      for await (const e of runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, STEP_LED)) events.push(e);
    })();
    while (requests.length < 2) await new Promise((r) => setTimeout(r, 5));
    await requestStop(db, OWNER_LEARNER_ID);
    await done;
    expect(texts(events)).toEqual([]);
    expect(events.map((e) => e.type).slice(-2)).toEqual(["stopped", "done"]);
    const lines = await loadCurrentSession(db, map, OWNER_LEARNER_ID);
    expect(lines.at(-1)).toMatchObject({ role: "user", text: STEP_LED });
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

  it("a Retry of a failed retry rejects only the draft's text and the correction: the draft's tool results stay sent", async () => {
    const db = await testDb();
    await atConcept(db);
    const calc = { type: "tool_use", id: "toolu_calc", name: "calculate", input: { expression: "100 / 1.08" } };
    // The draft calls a tool, then fails the checks; the retry fails at the API, so the turn is left failed.
    const failed = await run(db, [{ content: [calc], stop_reason: "tool_use" }, say(LONG), { error: new Error("500 The server had an error.") }]);
    expect(failed.events.some((e) => e.type === "error")).toBe(true);
    // Retry: the retry runs again from the correction and passes.
    const resumed = await run(db, [say(SHORT)], { resume: true });
    expect(texts(resumed.events).map((e) => e.text).join("")).toBe(SHORT);
    const record = (await records(db)).at(-1)!;
    const rows = await db.select().from(messages).where(eq(messages.sessionId, record.sessionId));
    const rejectedRoles = rows.filter((r) => record.rejectedSeqs.includes(r.seq)).map((r) => r.role);
    expect(rejectedRoles.sort()).toEqual(["assistant", "assistant", "user"]);
    // The next turn still sends the tool call with its result (OpenAI refuses a call without its output).
    const next = await run(db, [say("Yes, money today.\nWhat would you do with it?")], "I see");
    expect(next.events.some((e) => e.type === "error")).toBe(false);
    const sent = JSON.stringify(next.requests[0].messages);
    expect(sent).toContain('"tool_use_id":"toolu_calc"');
    expect(sent).not.toContain(REPLY_CHECK_PREFIX);
  });

  it("a resume after the correction began goes on with the retry, and leaves the rejected draft out of later requests with every tool call still answered", async () => {
    const db = await testDb();
    await atConcept(db);
    const cut = await cutOffInRetry(db);
    expect(cut.events.at(-1)).toEqual({ type: "cut_off" });
    expect(cut.requests).toHaveLength(3);
    const resumed = await run(db, [say(SHORT)], { resume: true });
    // The retry goes on, still told what its draft broke.
    expect(String(resumed.requests[0].messages.at(-1)!.content).startsWith(REPLY_CHECK_PREFIX)).toBe(true);
    expect(texts(resumed.events)).toEqual([{ type: "text", text: SHORT }]);
    const next = await run(db, [say("Yes, money today.\nWhat would you do with it?")], "I see");
    expect(next.events.at(-1)).toMatchObject({ type: "done" });
    const sent = next.requests[0].messages;
    const json = JSON.stringify(sent);
    expect(json).not.toContain("Money today is worth more than money later. Money today");
    expect(json).not.toContain("That is the monthly payment.");
    expect(json).not.toContain(REPLY_CHECK_PREFIX);
    expect(json).toContain(SHORT.split("\n")[0]);
    // The draft's tool call ran and its effects stand, so the call stays with its result: neither is ever sent alone.
    expect(json).toContain(EMI.id);
    expect(orphans(sent)).toEqual([]);
  });

  it("never rejects a compaction row: a reply judged again after the Session was compacted keeps the summary in later requests", () => {
    const rows = [
      { seq: 1, role: "user", content: [{ type: "text", text: "Hi" }] },
      { seq: 2, role: "assistant", content: [{ type: "text", text: "The stored reply." }] },
      // compactSession appends the summary after the checks; a resume that judges the reply again rejects from seq 1.
      { seq: 3, role: "assistant", content: [{ type: "compaction", items: [{ type: "compaction", encrypted_content: "enc" }] }] },
    ];
    expect([...rejectedRows(rows, 1, { rejecting: 1 })]).toEqual([2]);
    // A record saved before this rule may list the summary: it still stays.
    expect(withoutRejected(rows, new Set([2, 3])).map((r) => r.seq)).toEqual([1, 3]);
  });

  it("saves a rejection as it happens: a turn cut off in its retry and never resumed keeps its draft and correction out of the next request", async () => {
    const db = await testDb();
    await atConcept(db);
    await cutOffInRetry(db);
    const [turn] = await db.select().from(turns).orderBy(sql`${turns.id} desc`).limit(1);
    const stored = await db.select().from(messages).where(eq(messages.sessionId, turn.sessionId!)).orderBy(messages.seq);
    const draft = stored.filter((m) => m.seq > turn.turnSeq! && m.role === "assistant").map((m) => m.seq);
    const correction = stored.find((m) => JSON.stringify(m.content).includes(REPLY_CHECK_PREFIX))!.seq;
    // The draft's two loop steps and the correction; never the tool result between them.
    expect(draft).toHaveLength(2);
    const [, record] = await records(db);
    expect(record).toMatchObject({ turnSeq: turn.turnSeq, rejectedSeqs: [...draft, correction] });
    const next = await run(db, [say("Yes, money today.\nWhat would you do with it?")], "I see");
    expect(next.events.at(-1)).toMatchObject({ type: "done" });
    const sent = next.requests[0].messages;
    const json = JSON.stringify(sent);
    expect(json).not.toContain("Money today is worth more than money later. Money today");
    expect(json).not.toContain(REPLY_CHECK_PREFIX);
    expect(orphans(sent)).toEqual([]);
  });

  it("a record written before the one rule, listing a tool result as rejected, still sends that tool call with its result", async () => {
    const db = await testDb();
    await atConcept(db);
    await run(db, [{ content: [{ type: "text", text: LONG }, EMI] }, say("That is the monthly payment."), say(SHORT)]);
    // The old resume path rejected every row from the turn's message to the correction, the tool result among them.
    const [, record] = await records(db);
    const correction = record.rejectedSeqs.at(-1)!;
    await db
      .update(replyChecks)
      .set({ rejectedSeqs: Array.from({ length: correction - record.turnSeq }, (_, i) => record.turnSeq + 1 + i) })
      .where(eq(replyChecks.id, record.id));
    const next = await run(db, [say("Yes, money today.\nWhat would you do with it?")], "I see");
    expect(next.events.at(-1)).toMatchObject({ type: "done" });
    const json = JSON.stringify(next.requests[0].messages);
    expect(json).toContain(EMI.id);
    expect(json).not.toContain(REPLY_CHECK_PREFIX);
    expect(orphans(next.requests[0].messages)).toEqual([]);
  });

  it("resuming a turn that showed its fallback but was never marked finished shows that fallback again and asks the model nothing", async () => {
    const db = await testDb();
    await atConcept(db);
    const { events } = await run(db, [say(LONG), say(LONG)]);
    const [shown] = texts(events);
    // The function was killed after the record was saved, before the turn was marked finished.
    await db.update(turns).set({ status: "cut_off" }).where(eq(turns.id, (await db.select().from(turns).orderBy(sql`${turns.id} desc`).limit(1))[0].id));
    const resumed = await run(db, [], { resume: true });
    expect(resumed.requests).toHaveLength(0);
    expect(texts(resumed.events)).toEqual([shown]);
    const [, record] = await records(db);
    expect(record).toMatchObject({ shownText: shown.text });
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
    await run(db, [{ content: [{ type: "text", text: "Money today", citations: [cite("/passages/7", "Bonds")] }, { type: "text", text: " is worth more." }] }], STEP_LED);
    const [last] = await db.select().from(turns).orderBy(sql`${turns.id} desc`).limit(1);
    const live = (await loadCurrentSession(db, map, OWNER_LEARNER_ID)).at(-1)!.text;
    expect(live).toContain("[1](/passages/7?blocks=1-2)");
    await db.delete(replyChecks);
    await db.update(turns).set({ status: "cut_off" }).where(eq(turns.id, last.id));
    const { events } = await run(db, [], { resume: true });
    expect(texts(events)).toEqual([{ type: "text", text: live }]);
    expect(live).toMatch(/Bonds/);
  });

  it("sends a reply with an openui-lang fence back for the retry (V4)", async () => {
    const db = await testDb();
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
