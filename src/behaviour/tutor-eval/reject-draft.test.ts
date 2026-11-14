import { describe, expect, it } from "vitest";
import { countWords, LONG_CAP } from "@/tutor/reply-checks";
import type { Block, ModelClient, StepRequest, StepResult } from "@/tutor/model";
import { PADDING, rejectingFirstDraft } from "./reject-draft";

/** A model client that answers each step with the next result, and counts the steps it was sent. */
function fake(results: StepResult[]): ModelClient & { sent: number } {
  const client = {
    sent: 0,
    step() {
      const result = results[client.sent++];
      return {
        async *[Symbol.asyncIterator]() {
          for (const [block, b] of result.content.entries()) if (b.type === "text") yield { type: "text" as const, block, text: b.text };
        },
        final: async () => result,
      };
    },
    compact: async () => ({ content: [], stopReason: "compaction" as const }),
  };
  return client;
}

const request: StepRequest = { model: "gpt-6.1-sol", effort: "medium", instructions: "", tools: [], messages: [], maxOutputTokens: 100 };
const replay: Block = { type: "replay", items: [{ type: "reasoning", id: "rs_1" }] } as Block;
const call: StepResult = { content: [{ type: "tool_use", id: "call_1", name: "calculate", input: {} }, replay], stopReason: "tool_use" };
const draft: StepResult = { content: [{ type: "text", text: "A word is a word." }, replay], stopReason: "end_turn" };
const retry: StepResult = { content: [{ type: "text", text: "Shorter." }, replay], stopReason: "end_turn" };

describe("a rejected draft on demand (T20)", () => {
  it("pads past every cap, in words the other checks pass", () => {
    expect(countWords(PADDING)).toBeGreaterThan(2 * LONG_CAP);
    expect(PADDING).not.toMatch(/[\d?$₹%]/);
  });

  it("pads only the first step that ends the turn with text, drops its replay block, and leaves the stream and the rest alone", async () => {
    const inner = fake([call, draft, retry]);
    const client = rejectingFirstDraft(inner);
    expect(await client.step(request).final()).toEqual(call);
    const padded = client.step(request);
    const streamed: string[] = [];
    for await (const e of padded) if (e.type === "text") streamed.push(e.text);
    // What streams is the model's own text: a held reply never shows it, and the stored step is the one checked.
    expect(streamed).toEqual(["A word is a word."]);
    const final = await padded.final();
    // Edited text never keeps its raw output (A1): the step is sent back rebuilt from its blocks.
    expect(final.content).toEqual([{ type: "text", text: "A word is a word." }, { type: "text", text: PADDING }]);
    expect(await padded.final()).toBe(final);
    expect(await client.step(request).final()).toEqual(retry);
    expect(inner.sent).toBe(3);
  });

  it("pads once across the clients one turn's runners use", async () => {
    const inner = fake([draft, retry]);
    const withRun: ModelClient = { ...inner, step: inner.step.bind(inner), forRun: () => withRun };
    const client = rejectingFirstDraft(withRun);
    expect((await client.forRun!().step(request).final()).content).toHaveLength(2);
    expect(await client.forRun!().step(request).final()).toEqual(retry);
  });
});
