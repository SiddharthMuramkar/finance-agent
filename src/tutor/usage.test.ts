import { describe, expect, it } from "vitest";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { OWNER_LEARNER_ID, usageRows } from "@/db/schema";
import { TUTOR_MODEL } from "./model";
import { loadCurrentSession } from "./transcript";
import { runTutorTurn, type TurnEvent } from "./turn";
import { sumSteps, unknownCostReason, type StepUsage } from "./usage";

async function collect(events: AsyncIterable<TurnEvent>) {
  const out: TurnEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

/** OpenAI's usage report: its input count includes the cached and cache-written tokens. */
const usage = (input: number, output: number, { cached = 0, written = 0, reasoning }: { cached?: number; written?: number; reasoning?: number } = {}) => ({
  input_tokens: input + cached + written,
  output_tokens: output,
  input_tokens_details: { cached_tokens: cached, cache_write_tokens: written },
  ...(reasoning !== undefined && { output_tokens_details: { reasoning_tokens: reasoning } }),
});

describe("usage per Tutor turn", () => {
  it("stores one row per loop step and one for the turn, with tokens, tools, duration and cost", async () => {
    const db = await testDb();
    const { client } = scriptedClient([
      {
        content: [{ type: "tool_use", id: "toolu_1", name: "finish_teaching_step", input: { step: "story" } }],
        usage: usage(1000, 200, { written: 4000, reasoning: 150 }),
      },
      { content: [{ type: "text", text: "Now the concept." }], usage: usage(300, 100, { cached: 5000 }) },
    ]);

    const events = await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "Go on"));
    const done = events.at(-1);

    const rows = await db.select().from(usageRows);
    const steps = rows.filter((r) => r.kind === "step").sort((a, b) => a.step! - b.step!);
    const turn = rows.filter((r) => r.kind === "turn");
    expect(steps).toHaveLength(2);
    expect(turn).toHaveLength(1);
    expect(steps[0]).toMatchObject({
      model: "gpt-6.1-sol",
      inputTokens: 1000,
      outputTokens: 200,
      cacheWriteTokens: 4000,
      cacheReadTokens: 0,
      thinkingTokens: 150,
      tools: ["finish_teaching_step"],
    });
    expect(steps[1]).toMatchObject({ inputTokens: 300, outputTokens: 100, cacheReadTokens: 5000, thinkingTokens: null, tools: [] });
    // gpt-6.1-sol rates. Step 1: (1000*2 + 200*10 + 4000*2.5) / 1e6 = 0.014. Step 2: (300*2 + 100*10 + 5000*0.1) / 1e6 = 0.0021.
    expect(steps[0].costUsd).toBeCloseTo(0.014, 6);
    expect(steps[1].costUsd).toBeCloseTo(0.0021, 6);
    expect(turn[0]).toMatchObject({ inputTokens: 1300, outputTokens: 300, cacheReadTokens: 5000, cacheWriteTokens: 4000, tools: ["finish_teaching_step"] });
    expect(turn[0].costUsd).toBeCloseTo(0.0161, 6);
    expect(turn[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(done).toMatchObject({ type: "done", usage: { costUsd: expect.closeTo(0.0161, 6), steps: [{ step: 1 }, { step: 2 }] } });
  });

  it("shows a past turn's usage on its last reply when a Session is reloaded", async () => {
    const db = await testDb();
    const { client } = scriptedClient([{ content: [{ type: "text", text: "Hello." }], usage: usage(10, 5) }]);
    await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "Hi"));

    const lines = await loadCurrentSession(db, undefined, OWNER_LEARNER_ID);
    expect(lines[0].usage).toBeUndefined();
    expect(lines[1].usage).toMatchObject({ inputTokens: 10, outputTokens: 5, steps: [{ step: 1, tools: [] }] });
  });

  it("records a step with no usage report as zero tokens", async () => {
    const db = await testDb();
    const { client } = scriptedClient([{ content: [{ type: "text", text: "Hello." }] }]);
    await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "Hi"));
    const [step] = (await db.select().from(usageRows)).filter((r) => r.kind === "step");
    expect(step).toMatchObject({ inputTokens: 0, outputTokens: 0 });
  });
});

describe("a turn whose cost is unknown", () => {
  const step = (costUsd: number | null, stopReason: string): StepUsage => ({
    step: 1,
    tools: [],
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    thinkingTokens: null,
    durationMs: 0,
    costUsd,
    stopReason,
  });

  it("says why: a step cut short before OpenAI reported its usage, or a model with no price in the table", () => {
    expect(unknownCostReason(sumSteps(TUTOR_MODEL, [step(0.01, "end_turn")], 0))).toBeNull();
    for (const why of ["stopped", "guard", "cut_off", "failed", "timeout"])
      expect(unknownCostReason(sumSteps(TUTOR_MODEL, [step(null, why), step(0.01, "end_turn")], 0))).toBe("a step was cut short before OpenAI reported its usage");
    expect(unknownCostReason(sumSteps("a-new-model", [step(null, "end_turn")], 0))).toBe("no price for a-new-model");
  });
});
