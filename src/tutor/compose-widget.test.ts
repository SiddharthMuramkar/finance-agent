import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { OWNER_LEARNER_ID, settings, usageRows } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadWidgetState } from "@/learner/widget-state";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { recipeById } from "@/widgets/recipes";
import { WIDGET_SHOWN, type ShownWidget } from "@/widgets/shown-widget";
import { composeLimitMs, composePrompt, programIn, type ComposeClient, type ComposeRequest } from "./compose";
import { ENGINE_TOOLS } from "./instructions";
import { DEFAULT_SETTINGS, readSettings } from "./session-log";
import { runTutorTurn, type TurnEvent } from "./turn";

// The free-form lane and updates in place (UX audit ★.4): compose_widget and update_widget at the Tutor Turn seam.

async function collect(events: AsyncIterable<TurnEvent>) {
  const out: TurnEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

async function engineOn(db: Db) {
  await readSettings(db);
  await db.update(settings).set({ value: "on" }).where(eq(settings.key, "widget_engine"));
}

const text = (t: string) => ({ type: "text", text: t });
const call = (name: string, input: unknown, id: string) => ({ type: "tool_use", id, name, input });
type Request = { messages: { role: string; content?: unknown }[] };
const toolResults = (request: Request) =>
  request.messages.flatMap((m) => (Array.isArray(m.content) ? (m.content as { type: string; content?: unknown; is_error?: boolean }[]).filter((b) => b.type === "tool_result") : []));

const SIP = {
  title: "₹1,000 a month in a SIP",
  inputs: { calculator: "sip", currency: "inr", held: { monthly: 1000, ratePercent: 10 }, slider: { input: "years", label: "Years you keep investing", unit: "years", min: 1, max: 30, step: 1, start: 10 } },
  refs: {},
  facts: {},
};
const built = recipeById("grow_money")!.build({ ...SIP, title: "A SIP drawn free-form" });
const PROGRAM = built.ok ? built.code : "";

/** A compose client that answers with the program, or never answers until it is aborted. */
function composeStub(reply: "program" | "hang" | "junk") {
  const calls: ComposeRequest[] = [];
  const client: ComposeClient = {
    messages: {
      create: (params, options) => {
        calls.push(params);
        if (reply === "hang") {
          return new Promise((_, reject) => options?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
        }
        const body = reply === "program" ? "```openui-lang\n" + PROGRAM + "\n```" : "Sorry, I cannot.";
        return Promise.resolve({ content: [{ type: "text", text: body }], stop_reason: "end_turn", usage: { input_tokens: 3000, output_tokens: 400 } });
      },
    },
  };
  return { client, calls };
}

const shownItem = (events: TurnEvent[]) => (events.find((e) => e.type === "item" && e.item.kind === WIDGET_SHOWN) as Extract<TurnEvent, { type: "item" }> | undefined)?.item.data as ShownWidget | undefined;

describe("compose_widget", () => {
  it("is an engine tool, with the compose model a setting that defaults to Sonnet", async () => {
    expect(ENGINE_TOOLS.map((t) => t.name)).toEqual(expect.arrayContaining(["show_widget", "compose_widget", "update_widget"]));
    expect(DEFAULT_SETTINGS.widget_compose_model).toBe("claude-sonnet-5-5");
    expect((await readSettings(await testDb())).composeModel).toBe("claude-sonnet-5-5");
  });

  it("slims the Widget instructions to the archetype and the parts it must use", () => {
    const check = composePrompt("Check");
    expect(check).toContain("QuickCheck(");
    expect(check).not.toContain("\n### Charts\n");
    expect(check).not.toContain("## Inline Mode");
    expect(composePrompt("Check", ["LineChart"])).toContain("\n### Charts\n");
    expect(composePrompt("Formula").length).toBeLessThan(composePrompt("History").length);
  });

  it("limits the call to 12 s, less near the turn's deadline", () => {
    expect(composeLimitMs(undefined, 0)).toBe(12_000);
    expect(composeLimitMs(100_000, 0)).toBe(12_000);
    expect(composeLimitMs(20_000, 0)).toBe(5_000);
    expect(composeLimitMs(10_000, 0)).toBe(0);
    expect(programIn("```openui-lang\nroot = Widget(\"x\", [])\n```")).toBe('root = Widget("x", [])');
    expect(programIn("No program here.")).toBeNull();
  });

  it("shows the compose model's Widget, with its timing, and counts its usage as a step of the turn", async () => {
    const db = await testDb();
    await engineOn(db);
    const compose = composeStub("program");
    const { client, requests } = scriptedClient([
      { content: [call("compose_widget", { brief: "A SIP the Learner stretches over the years", archetype: "Grow", mustUse: ["Calculator"] }, "toolu_c")] },
      { content: [text("Drag the years.")] },
    ]);
    const progress: { label: string }[] = [];
    const events = await collect(
      runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID, composer: { client: compose.client }, notify: (e) => progress.push(e) }, "Draw me something new"),
    );
    expect(compose.calls).toHaveLength(1);
    expect(compose.calls[0].model).toBe("claude-sonnet-5-5");
    const shown = shownItem(events)!;
    expect(shown).toMatchObject({ id: "toolu_c", source: "compose", title: "A SIP drawn free-form", code: PROGRAM });
    expect(shown.timings?.composeMs).toBeGreaterThanOrEqual(0);
    expect(shown.timings?.fallbackReason).toBeUndefined();
    expect(progress).toContainEqual({ type: "progress", label: "Drawing your Widget…" });
    const result = toolResults(requests[1]).at(-1)!;
    expect(result.is_error).toBeFalsy();
    expect(String(result.content)).toMatch(/drawn free-form, is in the Widget panel/);

    const steps = await db.select().from(usageRows).where(eq(usageRows.kind, "step"));
    expect(steps.map((s) => s.step).sort()).toEqual([1, 2, 3]);
    const composeStep = steps.find((s) => s.tools.includes("compose_widget") && s.model === "claude-sonnet-5-5")!;
    expect(composeStep).toMatchObject({ inputTokens: 3000, outputTokens: 400 });
    const done = events.at(-1) as Extract<TurnEvent, { type: "done" }>;
    expect(done.usage.inputTokens).toBeGreaterThanOrEqual(3000);
  });

  it("falls back to the closest recipe on a timeout, and says so in one line", async () => {
    const db = await testDb();
    await engineOn(db);
    const compose = composeStub("hang");
    const { client, requests } = scriptedClient([
      { content: [call("compose_widget", { brief: "Something unusual about growth", archetype: "Grow" }, "toolu_t")] },
      { content: [text("I used a ready-made Widget.")] },
    ]);
    const events = await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID, composer: { client: compose.client, limitMs: 50 } }, "Draw it"));
    const shown = shownItem(events)!;
    expect(shown.source).toBe("fallback");
    expect(recipeById(shown.recipe)?.archetype).toBe("Grow");
    expect(shown.timings?.fallbackReason).toBe("timeout");
    const result = toolResults(requests[1]).at(-1)!;
    expect(result.is_error).toBeFalsy();
    expect(String(result.content)).toMatch(/ready-made Widget .* because drawing it took too long/);
    expect(events.at(-1)?.type).toBe("done");
  });

  it("uses the Tutor's own fallback when the reply holds no program", async () => {
    const db = await testDb();
    await engineOn(db);
    const compose = composeStub("junk");
    const { client } = scriptedClient([
      { content: [call("compose_widget", { brief: "x", archetype: "Compare", fallback: { recipe: "grow_money", params: SIP } }, "toolu_j")] },
      { content: [text("Here.")] },
    ]);
    const events = await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID, composer: { client: compose.client } }, "Draw it"));
    expect(shownItem(events)).toMatchObject({ source: "fallback", recipe: "grow_money", title: SIP.title, timings: { fallbackReason: "failed" } });
  });

  it("a resume after the turn failed does not ask the compose model again", async () => {
    const db = await testDb();
    await engineOn(db);
    const compose = composeStub("program");
    const first = scriptedClient([{ content: [call("compose_widget", { brief: "A SIP", archetype: "Grow" }, "toolu_r")] }, { error: new Error("overloaded") }]);
    const failed = await collect(runTutorTurn({ db, client: first.client, learnerId: OWNER_LEARNER_ID, composer: { client: compose.client } }, "Draw it"));
    expect(failed.at(-1)?.type).toBe("error");
    const resume = scriptedClient([{ content: [text("Here it is.")] }]);
    const resumed = await collect(runTutorTurn({ db, client: resume.client, learnerId: OWNER_LEARNER_ID, composer: { client: compose.client } }, { resume: true }));
    expect(resumed.at(-1)?.type).toBe("done");
    expect(compose.calls).toHaveLength(1);
    expect(shownItem(resumed)).toBeUndefined();
  });
});

describe("update_widget", () => {
  async function withSip() {
    const db = await testDb();
    await engineOn(db);
    const first = scriptedClient([{ content: [call("show_widget", { recipe: "grow_money", params: SIP }, "toolu_s")] }, { content: [text("Move the years.")] }]);
    const events = await collect(runTutorTurn({ db, client: first.client, learnerId: OWNER_LEARNER_ID }, "Show me a SIP"));
    const done = events.at(-1) as Extract<TurnEvent, { type: "done" }>;
    return { db, sessionId: done.ref.sessionId };
  }

  it("moves an open Widget's slider: saves its state, keeps its ticks, and streams widget_state", async () => {
    const { db, sessionId } = await withSip();
    const { client, requests } = scriptedClient([{ content: [call("update_widget", { key: SIP.title, values: { $years: 25 } }, "toolu_u")] }, { content: [text("Now 25 years.")] }]);
    const widgets = { [SIP.title]: { values: { $years: 12 }, ticked: ["An earlier tick"] } };
    const events = await collect(runTutorTurn({ db, client, widgets, learnerId: OWNER_LEARNER_ID }, "Make it 25 years"));
    expect(events).toContainEqual({ type: "widget_state", widgetKey: SIP.title, values: { $years: 25 } });
    expect(await loadWidgetState(db, sessionId, SIP.title, OWNER_LEARNER_ID)).toEqual({ values: { $years: 25 }, ticked: ["An earlier tick"] });
    const result = toolResults(requests[1]).at(-1)!;
    expect(result.is_error).toBeFalsy();
    expect(String(result.content)).toMatch(/now shows \$years = 25/);
  });

  it("refuses a key that is not open, a value out of range and a name that is not a slider, and never ticks", async () => {
    const { db, sessionId } = await withSip();
    const { client, requests } = scriptedClient([
      { content: [call("update_widget", { key: "Nothing like this", values: { $years: 5 } }, "toolu_k")] },
      { content: [call("update_widget", { key: SIP.title, values: { years: 40 } }, "toolu_r")] },
      { content: [call("update_widget", { key: SIP.title, values: { $ticked: 1 } }, "toolu_n")] },
      { content: [text("Let me explain instead.")] },
    ]);
    const events = await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "Change it"));
    const results = [toolResults(requests[1]).at(-1)!, toolResults(requests[2]).at(-1)!, toolResults(requests[3]).at(-1)!];
    expect(results.every((r) => r.is_error)).toBe(true);
    expect(String(results[0].content)).toMatch(/no open Widget has the key "Nothing like this". Open Widgets: "₹1,000 a month in a SIP"/);
    expect(String(results[1].content)).toMatch(/\$years must be from 1 to 30/);
    expect(String(results[2].content)).toMatch(/\$ticked is not one of its sliders/);
    expect(events.some((e) => e.type === "widget_state")).toBe(false);
    expect(await loadWidgetState(db, sessionId, SIP.title, OWNER_LEARNER_ID)).toBeUndefined();
  });
});
