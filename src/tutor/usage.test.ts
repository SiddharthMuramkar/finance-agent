import { describe, expect, it } from "vitest";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { usageRows } from "@/db/schema";
import { loadCurrentSession } from "./transcript";
import { runTutorTurn, type TurnEvent } from "./turn";

async function collect(events: AsyncIterable<TurnEvent>) {
  const out: TurnEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

const usage = (input: number, output: number, extra: Record<string, unknown> = {}) => ({
  input_tokens: input,
  output_tokens: output,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
  ...extra,
});

describe("usage per Tutor turn", () => {
  it("stores one row per loop step and one for the turn, with tokens, tools, duration and cost", async () => {
    const db = await testDb();
    const { client } = scriptedClient([
      {
        content: [{ type: "tool_use", id: "toolu_1", name: "finish_teaching_step", input: { step: "story" } }],
        usage: usage(1000, 200, { cache_creation_input_tokens: 4000, output_tokens_details: { thinking_tokens: 150 } }),
      },
      { content: [{ type: "text", text: "Now the concept." }], usage: usage(300, 100, { cache_read_input_tokens: 5000 }) },
    ]);

    const events = await collect(runTutorTurn({ db, client }, "Continue"));
    const done = events.at(-1);

    const rows = await db.select().from(usageRows);
    const steps = rows.filter((r) => r.kind === "step").sort((a, b) => a.step! - b.step!);
    const turn = rows.filter((r) => r.kind === "turn");
    expect(steps).toHaveLength(2);
    expect(turn).toHaveLength(1);
    expect(steps[0]).toMatchObject({
      model: "claude-opus-5-5",
      inputTokens: 1000,
      outputTokens: 200,
      cacheWriteTokens: 4000,
      cacheReadTokens: 0,
      thinkingTokens: 150,
      tools: ["finish_teaching_step"],
    });
    expect(steps[1]).toMatchObject({ inputTokens: 300, outputTokens: 100, cacheReadTokens: 5000, thinkingTokens: null, tools: [] });
    // Opus rates. Step 1: (1000*4 + 200*20 + 4000*5) / 1e6 = 0.028. Step 2: (300*4 + 100*20 + 5000*0.2) / 1e6 = 0.0042.
    expect(steps[0].costUsd).toBeCloseTo(0.028, 6);
    expect(steps[1].costUsd).toBeCloseTo(0.0042, 6);
    expect(turn[0]).toMatchObject({ inputTokens: 1300, outputTokens: 300, cacheReadTokens: 5000, cacheWriteTokens: 4000, tools: ["finish_teaching_step"] });
    expect(turn[0].costUsd).toBeCloseTo(0.0322, 6);
    expect(turn[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(done).toMatchObject({ type: "done", usage: { costUsd: expect.closeTo(0.0322, 6), steps: [{ step: 1 }, { step: 2 }] } });
  });

  it("shows a past turn's usage on its last reply when a Session is reloaded", async () => {
    const db = await testDb();
    const { client } = scriptedClient([{ content: [{ type: "text", text: "Hello." }], usage: usage(10, 5) }]);
    await collect(runTutorTurn({ db, client }, "Hi"));

    const lines = await loadCurrentSession(db);
    expect(lines[0].usage).toBeUndefined();
    expect(lines[1].usage).toMatchObject({ inputTokens: 10, outputTokens: 5, steps: [{ step: 1, tools: [] }] });
  });

  it("records a step with no usage report as zero tokens", async () => {
    const db = await testDb();
    const { client } = scriptedClient([{ content: [{ type: "text", text: "Hello." }] }]);
    await collect(runTutorTurn({ db, client }, "Hi"));
    const [step] = (await db.select().from(usageRows)).filter((r) => r.kind === "step");
    expect(step).toMatchObject({ inputTokens: 0, outputTokens: 0 });
  });
});
