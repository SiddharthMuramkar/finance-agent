import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { OWNER_LEARNER_ID, sessions, settings } from "@/db/schema";
import type { Db } from "@/db/types";
import { engineOff } from "@/test/engine-off";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { WIDGET_SHOWN } from "@/widgets/shown-widget";
import { ENGINE_INSTRUCTIONS, TUTOR_INSTRUCTIONS, TUTOR_TOOLS } from "./instructions";
import { fingerprint, frozenNow, readSettings } from "./session-log";
import { loadThread } from "./transcript";
import { runTutorTurn, type TurnEvent } from "./turn";
import { withoutChoices } from "@/test/choices";

// Seam 1, the Tutor Turn (ADR 0005): with the widget engine on, the Tutor calls show_widget with a recipe and params;
// code compiles and checks the Widget, stores it as a Session item and streams it. Off, nothing changes.

async function collect(events: AsyncIterable<TurnEvent>) {
  const out: TurnEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

const text = (t: string) => ({ type: "text", text: t });
const show = (recipe: string, params: unknown, id = "toolu_show") => ({ type: "tool_use", id, name: "show_widget", input: { recipe, params } });
const SIP = {
  title: "₹1,000 a month in a SIP",
  inputs: { calculator: "sip", currency: "inr", held: { monthly: 1000, ratePercent: 10 }, slider: { input: "years", label: "Years you keep investing", unit: "years", min: 1, max: 30, step: 1, start: 10 } },
  refs: {},
  facts: {},
};
type Request = { messages: { role: string; content?: unknown }[]; tools: { name: string }[]; system: { text: string }[] };
const toolResults = (request: Request) =>
  request.messages.flatMap((m) => (Array.isArray(m.content) ? (m.content as { type: string; content?: unknown; is_error?: boolean }[]).filter((b) => b.type === "tool_result") : []));

async function engine(db: Db, value: "on" | "off") {
  await readSettings(db);
  await db.update(settings).set({ value }).where(eq(settings.key, "widget_engine"));
}

describe("show_widget and the widget engine", () => {
  it("with the engine off: today's instructions and tools exactly, so the fingerprint is unchanged", async () => {
    const db = await testDb();
    await engineOff(db);
    expect((await readSettings(db)).widgetEngine).toBe("off");
    const frozen = await frozenNow(db);
    expect(frozen.instructions).toBe(TUTOR_INSTRUCTIONS);
    expect(frozen.tools).toBe(TUTOR_TOOLS);
    expect(frozen.fingerprint).toBe(fingerprint(TUTOR_INSTRUCTIONS, TUTOR_TOOLS));
    const { client, requests } = scriptedClient([{ content: [text("Hello.")] }]);
    await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "Hi"));
    expect(requests[0].tools.map((t) => t.name)).not.toContain("show_widget");
  });

  it("on, it freezes the recipe signatures instead of the Widget library prompt, and show_widget", async () => {
    const db = await testDb();
    await engine(db, "on");
    const { client, requests } = scriptedClient([{ content: [text("Hello.")] }]);
    await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "Hi"));
    expect(requests[0].tools.map((t) => t.name)).toContain("show_widget");
    expect(requests[0].system[0].text).toBe(ENGINE_INSTRUCTIONS);
    expect(ENGINE_INSTRUCTIONS).toContain("- grow_money (Grow):");
    expect(ENGINE_INSTRUCTIONS.length).toBeLessThan(TUTOR_INSTRUCTIONS.length);
  });

  it("shows a recipe Widget: it is stored as a Session item, streams at once, and the result says what is on screen", async () => {
    const db = await testDb();
    await engine(db, "on");
    const { client, requests } = scriptedClient([{ content: [show("grow_money", SIP)] }, { content: [text("Move the years and watch it grow.")] }]);
    const events = await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "Show me a SIP"));
    const item = events.find((e) => e.type === "item") as Extract<TurnEvent, { type: "item" }>;
    expect(item.item.kind).toBe(WIDGET_SHOWN);
    expect(item.item.data).toMatchObject({ id: "toolu_show", recipe: "grow_money", title: "₹1,000 a month in a SIP", source: "recipe" });
    expect(String(item.item.data.code)).toContain('MoneyStack("sip", {monthly: 1000, ratePercent: 10, years: $years}, "inr")');
    const [result] = toolResults(requests[1]);
    expect(result.is_error).toBeFalsy();
    expect(String(result.content)).toMatch(/Shown by code: "₹1,000 a month in a SIP" is in the Widget panel/);
    expect(String(result.content)).toContain("$years (Years you keep investing): 1 to 30 in steps of 1, starting at 10");
    expect(String(result.content)).toContain("Write no openui-lang block in this reply");

    const done = events.at(-1) as Extract<TurnEvent, { type: "done" }>;
    const thread = await loadThread(db, done.ref.sessionId, undefined, OWNER_LEARNER_ID);
    expect(withoutChoices(thread).map((e) => (e.role === "item" ? e.kind : e.role))).toEqual(["user", WIDGET_SHOWN, "assistant"]);

    // The next turn's Tutor is told it is open, by title, and what its slider shows, keyed by its title.
    const next = scriptedClient([{ content: [text("You chose 25 years.")] }]);
    const widgets = { "₹1,000 a month in a SIP": { values: { $years: 25 }, ticked: [] } };
    await collect(runTutorTurn({ db, client: next.client, widgets, learnerId: OWNER_LEARNER_ID }, "What did I set?"));
    const asked = JSON.stringify(next.requests[0].messages);
    expect(asked).toContain("₹1,000 a month in a SIP");
    expect(asked).toContain("25 years");
  });

  it("for a practice-mode Widget, tells the Tutor it has its own answer box, so the reply ends at its one question (ticket #248, T5)", async () => {
    const db = await testDb();
    await engine(db, "on");
    const practice = { title: "Your try: 2% to 2.5%", inputs: { old: 2, new: 2.5, mode: "practice" }, refs: {}, facts: {} };
    const { client, requests } = scriptedClient([{ content: [show("rate_move", practice)] }, { content: [text("Okay.\nHow many basis points did the rate move?")] }]);
    await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "ask me a question, use widgets"));
    const [result] = toolResults(requests[1]);
    expect(String(result.content)).toContain("It asks the Learner for the move itself and has its own answer box: end your reply with that one question, and do not say where to type.");
  });

  it("for a show-mode Widget, says nothing about an answer box", async () => {
    const db = await testDb();
    await engine(db, "on");
    const shown = { title: "A rate from 2% to 2.5%", inputs: { old: 2, new: 2.5, mode: "show" }, refs: {}, facts: {} };
    const { client, requests } = scriptedClient([{ content: [show("rate_move", shown)] }, { content: [text("The Widget shows the move.\nWhich line gives basis points?")] }]);
    await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "show me in a widget"));
    const [result] = toolResults(requests[1]);
    expect(String(result.content)).toMatch(/Shown by code: "A rate from 2% to 2.5%"/);
    expect(String(result.content)).not.toContain("answer box");
  });

  it("params that do not fit give a tool error, so the Tutor retries inside the loop; nothing is stored", async () => {
    const db = await testDb();
    await engine(db, "on");
    const bad = { ...SIP, inputs: { ...SIP.inputs, slider: { ...SIP.inputs.slider, min: 40 } } };
    const { client, requests } = scriptedClient([
      { content: [show("grow_money", bad, "toolu_bad")] },
      { content: [show("history_case", { title: "Gold", inputs: {}, refs: { dataset: "nowhere/nothing" }, facts: {} }, "toolu_ref")] },
      { content: [text("Let me say it in words.")] },
    ]);
    const events = await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "Show me a SIP"));
    const [first] = toolResults(requests[1]);
    expect(first.is_error).toBe(true);
    expect(String(first.content)).toMatch(/do not fit the grow_money recipe/);
    const second = toolResults(requests[2]).at(-1)!;
    expect(second.is_error).toBe(true);
    expect(String(second.content)).toMatch(/nowhere\/nothing is not in the Case Data/);
    expect(withoutChoices(events).some((e) => e.type === "item")).toBe(false);
    expect(events.some((e) => e.type === "correction")).toBe(false);
  });

  it("refuses a second Widget in a reply that already wrote one of its own", async () => {
    const db = await testDb();
    await engine(db, "on");
    const fence = ["```openui-lang", 'root = Widget("Sensex", [h])', 'h = HistoryChart("sensex-1992/sensex-close")', "```"].join("\n");
    const { client, requests } = scriptedClient([{ content: [text(fence), show("grow_money", SIP)] }, { content: [text("That one is enough.")] }]);
    const events = await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "Show me"));
    const [result] = toolResults(requests[1]);
    expect(result.is_error).toBe(true);
    expect(String(result.content)).toMatch(/already has a Widget/);
    expect(events.some((e) => e.type === "item" && e.item.kind === WIDGET_SHOWN)).toBe(false);
  });

  it("is one way per Session: frozen on, switched off, a resume and a new turn keep show_widget and never throw", async () => {
    const db = await testDb();
    await engine(db, "on");
    const first = scriptedClient([{ content: [show("grow_money", SIP)] }, { content: [text("Never saved.")], delayMs: 400 }]);
    const cut = await collect(runTutorTurn({ db, client: first.client, timeBudgetMs: 150, learnerId: OWNER_LEARNER_ID }, "Show me a SIP"));
    expect(cut.at(-1)).toEqual({ type: "cut_off" });
    await engine(db, "off");

    const resume = scriptedClient([{ content: [text("Here it is.")] }]);
    const resumed = await collect(runTutorTurn({ db, client: resume.client, learnerId: OWNER_LEARNER_ID }, { resume: true }));
    expect(resumed.some((e) => e.type === "error")).toBe(false);
    expect(resumed.at(-1)?.type).toBe("done");

    const later = scriptedClient([{ content: [text("Still here.")] }]);
    const events = await collect(runTutorTurn({ db, client: later.client, learnerId: OWNER_LEARNER_ID }, "And now?"));
    expect(events.some((e) => e.type === "error")).toBe(false);
    expect(later.requests[0].tools.map((t) => t.name)).toContain("show_widget");
    const [session] = await db.select().from(sessions);
    expect(session.instructions).toBe(ENGINE_INSTRUCTIONS);
  });
});
