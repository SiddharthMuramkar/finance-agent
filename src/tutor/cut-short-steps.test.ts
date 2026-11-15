import { onPercentTopic } from "@/test/percent-topic";
import { asc, eq, sql } from "drizzle-orm";
import { APIError } from "openai";
import { describe, expect, it } from "vitest";
import { CONVERTED_TOPIC_DATA, topicFileOf } from "@/course/lesson-fixture";
import { loadCourseMap, parseCourseMap, type CourseMap } from "@/course/map";
import { navigate } from "@/course/navigator";
import { OWNER_LEARNER_ID, sessions, settings, usageRows } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadProgress, saveFinishedStep } from "@/learner/memory";
import { engineOff } from "@/test/engine-off";
import { testDb } from "@/test/pglite";
import { scriptedClient, type ScriptedOptions, type ScriptedReply } from "@/test/scripted-client";
import type { ComposeClient } from "./compose";
import { ENGINE_TOOLS_WITH_COMPOSE } from "./instructions";
import type { ModelClient } from "./model";
import { CAP_MESSAGES, dailyUse, UNPRICED_STEP_USD } from "./quota";
import { frozenNow, readSettings } from "./session-log";
import { runTutorTurn, type TurnDeps, type TurnEvent, type TurnInput } from "./turn";
import { requestStop } from "./turn-status";
import { loadStepUsages } from "./usage";

/**
 * A step cut short (review of PR #36, finding 2): OpenAI bills a request's prompt and what it wrote even when the turn
 * never reads its end. So every step whose model call started is saved in the Step ledger, however it ends: it uses up
 * a step, and with no usage report it is unpriced (cost null), which the daily caps count as UNPRICED_STEP_USD. A request
 * the API refused with an HTTP error ran no model and is billed nothing, so it stays as it was.
 */

/** The Show me Choice: a step-led turn, whose reply is held until checked (ADR 0008). */
const STEP_LED = "Show me.";
const never = new Promise<never>(() => {});
const say = (text: string): ScriptedReply => ({ content: [{ type: "text", text }] });
const writing = (text: string): ScriptedReply => ({ content: [{ type: "text", text }], holdAfterFirstText: never });

async function cap(db: Db, key: string, value: string) {
  await readSettings(db);
  await db.update(settings).set({ value }).where(eq(settings.key, key));
}

/** Runs a turn to its end, pressing Stop once the scripted client has been asked `stopAfter` times. */
async function turn(db: Db, input: TurnInput, replies: ScriptedReply[], o: { stopAfter?: number; deps?: Partial<TurnDeps>; client?: ScriptedOptions } = {}) {
  const { client, requests } = scriptedClient(replies, o.client);
  const events: TurnEvent[] = [];
  const running = (async () => {
    for await (const e of runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID, ...o.deps }, input)) events.push(e);
  })();
  if (o.stopAfter !== undefined) {
    while (requests.length < o.stopAfter) await new Promise((r) => setTimeout(r, 5));
    await requestStop(db, OWNER_LEARNER_ID);
  }
  await running;
  return { events, requests };
}

const doneOf = (events: TurnEvent[]) => {
  const done = events.at(-1);
  if (done?.type !== "done") throw new Error(`the turn ended with ${done?.type}`);
  return done;
};

describe("a step cut short", () => {
  it("by Stop is saved unpriced, and the Learner's next turn meets the dollar cap", async () => {
    const db = await onPercentTopic(await testDb());
    await cap(db, "usd_per_learner_day", "0.5");
    const { events } = await turn(db, STEP_LED, [writing("Here is the idea.")], { stopAfter: 1 });

    const done = doneOf(events);
    expect(done.stopReason).toBe("stopped");
    expect(await loadStepUsages(db, done.ref.sessionId, done.ref.turnSeq)).toEqual([
      expect.objectContaining({ step: 1, tools: [], inputTokens: 0, outputTokens: 0, costUsd: null, stopReason: "stopped" }),
    ]);
    expect((await dailyUse(db, OWNER_LEARNER_ID, new Date())).learnerUsd).toBeCloseTo(UNPRICED_STEP_USD);

    const next = await turn(db, "Hello", []);
    expect(next.events).toEqual([{ type: "over_limit", message: CAP_MESSAGES.learner_usd }]);
    expect(next.requests).toHaveLength(0);
  });
});

describe("a step cut short, then resumed", () => {
  it("by a cut-off is saved unpriced and uses up a step: the resumed run's step is the turn's last", async () => {
    const db = await onPercentTopic(await testDb());
    await cap(db, "steps_per_turn", "2");
    const first = await turn(db, STEP_LED, [{ content: [{ type: "text", text: "Lost." }], hold: never }], { deps: { timeBudgetMs: 3000 } });
    expect(first.events.at(-1)).toEqual({ type: "cut_off" });

    const resumed = await turn(db, { resume: true }, [say("On a 50 lakh loan the EMI is about 43,391 rupees a month.")]);
    // One step is left after the cut-off one, so it is sent with no tool choice: it writes the reply.
    expect(resumed.requests.map((r) => r.toolChoice)).toEqual(["none"]);
    const done = doneOf(resumed.events);
    expect((await loadStepUsages(db, done.ref.sessionId, done.ref.turnSeq)).map((s) => [s.step, s.stopReason, s.costUsd])).toEqual([
      [1, "cut_off", null],
      [2, "end_turn", 0],
    ]);
  });
});

describe("a failed step, then retried", () => {
  it("is saved unpriced and uses up a step", async () => {
    const db = await onPercentTopic(await testDb());
    await cap(db, "steps_per_turn", "2");
    const first = await turn(db, STEP_LED, [{ error: new Error("overloaded") }]);
    expect(first.events.at(-1)?.type).toBe("error");

    const retried = await turn(db, { resume: true }, [say("On a 50 lakh loan the EMI is about 43,391 rupees a month.")]);
    expect(retried.requests.map((r) => r.toolChoice)).toEqual(["none"]);
    const done = doneOf(retried.events);
    expect((await loadStepUsages(db, done.ref.sessionId, done.ref.turnSeq)).map((s) => [s.step, s.stopReason, s.costUsd])).toEqual([
      [1, "failed", null],
      [2, "end_turn", 0],
    ]);
  });
});

/** An OpenAI API error as the SDK builds it from an HTTP answer: the API refused the request before any model ran. */
const refused = (status: number, message: string) => APIError.generate(status, { error: { message, type: "server_error", param: null, code: null } }, message, new Headers());

describe("a request the API refused", () => {
  it("is no step: no model ran, so OpenAI billed nothing, and it neither uses a step nor counts in the caps", async () => {
    const db = await onPercentTopic(await testDb());
    await cap(db, "steps_per_turn", "2");
    const first = await turn(db, STEP_LED, [{ error: refused(503, "The engine is currently overloaded.") }]);
    expect(first.events.at(-1)?.type).toBe("error");
    expect((await dailyUse(db, OWNER_LEARNER_ID, new Date())).learnerUsd).toBe(0);

    const retried = await turn(db, { resume: true }, [say("On a 50 lakh loan the EMI is about 43,391 rupees a month.")]);
    // Both steps are still left, so the first is sent as usual.
    expect(retried.requests.map((r) => r.toolChoice)).toEqual([undefined]);
    const done = doneOf(retried.events);
    expect((await loadStepUsages(db, done.ref.sessionId, done.ref.turnSeq)).map((s) => [s.step, s.stopReason])).toEqual([[1, "end_turn"]]);
  });
});

/** A Session frozen with compose_widget in its tools, as an older build froze it (new Sessions are not offered it, ADR 0007). */
async function withCompose(db: Db) {
  await cap(db, "widget_engine", "on");
  const place = navigate(loadCourseMap(), await loadProgress(db, OWNER_LEARNER_ID));
  const frozen = await frozenNow(db, { tools: ENGINE_TOOLS_WITH_COMPOSE });
  await db.insert(sessions).values({ ...frozen, learnerId: OWNER_LEARNER_ID, topicId: place?.topic.id ?? null, older: false, createdAt: new Date() });
}

describe("compose_widget's call cut short", () => {
  it("by its time limit is saved unpriced, as a step of the turn", async () => {
    const db = await onPercentTopic(await testDb());
    await withCompose(db);
    // A compose model that never answers until its call is aborted.
    const hangs: ComposeClient = { create: (_, options) => new Promise((_, reject) => options?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true })) };
    const compose = { type: "tool_use", id: "toolu_cut_compose", name: "compose_widget", input: { brief: "Something unusual about growth", archetype: "Grow" } };
    const { events } = await turn(db, "Draw it", [{ content: [compose] }, say("I used a ready-made Widget.")], { deps: { composer: { client: hangs, limitMs: 50 } } });

    const done = doneOf(events);
    expect((await loadStepUsages(db, done.ref.sessionId, done.ref.turnSeq)).map((s) => [s.step, s.tools, s.stopReason, s.costUsd])).toEqual([
      [1, ["compose_widget"], "tool_use", 0],
      [2, ["compose_widget"], "timeout", null],
      [3, [], "end_turn", 0],
    ]);
  });

  it("refused by the API is priced at nothing: no model ran", async () => {
    const db = await onPercentTopic(await testDb());
    await withCompose(db);
    const refuses: ComposeClient = { create: () => Promise.reject(refused(500, "The server had an error.")) };
    const compose = { type: "tool_use", id: "toolu_refused_compose", name: "compose_widget", input: { brief: "Something unusual about growth", archetype: "Grow" } };
    const { events } = await turn(db, "Draw it", [{ content: [compose] }, say("I used a ready-made Widget.")], { deps: { composer: { client: refuses } } });

    const done = doneOf(events);
    expect((await loadStepUsages(db, done.ref.sessionId, done.ref.turnSeq)).map((s) => [s.step, s.tools, s.stopReason, s.costUsd])).toEqual([
      [1, ["compose_widget"], "tool_use", 0],
      [2, ["compose_widget"], "failed", 0],
      [3, [], "end_turn", 0],
    ]);
  });
});

describe("a compaction cut short", () => {
  it("the fold after a refreeze, when it fails, is saved unpriced as a step of the turn", async () => {
    const db = await testDb();
    await engineOff(db);
    await turn(db, "Hello", [say("One.")]);
    // As if the Session was frozen by an earlier build: the next turn folds its history first.
    await db.update(sessions).set({ fingerprint: "an-earlier-build", instructions: "Old instructions." });
    const { events, requests } = await turn(db, "Hello again", [{ error: new Error("overloaded") }, say("Two.")]);

    expect(requests.map((r) => r.compaction ?? false)).toEqual([true, false]);
    const done = doneOf(events);
    expect((await loadStepUsages(db, done.ref.sessionId, done.ref.turnSeq)).map((s) => [s.step, s.tools, s.stopReason, s.costUsd])).toEqual([
      [1, ["compaction"], "failed", null],
      [2, [], "end_turn", 0],
    ]);
  });

  it("the fold after a refreeze, when the Learner presses Stop, is saved unpriced and counts in the daily caps", async () => {
    const db = await testDb();
    await engineOff(db);
    await turn(db, "Hello", [say("One.")]);
    await db.update(sessions).set({ fingerprint: "an-earlier-build", instructions: "Old instructions." });
    // Stop while the fold's request is out: the turn ends before it has a turn seq.
    const { requests } = await turn(db, "Hello again", [{ content: [], hold: never }], { stopAfter: 1 });

    expect(requests.map((r) => r.compaction ?? false)).toEqual([true]);
    const rows = await db.select().from(usageRows).where(eq(usageRows.kind, "step")).orderBy(asc(usageRows.id));
    expect(rows.map((r) => [r.tools, r.stopReason, r.costUsd])).toEqual([
      [[], "end_turn", 0],
      [["compaction"], "stopped", null],
    ]);
    expect((await dailyUse(db, OWNER_LEARNER_ID, new Date())).learnerUsd).toBeCloseTo(UNPRICED_STEP_USD);
  });

  it("the fold after a refreeze, when the turn's time runs out, is saved unpriced: its resume's steps come after it", async () => {
    const db = await testDb();
    await engineOff(db);
    await cap(db, "steps_per_turn", "3");
    await turn(db, "Hello", [say("One.")]);
    await db.update(sessions).set({ fingerprint: "an-earlier-build", instructions: "Old instructions." });
    const first = await turn(db, "Hello again", [{ content: [], hold: never }], { deps: { timeBudgetMs: 3000 } });
    expect(first.events.at(-1)).toEqual({ type: "cut_off" });

    // The resume folds again (no summary came in), then writes the reply with the turn's last step.
    const resumed = await turn(db, { resume: true }, [say("Not a summary."), say("Two.")]);
    expect(resumed.requests.map((r) => [r.compaction ?? false, r.toolChoice])).toEqual([
      [true, undefined],
      [false, "none"],
    ]);
    const done = doneOf(resumed.events);
    expect((await loadStepUsages(db, done.ref.sessionId, done.ref.turnSeq)).map((s) => [s.step, s.tools, s.stopReason, s.costUsd])).toEqual([
      [1, ["compaction"], "cut_off", null],
      [2, ["compaction"], "compaction", 0],
      [3, [], "end_turn", 0],
    ]);
  });

  it("the compaction after a reply is saved before its summary is stored, so a failed store keeps its cost", async () => {
    const db = await onPercentTopic(await testDb());
    await cap(db, "compact_at_tokens", "1000");
    // The summary's row cannot be written (as when the database drops the connection).
    await db.execute(
      sql.raw(`create function no_summary() returns trigger language plpgsql as $$
        begin if new.content::text like '%The summary of the Session%' then raise exception 'the database went away'; end if; return new; end $$`),
    );
    await db.execute(sql.raw(`create trigger no_summary before insert on messages for each row execute function no_summary()`));
    const long: ScriptedReply = { ...say("An EMI is the same payment every month."), usage: { input_tokens: 2005, input_tokens_details: { cached_tokens: 2000 }, output_tokens: 50 } };
    const summary: ScriptedReply = { content: [{ type: "compaction", items: [{ type: "compaction", encrypted_content: "The summary of the Session." }] }], usage: { input_tokens: 2055, output_tokens: 40 } };
    const { events, requests } = await turn(db, "What is an EMI?", [long, summary]);

    expect(requests.map((r) => r.compaction ?? false)).toEqual([false, true]);
    const done = doneOf(events);
    expect((await loadStepUsages(db, done.ref.sessionId, done.ref.turnSeq)).map((s) => [s.step, s.tools, s.stopReason, s.costUsd !== null && s.costUsd > 0])).toEqual([
      [1, [], "end_turn", true],
      [2, ["compaction"], "compaction", true],
    ]);
  });

  it("the compaction after a reply, when the turn's time runs out, is saved unpriced as a step of the turn", async () => {
    const db = await onPercentTopic(await testDb());
    await cap(db, "compact_at_tokens", "1000");
    // A reply past the compaction point, then a compaction that never answers until the turn's time runs out.
    const long: ScriptedReply = { ...say("An EMI is the same payment every month."), usage: { input_tokens: 2005, input_tokens_details: { cached_tokens: 2000 }, output_tokens: 50 } };
    const { events, requests } = await turn(db, "What is an EMI?", [long, { content: [], hold: never }], { deps: { timeBudgetMs: 16_000 } });

    expect(requests.map((r) => r.compaction ?? false)).toEqual([false, true]);
    const done = doneOf(events);
    expect((await loadStepUsages(db, done.ref.sessionId, done.ref.turnSeq)).map((s) => [s.step, s.tools, s.stopReason, s.costUsd === null])).toEqual([
      [1, [], "end_turn", false],
      [2, ["compaction"], "cut_off", true],
    ]);
  });
});

/** The converted lesson fixture, with a Learner at its Your turn: a typed question there streams behind the stream guard (A5). */
const lesson = parseCourseMap([topicFileOf(CONVERTED_TOPIC_DATA)]).map as CourseMap;
async function atYourTurn(db: Db) {
  await turn(db, "Hi", [say("In 1994 the Fed held its rate at 3%.")], { deps: { map: lesson } });
  await saveFinishedStep(db, lesson, "story", new Date(), OWNER_LEARNER_ID);
  await saveFinishedStep(db, lesson, "concept", new Date(), OWNER_LEARNER_ID);
  await turn(db, "Ready.", [say("Here is your first try.")], { deps: { map: lesson } });
}

describe("a streamed step cut short", () => {
  it("by the stream guard is saved unpriced", async () => {
    const db = await testDb();
    await atYourTurn(db);
    const { events, requests } = await turn(db, "Where am I in the Topic?", [say("You are practising basis points. This is the your_turn step of the Topic. More to come.")], {
      deps: { map: lesson },
      client: { deltaChars: 9 },
    });

    expect(requests).toHaveLength(1);
    const done = doneOf(events);
    expect(await loadStepUsages(db, done.ref.sessionId, done.ref.turnSeq)).toEqual([expect.objectContaining({ step: 1, costUsd: null, stopReason: "guard" })]);
  });

  it("after its response had finished is priced from the usage the response reported", async () => {
    const db = await testDb();
    await atYourTurn(db);
    const scripted = scriptedClient([{ ...say("You are practising basis points. This is the your_turn step of the Topic."), usage: { input_tokens: 1000, output_tokens: 50 } }]);
    // Like the real client (openai.ts): a response that has finished keeps its result when the turn aborts it afterwards.
    const finished: ModelClient = { ...scripted.client, step: (request) => scripted.client.step(request) };
    const events: TurnEvent[] = [];
    for await (const e of runTutorTurn({ db, client: finished, map: lesson, learnerId: OWNER_LEARNER_ID }, "Where am I in the Topic?")) events.push(e);

    const done = doneOf(events);
    const [step] = await loadStepUsages(db, done.ref.sessionId, done.ref.turnSeq);
    expect(step).toMatchObject({ step: 1, inputTokens: 1000, outputTokens: 50, stopReason: "guard" });
    expect(step.costUsd).toBeGreaterThan(0);
  });
});
