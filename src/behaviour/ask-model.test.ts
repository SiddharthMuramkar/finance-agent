import { describe, expect, it } from "vitest";
import { askModel, replyCost, tokenCounts, type Asker } from "./ask-model";

/** A fake client: no network. It records the request and answers with `response`. */
function fake(response: object) {
  const requests: Record<string, unknown>[] = [];
  const client = { responses: { create: async (req: Record<string, unknown>) => (requests.push(req), response) } } as unknown as Asker;
  return { client, requests };
}

describe("askModel", () => {
  it("sends the prompt as instructions and input, medium effort, nothing stored, and prices the reply", async () => {
    const usage = { input_tokens: 10_000, output_tokens: 2_000, input_tokens_details: { cached_tokens: 4_000, cache_write_tokens: 1_000 }, output_tokens_details: { reasoning_tokens: 1_500 } };
    const { client, requests } = fake({ status: "completed", output: [], output_text: "{\"ok\":true}", incomplete_details: null, usage });
    const res = await askModel(client, { system: "Grade.", input: "Reply.", maxOutputTokens: 16_000 });
    expect(requests[0]).toEqual({ model: "gpt-6.1-sol", instructions: "Grade.", input: "Reply.", reasoning: { effort: "medium" }, max_output_tokens: 16_000, store: false });
    expect(res).toMatchObject({ text: "{\"ok\":true}", stopReason: "end_turn", usage });
    // 5 000 plain input at $2, 4 000 cached at $0.10, 1 000 written at $2.50, 2 000 output at $10 (per million).
    expect(res.costUsd).toBeCloseTo((5_000 * 2 + 4_000 * 0.1 + 1_000 * 2.5 + 2_000 * 10) / 1e6, 8);
  });

  it("says max_tokens for a reply cut off at its limit, and refusal for a refusal", async () => {
    const cut = await askModel(fake({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [], output_text: "{\"a\":" }).client, { input: "x", maxOutputTokens: 10 });
    expect(cut.stopReason).toBe("max_tokens");
    const refused = await askModel(fake({ status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "No." }] }], output_text: "" }).client, { input: "x", maxOutputTokens: 10 });
    expect(refused.stopReason).toBe("refusal");
  });

  it("counts input apart from the cached and cache-written tokens, and prices an unknown model at nothing", () => {
    expect(tokenCounts({ input_tokens: 100, output_tokens: 5, input_tokens_details: { cached_tokens: 60, cache_write_tokens: 10 } })).toEqual({ inputTokens: 30, outputTokens: 5, cacheReadTokens: 60, cacheWriteTokens: 10 });
    expect(tokenCounts(undefined)).toEqual({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });
    expect(replyCost("gpt-unknown", { input_tokens: 1, output_tokens: 1 })).toBe(0);
  });
});
