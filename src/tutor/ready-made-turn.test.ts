import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { WIDGET_OPENED } from "@/course/written-ahead";
import { OWNER_LEARNER_ID, sessions } from "@/db/schema";
import type { Db } from "@/db/types";
import { saveFinishedStep } from "@/learner/memory";
import { checkTabNow } from "@/learner/quiz";
import { loadWidgetState, saveWidgetState } from "@/learner/widget-state";
import { presentValueOnly } from "@/test/present-value-map";
import { testDb } from "@/test/pglite";
import { scriptedClient, type ScriptedReply } from "@/test/scripted-client";
import { recipeById } from "@/widgets/recipes";
import { WIDGET_SHOWN } from "@/widgets/shown-widget";
import { ENGINE_TOOLS, ENGINE_TOOLS_WITH_COMPOSE } from "./instructions";
import { fingerprint, frozenNow, readSettings, refreezeIfChanged } from "./session-log";
import { toolCode } from "./tools";
import { runTutorTurn, type TurnEvent, type TurnInput } from "./turn";

// Seam 1, the Tutor Turn (spec #229, ticket #242, ADR 0007): ready-made Widgets only, opened already set, one a reply.
// present-value's annuity-worth-today Widget has a $rate slider (0 to 10, in 0.01 steps) and a $years-less program.

const map = presentValueOnly({ withoutInsight: true });
const text = (t: string) => ({ type: "text", text: t });
const call = (name: string, input: unknown, id: string) => ({ type: "tool_use", id, name, input });
const open = (input: Record<string, unknown>, id = "toolu_open") => call("open_widget", { id: "annuity-worth-today", ...input }, id);
type Request = { messages: { role: string; content?: unknown }[]; tools: { name: string }[] };
const toolResults = (request: Request) =>
  request.messages.flatMap((m) => (Array.isArray(m.content) ? (m.content as { type: string; content?: unknown; is_error?: boolean }[]).filter((b) => b.type === "tool_result") : []));

const SIP = {
  title: "₹1,000 a month in a SIP",
  inputs: { calculator: "sip", currency: "inr", held: { monthly: 1000, ratePercent: 10 }, slider: { input: "years", label: "Years you keep investing", unit: "years", min: 1, max: 30, step: 1, start: 10 } },
  refs: {},
  facts: {},
};
const show = (recipe: string, params: unknown, id = "toolu_show") => call("show_widget", { recipe, params }, id);

async function run(db: Db, replies: ScriptedReply[], input: TurnInput = "Show me", widgets?: Record<string, { values: Record<string, number>; ticked: string[] }>) {
  const { client, requests } = scriptedClient(replies);
  const events: TurnEvent[] = [];
  for await (const e of runTutorTurn({ db, client, map, widgets, learnerId: OWNER_LEARNER_ID }, input)) events.push(e);
  const done = events.at(-1) as Extract<TurnEvent, { type: "done" }>;
  return { events, requests, sessionId: done.ref?.sessionId as number };
}
const say = (t: string): ScriptedReply => ({ content: [text(t)] });
const items = (events: TurnEvent[]) => events.flatMap((e) => (e.type === "item" ? [e.item] : []));

describe("a new Session's tools", () => {
  it("freezes show_widget, open_widget and update_widget, without compose_widget and without quick_check", async () => {
    const db = await testDb();
    expect((await readSettings(db)).widgetEngine).toBe("on");
    const { requests } = await run(db, [say("Hello.")], "Hi");
    const names = requests[0].tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["show_widget", "open_widget", "update_widget"]));
    expect(names).not.toContain("compose_widget");
    const system = JSON.stringify(requests[0]);
    expect(system).not.toContain("- quick_check (");
    expect(system).toContain("- rate_move (");
  });

  it("a Session stored with compose_widget keeps it on refreeze, and its code stays bound so a saved call resumes", async () => {
    const db = await testDb();
    const { sessionId } = await run(db, [say("Hello.")], "Hi");
    // The Session as an older build froze it: the engine's tools with compose_widget.
    await db.update(sessions).set({ tools: ENGINE_TOOLS_WITH_COMPOSE, fingerprint: "an older freeze" }).where(eq(sessions.id, sessionId));
    const [stored] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
    const refrozen = await refreezeIfChanged(db, stored);
    expect((refrozen.tools as { name: string }[]).map((t) => t.name)).toContain("compose_widget");
    expect(refrozen.fingerprint).toBe(fingerprint(refrozen.instructions, ENGINE_TOOLS_WITH_COMPOSE));
    // A Session without it does not get it back or gain it.
    expect((await frozenNow(db, { tools: ENGINE_TOOLS })).tools.map((t) => t.name)).not.toContain("compose_widget");
    const code = toolCode(db, map, () => new Date(), "m", { saveFailed: false }, { id: 1, learnerId: OWNER_LEARNER_ID });
    expect(Object.keys(code)).toContain("compose_widget");
  });
});

describe("one Widget per reply", () => {
  it("refuses open_widget after show_widget", async () => {
    const db = await testDb();
    const { events, requests } = await run(db, [{ content: [show("grow_money", SIP), open({ preset: { $rate: 4 } })] }, say("One is enough.")]);
    const [shown, opened] = toolResults(requests[1]);
    expect(shown.is_error).toBeFalsy();
    expect(opened.is_error).toBe(true);
    expect(String(opened.content)).toMatch(/already has a Widget/);
    expect(items(events).map((i) => i.kind)).toEqual([WIDGET_SHOWN]);
  });

  it("refuses show_widget after open_widget", async () => {
    const db = await testDb();
    const { events, requests } = await run(db, [{ content: [open({}), show("grow_money", SIP)] }, say("One is enough.")]);
    const [opened, shown] = toolResults(requests[1]);
    expect(opened.is_error).toBeFalsy();
    expect(shown.is_error).toBe(true);
    expect(String(shown.content)).toMatch(/already has a Widget/);
    expect(items(events).map((i) => i.kind)).toEqual([WIDGET_OPENED]);
  });

  it("refuses a second open_widget in the same reply", async () => {
    const db = await testDb();
    const { requests } = await run(db, [{ content: [open({}, "toolu_a"), open({ preset: { $rate: 4 } }, "toolu_b")] }, say("One is enough.")]);
    const [first, second] = toolResults(requests[1]);
    expect(first.is_error).toBeFalsy();
    expect(second.is_error).toBe(true);
    expect(String(second.content)).toMatch(/already has a Widget/);
  });

  it("counts the Widget an update_widget moved, unless it moves the Widget this reply opened", async () => {
    const db = await testDb();
    const first = await run(db, [{ content: [show("grow_money", SIP)] }, say("Move the years.")]);
    // A later reply updates that Widget (its one), so opening another in the same reply is refused.
    const next = await run(db, [{ content: [call("update_widget", { key: SIP.title, values: { $years: 12 } }, "toolu_u"), open({})] }, say("Done.")], "Make it 12 years");
    const [updated, opened] = toolResults(next.requests[1]).slice(-2);
    expect(updated.is_error).toBeFalsy();
    expect(opened.is_error).toBe(true);
    expect(String(opened.content)).toMatch(/already has a Widget/);
    expect(first.sessionId).toBe(next.sessionId);
    // A reply that opened a Widget may move that same Widget.
    const same = await run(db, [{ content: [open({}, "toolu_o2"), call("update_widget", { key: "annuity-worth-today", values: { $rate: 7 } }, "toolu_u2")] }, say("Done.")], "Again");
    const results = toolResults(same.requests[1]).slice(-2);
    expect(results.map((r) => r.is_error ?? false)).toEqual([false, false]);
  });
});

describe("open_widget with a preset", () => {
  it("opens at those values: the item records the preset, the Widget state replaces the Learner's last settings and keeps ticks, and the browser is told", async () => {
    const db = await testDb();
    const earlier = await run(db, [say("Welcome.")], "Hi");
    await saveWidgetState(db, { sessionId: earlier.sessionId, widgetKey: "annuity-worth-today", values: { $rate: 9 }, ticked: ["Set the rate to 0%: the payments are worth the advertised $1.537B"] }, OWNER_LEARNER_ID);
    const { events, requests } = await run(db, [{ content: [open({ preset: { rate: 4 } })] }, say("At four percent the later payments shrink a lot.")], "Show me the annuity");
    expect(items(events)).toEqual([{ kind: WIDGET_OPENED, data: { id: "annuity-worth-today", title: "What the annuity is worth today", preset: { $rate: 4 } } }]);
    expect(events).toContainEqual({ type: "widget_state", widgetKey: "annuity-worth-today", values: { $rate: 4 } });
    expect(await loadWidgetState(db, earlier.sessionId, "annuity-worth-today", OWNER_LEARNER_ID)).toEqual({
      values: { $rate: 4 },
      ticked: ["Set the rate to 0%: the payments are worth the advertised $1.537B"],
    });
    const result = String(toolResults(requests[1])[0].content);
    expect(result).toContain("It is set to $rate = 4.");
    expect(result).toContain("do not ask the Learner to move or set anything");
    expect(result).toContain("optional play, never set as work");
  });

  it("refuses an unknown slider, an out-of-range value and an off-step value, and stores nothing", async () => {
    const db = await testDb();
    const { events, requests } = await run(db, [
      { content: [open({ preset: { $price: 3 } }, "toolu_1")] },
      { content: [open({ preset: { $rate: 12 } }, "toolu_2")] },
      { content: [open({ preset: { $rate: 3.005 } }, "toolu_3")] },
      say("In words, then."),
    ]);
    const results = [1, 2, 3].map((n) => toolResults(requests[n]).at(-1)!);
    expect(results.every((r) => r.is_error)).toBe(true);
    expect(String(results[0].content)).toMatch(/\$price is not one of its sliders/);
    expect(String(results[1].content)).toMatch(/must be from 0 to 10/);
    expect(String(results[2].content)).toMatch(/not on a step of 0.01/);
    expect(items(events)).toEqual([]);
    expect(events.some((e) => e.type === "widget_state")).toBe(false);
  });

  it("refuses a preset at an open question's numbers, and takes one at other numbers", async () => {
    const db = await testDb();
    await run(db, [say("Once, a lottery winner had a choice.")], "Hi");
    for (const step of ["story", "concept", "your_turn"] as const) await saveFinishedStep(db, map, step, new Date(), OWNER_LEARNER_ID);
    expect((await checkTabNow(db, map, new Date(), OWNER_LEARNER_ID)).quiz).toBeTruthy();
    const { events, requests } = await run(db, [{ content: [open({ preset: { $rate: 10 } }, "toolu_blocked")] }, { content: [open({ preset: { $rate: 4 } }, "toolu_fine")] }, say("Here is the idea at four percent.")]);
    const [blocked] = toolResults(requests[1]);
    expect(blocked.is_error).toBe(true);
    expect(String(blocked.content)).toMatch(/set to 10, from the open quiz/);
    const fine = toolResults(requests[2]).at(-1)!;
    expect(fine.is_error).toBeFalsy();
    expect(items(events).map((i) => i.kind)).toEqual([WIDGET_OPENED]);
  });
});

describe("show_widget refusals and resets", () => {
  it("refuses quick_check, and tells the Tutor to point to the next Quick try", async () => {
    const db = await testDb();
    const { events, requests } = await run(db, [{ content: [show("quick_check", { title: "A quick check", inputs: { questions: [] }, refs: {}, facts: {} })] }, say("Here is a question in words.")]);
    const [result] = toolResults(requests[1]);
    expect(result.is_error).toBe(true);
    expect(String(result.content)).toContain("Not shown: quick_check is not used to teach a Topic. For 'quiz me', point to the next Quick try, or ask one question in words.");
    expect(items(events)).toEqual([]);
  });

  it("refuses a fact that an input of the same recipe covers, naming the input to use", async () => {
    const db = await testDb();
    // A session frozen with percent_points can still call it; its one fact, the earlier rate, is where the slider starts.
    const params = recipeById("percent_points")!.examples[2];
    const { events, requests } = await run(db, [{ content: [show("percent_points", params)] }, say("Words, then.")]);
    const [result] = toolResults(requests[1]);
    expect(result.is_error).toBe(true);
    expect(String(result.content)).toMatch(/facts\.before is covered: inputs\.slider\.start/);
    expect(items(events)).toEqual([]);
  });

  it("a shown Widget whose title already has saved state opens at the recipe's own numbers", async () => {
    const db = await testDb();
    const first = await run(db, [{ content: [show("grow_money", SIP)] }, say("Move the years.")]);
    const widgets = { [SIP.title]: { values: { $years: 25 }, ticked: ["An earlier tick"] } };
    await saveWidgetState(db, { sessionId: first.sessionId, widgetKey: SIP.title, values: { $years: 25 }, ticked: ["An earlier tick"] }, OWNER_LEARNER_ID);
    const later = await run(db, [{ content: [show("grow_money", SIP, "toolu_again")] }, say("Back to ten years.")], "Show it again", widgets);
    expect(later.events).toContainEqual({ type: "widget_state", widgetKey: SIP.title, values: { $years: 10 } });
    expect(await loadWidgetState(db, first.sessionId, SIP.title, OWNER_LEARNER_ID)).toEqual({ values: { $years: 10 }, ticked: ["An earlier tick"] });
  });
});

describe("the context after a move", () => {
  it("names the new step's word limit in finish_teaching_step's result", async () => {
    const db = await testDb();
    await run(db, [say("Once, a lottery winner had a choice.")], "Hi");
    const { requests } = await run(db, [{ content: [call("finish_teaching_step", { step: "story" }, "toolu_fin")] }, say("Now the idea.")], "Got it");
    const [result] = toolResults(requests[1]);
    expect(result.is_error).toBeFalsy();
    expect(String(result.content)).toContain("Word limit for this reply: 80 words.");
  });
});
