import { describe, expect, it, vi } from "vitest";
import { WIDGET_OPENED } from "@/course/written-ahead";
import { saveFinishedStep } from "@/learner/memory";
import { oldPercentOnly } from "@/test/old-percent-map";
import { presentValueOnly } from "@/test/present-value-map";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { loadThread } from "./transcript";
import { runTutorTurn, type TurnEvent } from "./turn";
import { OWNER_LEARNER_ID } from "@/db/schema";
import { withoutChoices } from "@/test/choices";

// The Companion Widget code adds to a reply with none (E4a) is off here: this file tests other behaviour, and
// src/tutor/companion-turn.test.ts tests the companion.
vi.mock("./companion", () => ({ pickCompanion: () => null }));

// Seam 1, the Tutor Turn (spec #119, "Widgets › Written-ahead Widgets"): the Tutor opens a written-ahead Widget by id
// with open_widget; the opening is stored in the Session as an item, so the Widget comes back after a reload. In Percent
// as it was before its conversion (a fixture, with its old Widget) a Widget the Tutor draws with a growth-rate
// calculator is sent back through the correction turn, which names the written-ahead Widget to open instead.
const percent = oldPercentOnly();

async function collect(events: AsyncIterable<TurnEvent>) {
  const out: TurnEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

const text = (t: string) => ({ content: [{ type: "text", text: t }] });
const open = (id: string, toolId = "toolu_open") => ({ content: [{ type: "tool_use", id: toolId, name: "open_widget", input: { id } }] });
type Request = { messages: { role: string; content?: unknown }[] };
const toolResults = (request: Request) =>
  request.messages.flatMap((m) => (Array.isArray(m.content) ? (m.content as { type: string; content?: unknown; is_error?: boolean }[]).filter((b) => b.type === "tool_result") : []));
const contextOf = (request: Request) => JSON.stringify(request.messages);

describe("written-ahead Widgets in the Tutor Turn", () => {
  it("tells the Tutor the Topic's written-ahead Widgets by id and title, and that it opens them rather than drawing its own", async () => {
    const db = await testDb();
    const { client, requests } = scriptedClient([text("Hello.")]);
    await collect(runTutorTurn({ db, client, map: percent, learnerId: OWNER_LEARNER_ID }, "Hi"));
    expect(requests[0].tools.map((t) => t.name)).toContain("open_widget");
    expect(contextOf(requests[0])).toContain('Written-ahead Widgets for this Topic (open one with open_widget; never draw your own version): \\"One rate change, said three ways\\" (id rate-change-three-ways).');
  });

  it("opens one by id: the opening streams and is stored as an item in the Session, so it comes back after a reload", async () => {
    const db = await testDb();
    const { client, requests } = scriptedClient([open("rate-change-three-ways"), text("Move the old rate first.")]);
    const events = await collect(runTutorTurn({ db, client, map: percent, learnerId: OWNER_LEARNER_ID }, "Can I play with this?"));
    expect(events).toContainEqual({ type: "item", item: { kind: WIDGET_OPENED, data: { id: "rate-change-three-ways", title: "One rate change, said three ways" } } });
    const [result] = toolResults(requests[1]);
    expect(result.is_error).toBeFalsy();
    expect(String(result.content)).toMatch(/Opened by code: "One rate change, said three ways" is in the Widget panel/);
    // Its sliders and tasks, so the Tutor can point to them with numbers the Widget can show.
    expect(String(result.content)).toContain("$old (Old rate): 0 to 10 in steps of 0.01, starting at 5");
    expect(String(result.content)).toContain("Set a rise from 6% to 6.4%");

    const done = events.at(-1) as Extract<TurnEvent, { type: "done" }>;
    const thread = await loadThread(db, done.ref.sessionId, undefined, OWNER_LEARNER_ID);
    expect(withoutChoices(thread).map((e) => (e.role === "item" ? e.kind : e.role))).toEqual(["user", WIDGET_OPENED, "assistant"]);
  });

  it("shows the Tutor an opened written-ahead Widget's sliders and ticks with the Learner's next message, keyed by its id", async () => {
    const db = await testDb();
    const { client, requests } = scriptedClient([open("rate-change-three-ways"), text("Try a rise."), text("You set 6% to 6.4%.")]);
    await collect(runTutorTurn({ db, client, map: percent, learnerId: OWNER_LEARNER_ID }, "Can I play with this?"));
    const widgets = { "rate-change-three-ways": { values: { $old: 6, $new: 6.4 }, ticked: ["Set a rise from 6% to 6.4%"] } };
    await collect(runTutorTurn({ db, client, map: percent, widgets, learnerId: OWNER_LEARNER_ID }, "What rates do I have set?"));
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
    await collect(runTutorTurn({ db, client, map: percent, learnerId: OWNER_LEARNER_ID }, "Can I play with this?"));
    const ticked = ["Set a rise from 6% to 6.4%", "Now a cut from 8% to 7.1%", "Now a rise from 0.5% to 0.9%, and compare its percent change with the first rise"];
    const widgets = { "rate-change-three-ways": { values: { $old: 0.5, $new: 0.9 }, ticked } };
    await collect(runTutorTurn({ db, client, map: percent, widgets, learnerId: OWNER_LEARNER_ID }, { widgetReport: "rate-change-three-ways" }));
    const asked = JSON.stringify(requests.at(-1)!.messages);
    expect(asked).toContain("I set the old rate to 0.5% and the new rate to 0.9%. In percentage points: 0.4 points; In basis points: 40 bp; As a percent change of the old rate: 80%.");
  });

  it("refuses an id the Topic does not have, and stores nothing", async () => {
    const db = await testDb();
    const { client, requests } = scriptedClient([open("annuity-today"), text("Let me draw it instead.")]);
    const events = await collect(runTutorTurn({ db, client, map: percent, learnerId: OWNER_LEARNER_ID }, "Show me"));
    const [result] = toolResults(requests[1]);
    expect(result.is_error).toBe(true);
    expect(String(result.content)).toMatch(/Not opened: this Topic has no written-ahead Widget "annuity-today". Its written-ahead Widgets: rate-change-three-ways/);
    expect(withoutChoices(events).some((e) => e.type === "item")).toBe(false);
  });
});

// ADR 0001: the Learner plays with the explore Widget only once the concept is named, and code, not the Tutor's
// instructions, holds that. Present value's explore Widget is its written-ahead annuity Widget.
describe("the explore Widget before the explore step", () => {
  const pv = presentValueOnly({ withoutQuiz: true });

  it("refuses to open it at the story step, stores nothing, and leaves it off the Written-ahead Widgets line", async () => {
    const db = await testDb();
    const { client, requests } = scriptedClient([open("annuity-worth-today"), text("Let us start with the story.")]);
    const events = await collect(runTutorTurn({ db, client, map: pv, learnerId: OWNER_LEARNER_ID }, "Can I play with it?"));
    const [result] = toolResults(requests[1]);
    expect(result.is_error).toBe(true);
    expect(String(result.content)).toMatch(/Not opened: "What the annuity is worth today" is this Topic's explore Widget/);
    expect(withoutChoices(events).some((e) => e.type === "item")).toBe(false);
    expect(contextOf(requests[0])).not.toContain("annuity-worth-today");
  });

  it("opens it once the explore step has begun", async () => {
    const db = await testDb();
    for (const step of ["story", "concept"] as const) await saveFinishedStep(db, pv, step, new Date(), OWNER_LEARNER_ID);
    const { client, requests } = scriptedClient([open("annuity-worth-today"), text("Try the rate.")]);
    const events = await collect(runTutorTurn({ db, client, map: pv, learnerId: OWNER_LEARNER_ID }, "Can I play with it?"));
    expect(toolResults(requests[1])[0].is_error).toBeFalsy();
    expect(events).toContainEqual({ type: "item", item: { kind: WIDGET_OPENED, data: { id: "annuity-worth-today", title: "What the annuity is worth today" } } });
  });
});
