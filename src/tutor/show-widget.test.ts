import { onPercentTopic } from "@/test/percent-topic";
import { describe, expect, it, vi } from "vitest";
import { OWNER_LEARNER_ID, sessions } from "@/db/schema";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { WIDGET_SHOWN } from "@/widgets/shown-widget";
import { ENGINE_INSTRUCTIONS } from "./instructions";
import { loadThread } from "./transcript";
import { runTutorTurn, type TurnEvent } from "./turn";
import { withoutChoices } from "@/test/choices";

// The Companion Widget code adds to a reply with none (E4a) is off here: this file tests other behaviour, and
// src/tutor/companion-turn.test.ts tests the companion.
vi.mock("./companion", () => ({ pickCompanion: () => null }));

// Seam 1, the Tutor Turn (ADR 0009): the Tutor calls show_widget with a recipe and params; code compiles and checks the
// Widget, stores it as a Session item and streams it.

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
type Request = { messages: { role: string; content?: unknown }[]; tools: { name: string }[]; instructions: string };
const toolResults = (request: Request) =>
  request.messages.flatMap((m) => (Array.isArray(m.content) ? (m.content as { type: string; content?: unknown; is_error?: boolean }[]).filter((b) => b.type === "tool_result") : []));

describe("show_widget and the widget engine", () => {
  it("freezes the recipe signatures and show_widget into every Session", async () => {
    const db = await onPercentTopic(await testDb());
    const { client, requests } = scriptedClient([{ content: [text("Hello.")] }]);
    await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "Hi"));
    expect(requests[0].tools.map((t) => t.name)).toContain("show_widget");
    expect(requests[0].instructions).toBe(ENGINE_INSTRUCTIONS);
    // The instructions carry the live recipe signatures.
    expect(ENGINE_INSTRUCTIONS).toContain("- grow_money (Grow):");
  });

  it("shows a recipe Widget: it is stored as a Session item, streams at once, and the result says what is on screen", async () => {
    const db = await onPercentTopic(await testDb());
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

  it("tells the next turn's Tutor the open Widget's title and to move it with update_widget, never to write it again", async () => {
    const db = await onPercentTopic(await testDb());
    const first = scriptedClient([{ content: [show("grow_money", SIP)] }, { content: [text("Move the years and watch it grow.")] }]);
    await collect(runTutorTurn({ db, client: first.client, learnerId: OWNER_LEARNER_ID }, "Show me a SIP"));
    expect(JSON.stringify(first.requests[0].messages)).not.toContain("Open Widgets");

    const next = scriptedClient([{ content: [text("Sure.")] }]);
    await collect(runTutorTurn({ db, client: next.client, learnerId: OWNER_LEARNER_ID }, "And now?"));
    const context = next.requests[0].messages
      .filter((m) => m.role === "system")
      .map((m) => String(m.content))
      .join("\n");
    expect(context).toContain('Open Widgets (tabs in the Widget panel): "₹1,000 a month in a SIP".');
    expect(context).toContain("call update_widget with its title");
    // The engine writes no Widget code (ENGINE_INSTRUCTIONS), so the line never asks for a Widget written out again.
    expect(context).not.toMatch(/write it again|openui-lang/);
  });

  it("marks a Workbench an Illustration when its Case figures are the Tutor's, not a Topic file's (ADR 0018)", async () => {
    // Webvan's year as course/topics/spine-03-cash.yaml gives it to the cash_waterfall Workbench.
    const webvan = {
      name: "Webvan",
      currency: "USD",
      unit: "millions",
      revenue: 13.305,
      taxPercent: 35,
      lossesCarried: 470,
      opening: { growth: 1241.3, margin: -179.2, salesToCapital: 0.7 },
      source: { title: "Webvan Group, Form 10-K for 2000 (SEC EDGAR)", url: "https://www.sec.gov/Archives/edgar/data/1092657/000101287001001485/0001012870-01-001485.txt" },
    };
    const shownTitle = async (company: unknown) => {
      const db = await testDb();
        const { client } = scriptedClient([{ content: [show("cash_waterfall", { title: "Webvan's year 2000", inputs: { company }, refs: {}, facts: {} })] }, { content: [text("Look.")] }]);
      const events = await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "Show me Webvan"));
      const item = events.find((e) => e.type === "item") as Extract<TurnEvent, { type: "item" }>;
      return item.item.data.title;
    };
    expect(await shownTitle(webvan)).toBe("Webvan's year 2000");
    expect(await shownTitle({ ...webvan, revenue: 20 })).toBe("Illustration: Webvan's year 2000");
  });

  it("for a practice-mode Widget, tells the Tutor it has its own answer box, so the reply ends at its one question (ticket #248, T5)", async () => {
    const db = await onPercentTopic(await testDb());
    const practice = { title: "Your try: 2% to 2.5%", inputs: { old: 2, new: 2.5, mode: "practice" }, refs: {}, facts: {} };
    const { client, requests } = scriptedClient([{ content: [show("rate_move", practice)] }, { content: [text("Okay.\nHow many basis points did the rate move?")] }]);
    await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "ask me a question, use widgets"));
    const [result] = toolResults(requests[1]);
    expect(String(result.content)).toContain("It asks the Learner for the move itself and has its own answer box: end your reply with that one question, and do not say where to type.");
  });

  it("for a show-mode Widget, says nothing about an answer box", async () => {
    const db = await onPercentTopic(await testDb());
    const shown = { title: "A rate from 2% to 2.5%", inputs: { old: 2, new: 2.5, mode: "show" }, refs: {}, facts: {} };
    const { client, requests } = scriptedClient([{ content: [show("rate_move", shown)] }, { content: [text("The Widget shows the move.\nWhich line gives basis points?")] }]);
    await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "show me in a widget"));
    const [result] = toolResults(requests[1]);
    expect(String(result.content)).toMatch(/Shown by code: "A rate from 2% to 2.5%"/);
    expect(String(result.content)).not.toContain("answer box");
  });

  it("shows a story recipe Widget at the story step, checked against the Topic (E3)", async () => {
    const db = await onPercentTopic(await testDb());
    const scene = {
      title: "The day before the decision",
      inputs: {
        cast: [
          { id: "fed", emoji: "bank", name: "The central bank" },
          { id: "saver", emoji: "woman", name: "Asha" },
        ],
        beats: [
          { who: "narrator", says: "It is February, and everyone expects calm." },
          { who: "narrator", says: "Tomorrow, the central bank gives its decision." },
        ],
        date: "1994-02-03",
      },
      refs: {},
      facts: {},
    };
    const { client } = scriptedClient([{ content: [show("story_scene", scene)] }, { content: [text("That is the day in the story.")] }]);
    const events = await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "Tell me the story"));
    const item = events.find((e) => e.type === "item" && e.item.kind === WIDGET_SHOWN) as Extract<TurnEvent, { type: "item" }> | undefined;
    expect(item?.item.data).toMatchObject({ recipe: "story_scene", title: "The day before the decision" });
    expect(String(item?.item.data.code)).toContain("StoryScene(");
  });

  it("refuses a story Widget dated after the Case's as-of date before the reveal (E3)", async () => {
    const db = await onPercentTopic(await testDb());
    const line = {
      title: "How the story unfolded",
      inputs: {
        beats: [
          { date: "1994-02-04", label: "The rate goes up", emoji: "bank" },
          { date: "1994-05-09", label: "Prices keep falling", emoji: "chart-decreasing" },
        ],
      },
      refs: {},
      facts: {},
    };
    const { client, requests } = scriptedClient([{ content: [show("timeline", line)] }, { content: [text("Let me say it in words.")] }]);
    const events = await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "Show me the year"));
    const [result] = toolResults(requests[1]);
    expect(result.is_error).toBe(true);
    expect(String(result.content)).toMatch(/1994-05-09 is after the Case's as-of date/);
    expect(events.some((e) => e.type === "item" && e.item.kind === WIDGET_SHOWN)).toBe(false);
  });

  it("params that do not fit give a tool error, so the Tutor retries inside the loop; nothing is stored", async () => {
    const db = await onPercentTopic(await testDb());
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
    const db = await onPercentTopic(await testDb());
    const fence = ["```openui-lang", 'root = Widget("Sensex", [h])', 'h = HistoryChart("sensex-1992/sensex-close")', "```"].join("\n");
    const { client, requests } = scriptedClient([{ content: [text(fence), show("grow_money", SIP)] }, { content: [text("That one is enough.")] }]);
    const events = await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "Show me"));
    const [result] = toolResults(requests[1]);
    expect(result.is_error).toBe(true);
    expect(String(result.content)).toMatch(/already has a Widget/);
    expect(events.some((e) => e.type === "item" && e.item.kind === WIDGET_SHOWN)).toBe(false);
  });

  it("keeps show_widget after a cut-off: a resume and a new turn never throw", async () => {
    const db = await onPercentTopic(await testDb());
    const first = scriptedClient([{ content: [show("grow_money", SIP)] }, { content: [text("Never saved.")], delayMs: 400 }]);
    const cut = await collect(runTutorTurn({ db, client: first.client, timeBudgetMs: 150, learnerId: OWNER_LEARNER_ID }, "Show me a SIP"));
    expect(cut.at(-1)).toEqual({ type: "cut_off" });

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
