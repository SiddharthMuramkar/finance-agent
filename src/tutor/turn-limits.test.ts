import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { OWNER_LEARNER_ID, sessions, settings, turns } from "@/db/schema";
import type { Db } from "@/db/types";
import { onPercentTopic } from "@/test/percent-topic";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { RESUME_LIMIT_MESSAGE } from "./quota";
import { readSettings } from "./session-log";
import { runTutorTurn, STEP_LIMIT, type TurnEvent } from "./turn";
import { loadStepUsages } from "./usage";

/** The per-turn limits (decision #13) through a whole Tutor Turn: the step limit (its Step ledger) and the resume limit. */

/** The Show me Choice: a step-led turn, whose reply is held until checked (ADR 0008). */
const STEP_LED = "Show me.";
const emi = { type: "tool_use", id: "toolu_limit_emi", name: "calculate", input: { calculator: "emi", inputs: { principal: 5_000_000, ratePercent: 8.5, years: 20 } } };
const reply = { type: "text", text: "On a 50 lakh loan at 8.5% for 20 years, the EMI is about 43,391 rupees a month." };

async function collect(events: AsyncGenerator<TurnEvent>) {
  const out: TurnEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

async function cap(db: Db, key: string, value: string) {
  await readSettings(db);
  await db.update(settings).set({ value }).where(eq(settings.key, key));
}

describe("the step limit", () => {
  it("sends the last step it allows with no tool choice, so it writes the reply, and takes no step past it", async () => {
    const db = await onPercentTopic(await testDb());
    await cap(db, "steps_per_turn", "2");
    const { client, requests } = scriptedClient([{ content: [emi] }, { content: [reply] }]);
    const events = await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, STEP_LED));

    expect(requests.map((r) => r.toolChoice)).toEqual([undefined, "none"]);
    const done = events.at(-1);
    if (done?.type !== "done") throw new Error(`the turn ended with ${done?.type}`);
    expect((await loadStepUsages(db, done.ref.sessionId, done.ref.turnSeq)).map((s) => s.step)).toEqual([1, 2]);
  });

  it("skips the compaction after a reply that used the last step, so no step goes past the limit", async () => {
    // A reply past the compaction point; the summary is scripted, so a compaction that ran would be saved as a step.
    const long = { content: [reply], usage: { input_tokens: 2005, input_tokens_details: { cached_tokens: 2000 }, output_tokens: 50 } };
    const summary = { content: [{ type: "compaction", items: [{ type: "compaction", id: "cmp_1", encrypted_content: "Summary." }] }], stop_reason: "compaction", usage: { input_tokens: 2100, output_tokens: 300 } };
    const compactedWith = async (steps: string) => {
      const db = await onPercentTopic(await testDb());
      await cap(db, "steps_per_turn", steps);
      await cap(db, "compact_at_tokens", "1000");
      const { client, requests } = scriptedClient([long, summary]);
      const done = (await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "What is an EMI?"))).at(-1);
      if (done?.type !== "done") throw new Error(`the turn ended with ${done?.type}`);
      return { compactions: requests.filter((r) => r.compaction).length, steps: (await loadStepUsages(db, done.ref.sessionId, done.ref.turnSeq)).map((s) => s.tools) };
    };
    expect(await compactedWith("1")).toEqual({ compactions: 0, steps: [[]] });
    // With a step left, the same turn compacts.
    expect(await compactedWith("2")).toEqual({ compactions: 1, steps: [[], ["compaction"]] });
  });

  it("does not limit the evals' turn", async () => {
    const db = await onPercentTopic(await testDb());
    await cap(db, "steps_per_turn", "1");
    const { client, requests } = scriptedClient([{ content: [emi] }, { content: [reply] }]);
    await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID, noLimits: true }, STEP_LED));
    expect(requests.map((r) => r.toolChoice)).toEqual([undefined, undefined]);
  });
});

describe("the step limit after a refreeze's fold (decision #30)", () => {
  it("with no step left after the fold, sends no request for the reply, and the turn still ends with a reply", async () => {
    const db = await onPercentTopic(await testDb());
    await collect(runTutorTurn({ db, client: scriptedClient([{ content: [reply] }]).client, learnerId: OWNER_LEARNER_ID }, "What is an EMI?"));
    // A deploy changed the instructions: the next turn refreezes the Session and folds its history first, which is a step.
    await db.update(sessions).set({ fingerprint: "an-earlier-build" });
    await cap(db, "steps_per_turn", "1");
    const summary = { content: [{ type: "compaction", items: [{ type: "compaction", id: "cmp_1", encrypted_content: "Summary." }] }], stop_reason: "compaction", usage: { input_tokens: 2100, output_tokens: 300 } };
    const { client, requests } = scriptedClient([summary]);
    const events = await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "And for 10 years?"));

    expect(requests.map((r) => Boolean(r.compaction))).toEqual([true]);
    const done = events.at(-1);
    if (done?.type !== "done") throw new Error(`the turn ended with ${done?.type}`);
    expect(done.stopReason).toBe(STEP_LIMIT);
    expect((await loadStepUsages(db, done.ref.sessionId, done.ref.turnSeq)).map((s) => s.tools)).toEqual([["compaction"]]);
    expect((await db.select({ status: turns.status, stopReason: turns.stopReason }).from(turns)).at(-1)).toEqual({ status: "finished", stopReason: STEP_LIMIT });
    expect(events.filter((e) => e.type === "error")).toEqual([]);
  });
});

describe("the resume limit", () => {
  it("refuses a third resume of the same turn with the limit words, sending nothing and changing nothing", async () => {
    const db = await testDb();
    await db.insert(turns).values({ learnerId: OWNER_LEARNER_ID, status: "cut_off", input: "Why discount?", runs: 3 });
    const before = await db.select().from(turns);
    const { client, requests } = scriptedClient([]);
    const events = await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, { resume: true }));
    expect(events).toEqual([{ type: "over_limit", message: RESUME_LIMIT_MESSAGE }]);
    expect(requests).toHaveLength(0);
    expect(await db.select().from(turns)).toEqual(before);
  });
});
