import { describe, expect, it } from "vitest";
import { WIDGET_OPENED } from "@/course/written-ahead";
import { saveFinishedStep } from "@/learner/memory";
import { presentValueOnly } from "@/test/present-value-map";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { WIDGET_CHECK_PREFIX } from "@/widgets/check";
import { loadSession, loadThread } from "./transcript";
import { runTutorTurn, type TurnEvent } from "./turn";

// Seam 1, the Tutor Turn (spec #119, "Widgets › Written-ahead Widgets"): the Tutor opens a written-ahead Widget by id
// with open_widget; the opening is stored in the Session as an item, so the Widget comes back after a reload. In Percent
// (the first Topic on the real Course Map) a Widget the Tutor draws with a growth-rate calculator is sent back through
// the correction turn, which names the written-ahead Widget to open instead.

async function collect(events: AsyncIterable<TurnEvent>) {
  const out: TurnEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

const text = (t: string) => ({ content: [{ type: "text", text: t }] });
const open = (id: string, toolId = "toolu_open") => ({ content: [{ type: "tool_use", id: toolId, name: "open_widget", input: { id } }] });
const fence = (code: string) => ["```openui-lang", code, "```"].join("\n");
const CAGR = fence(
  [
    'root = Widget("One rate move, two ways to describe it", [rate, calc, steps])',
    "$rate = 4",
    'rate = Slider("rate", "New rate", 0, 10, 0.01, $rate, "percent")',
    'calc = Calculator("cagr", {start: 4, end: $rate, years: 1})',
    "steps = GuidedTasks([up])",
    'up = GuidedTask("Set the new rate to 6%", $rate == 6)',
  ].join("\n"),
);
type Request = { messages: { role: string; content?: unknown }[] };
const toolResults = (request: Request) =>
  request.messages.flatMap((m) => (Array.isArray(m.content) ? (m.content as { type: string; content?: unknown; is_error?: boolean }[]).filter((b) => b.type === "tool_result") : []));
const contextOf = (request: Request) => JSON.stringify(request.messages);

describe("written-ahead Widgets in the Tutor Turn", () => {
  it("tells the Tutor the Topic's written-ahead Widgets by id and title, and that it opens them rather than drawing its own", async () => {
    const db = await testDb();
    const { client, requests } = scriptedClient([text("Hello.")]);
    await collect(runTutorTurn({ db, client }, "Hi"));
    expect(requests[0].tools.map((t) => t.name)).toContain("open_widget");
    expect(contextOf(requests[0])).toContain('Written-ahead Widgets for this Topic (open one with open_widget; never draw your own version): \\"One rate change, said three ways\\" (id rate-change-three-ways).');
  });

  it("opens one by id: the opening streams and is stored as an item in the Session, so it comes back after a reload", async () => {
    const db = await testDb();
    const { client, requests } = scriptedClient([open("rate-change-three-ways"), text("Move the old rate first.")]);
    const events = await collect(runTutorTurn({ db, client }, "Can I play with this?"));
    expect(events).toContainEqual({ type: "item", item: { kind: WIDGET_OPENED, data: { id: "rate-change-three-ways", title: "One rate change, said three ways" } } });
    const [result] = toolResults(requests[1]);
    expect(result.is_error).toBeFalsy();
    expect(String(result.content)).toMatch(/Opened by code: "One rate change, said three ways" is in the Widget panel/);
    // Its sliders and tasks, so the Tutor can point to them with numbers the Widget can show.
    expect(String(result.content)).toContain("$old (Old rate): 0 to 10 in steps of 0.01, starting at 5");
    expect(String(result.content)).toContain("Set a rise from 6% to 6.4%");

    const done = events.at(-1) as Extract<TurnEvent, { type: "done" }>;
    const thread = await loadThread(db, done.ref.sessionId);
    expect(thread.map((e) => (e.role === "item" ? e.kind : e.role))).toEqual(["user", WIDGET_OPENED, "assistant"]);
  });

  it("shows the Tutor an opened written-ahead Widget's sliders and ticks with the Learner's next message, keyed by its id", async () => {
    const db = await testDb();
    const { client, requests } = scriptedClient([open("rate-change-three-ways"), text("Try a rise."), text("You set 6% to 6.4%.")]);
    await collect(runTutorTurn({ db, client }, "Can I play with this?"));
    const widgets = { "rate-change-three-ways": { values: { $old: 6, $new: 6.4 }, ticked: ["Set a rise from 6% to 6.4%"] } };
    await collect(runTutorTurn({ db, client, widgets }, "What rates do I have set?"));
    const asked = JSON.stringify(requests.at(-1)!.messages);
    expect(asked).toContain("Old rate: 6%");
    expect(asked).toContain("New rate: 6.4%");
    expect(asked).toContain("[x] Set a rise from 6% to 6.4%");
    // Its readouts are worked out by code, not left to the Tutor: 6% to 6.4% is 0.4 points, 40 bp, a 6.67% change.
    expect(asked).toContain("In percentage points: 0.4 points; In basis points: 40 bp; As a percent change of the old rate: 6.67%");
  });

  it("writes Percent's readouts into Tell the Tutor what I found, worked out by code", async () => {
    const db = await testDb();
    const { client, requests } = scriptedClient([open("rate-change-three-ways"), text("Try them all."), text("Good.")]);
    await collect(runTutorTurn({ db, client }, "Can I play with this?"));
    const ticked = ["Set a rise from 6% to 6.4%", "Now a cut from 8% to 7.1%", "Now a rise from 0.5% to 0.9%, and compare its percent change with the first rise"];
    const widgets = { "rate-change-three-ways": { values: { $old: 0.5, $new: 0.9 }, ticked } };
    await collect(runTutorTurn({ db, client, widgets }, { widgetReport: "rate-change-three-ways" }));
    const asked = JSON.stringify(requests.at(-1)!.messages);
    expect(asked).toContain("I set the old rate to 0.5% and the new rate to 0.9%. In percentage points: 0.4 points; In basis points: 40 bp; As a percent change of the old rate: 80%.");
  });

  it("refuses an id the Topic does not have, and stores nothing", async () => {
    const db = await testDb();
    const { client, requests } = scriptedClient([open("annuity-today"), text("Let me draw it instead.")]);
    const events = await collect(runTutorTurn({ db, client }, "Show me"));
    const [result] = toolResults(requests[1]);
    expect(result.is_error).toBe(true);
    expect(String(result.content)).toMatch(/Not opened: this Topic has no written-ahead Widget "annuity-today". Its written-ahead Widgets: rate-change-three-ways/);
    expect(events.some((e) => e.type === "item")).toBe(false);
  });

  it("sends a Tutor-drawn growth-rate calculator in Percent back through the correction turn, naming the written-ahead Widget to open", async () => {
    const db = await testDb();
    const { client, requests } = scriptedClient([text(`Here is a box.\n${CAGR}`), open("rate-change-three-ways", "toolu_fix"), text("")]);
    const events = await collect(runTutorTurn({ db, client }, "Show me in a widget"));
    expect(events.map((e) => e.type)).toEqual(["text", "correction", "item", "done"]);
    const correction = String(requests[1].messages.at(-1)!.content);
    expect(correction.startsWith(WIDGET_CHECK_PREFIX)).toBe(true);
    expect(correction).toMatch(/- Widget 1: this Widget uses the Compound annual growth rate calculator \(cagr\), which the written-ahead Widget "One rate change, said three ways" covers/);
    expect(correction).toMatch(/call open_widget with id "rate-change-three-ways"/);
    // The Tutor's own version is gone on reload; the written-ahead Widget stands after the reply instead.
    const done = events.at(-1) as Extract<TurnEvent, { type: "done" }>;
    expect((await loadSession(db, done.ref.sessionId)).map((l) => l.text)).toEqual(["Show me in a widget", "Here is a box.\n"]);
    const thread = await loadThread(db, done.ref.sessionId);
    expect(thread.filter((e) => e.role === "item").map((e) => e.role === "item" && e.kind)).toEqual([WIDGET_OPENED]);
  });

  it("sends back a Widget the Tutor draws under a written-ahead Widget's title, its own version of it", async () => {
    const own = fence(
      [
        'root = Widget("One rate change, said three ways", [old, steps])',
        "$old = 4",
        'old = Slider("old", "Old rate", 0, 10, 0.01, $old, "percent")',
        "steps = GuidedTasks([up])",
        'up = GuidedTask("Set it to 5%", $old == 5)',
      ].join("\n"),
    );
    const db = await testDb();
    const { client, requests } = scriptedClient([text(own), open("rate-change-three-ways", "toolu_fix"), text("")]);
    await collect(runTutorTurn({ db, client }, "Show me"));
    expect(String(requests[1].messages.at(-1)!.content)).toMatch(/- Widget 1: this Widget has the title of the written-ahead Widget "One rate change, said three ways"\. Never draw your own version: call open_widget/);
  });

  it("lets the Tutor draw a calculator the Topic's written-ahead Widgets do not cover", async () => {
    const emi = fence(
      [
        'root = Widget("What a home loan costs", [rate, calc, steps])',
        "$rate = 8.5",
        'rate = Slider("ratePercent", "Interest rate", 5, 14, 0.01, $rate, "percent")',
        'calc = Calculator("emi", {principal: 5000000, ratePercent: $rate, years: 20})',
        "steps = GuidedTasks([ten])",
        'ten = GuidedTask("Set the rate to 10%", $rate == 10)',
      ].join("\n"),
    );
    const db = await testDb();
    const { client, requests } = scriptedClient([text(emi)]);
    const events = await collect(runTutorTurn({ db, client }, "Show me a loan"));
    expect(requests).toHaveLength(1);
    expect(events.some((e) => e.type === "correction")).toBe(false);
  });
});

// ADR 0001: the Learner plays with the explore Widget only once the concept is named, and code, not the Tutor's
// instructions, holds that. Present value's explore Widget is its written-ahead annuity Widget.
describe("the explore Widget before the explore step", () => {
  const pv = presentValueOnly({ withoutQuiz: true });
  const ANNUITY = fence(
    [
      'root = Widget("How the payments shrink", [rate, chart, steps])',
      "$rate = 5",
      'rate = Slider("rate", "Interest rate", 0, 10, 0.01, $rate, "percent")',
      "chart = AnnuityChart(1000, 10, 0, $rate)",
      "steps = GuidedTasks([high])",
      'high = GuidedTask("Set the rate to 8%", $rate == 8)',
    ].join("\n"),
  );

  it("refuses to open it at the story step, stores nothing, and leaves it off the Written-ahead Widgets line", async () => {
    const db = await testDb();
    const { client, requests } = scriptedClient([open("annuity-worth-today"), text("Let us start with the story.")]);
    const events = await collect(runTutorTurn({ db, client, map: pv }, "Can I play with it?"));
    const [result] = toolResults(requests[1]);
    expect(result.is_error).toBe(true);
    expect(String(result.content)).toMatch(/Not opened: "What the annuity is worth today" is this Topic's explore Widget/);
    expect(events.some((e) => e.type === "item")).toBe(false);
    expect(contextOf(requests[0])).not.toContain("annuity-worth-today");
  });

  it("sends back an annuity chart the Tutor draws at the story step without telling it to open the explore Widget", async () => {
    const db = await testDb();
    const { client, requests } = scriptedClient([text(`Look.\n${ANNUITY}`), text("")]);
    await collect(runTutorTurn({ db, client, map: pv }, "Show me"));
    const correction = String(requests[1].messages.at(-1)!.content);
    expect(correction).toMatch(/- Widget 1: this Widget uses .*which the written-ahead Widget "What the annuity is worth today" covers/);
    expect(correction).toMatch(/do not open it yet/);
    expect(correction).not.toMatch(/call open_widget with id "annuity-worth-today"/);
  });

  it("opens it once the explore step has begun", async () => {
    const db = await testDb();
    for (const step of ["story", "concept"] as const) await saveFinishedStep(db, pv, step);
    const { client, requests } = scriptedClient([open("annuity-worth-today"), text("Try the rate.")]);
    const events = await collect(runTutorTurn({ db, client, map: pv }, "Can I play with it?"));
    expect(toolResults(requests[1])[0].is_error).toBeFalsy();
    expect(events).toContainEqual({ type: "item", item: { kind: WIDGET_OPENED, data: { id: "annuity-worth-today", title: "What the annuity is worth today" } } });
  });
});
