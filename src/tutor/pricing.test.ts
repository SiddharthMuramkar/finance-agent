import { describe, expect, it } from "vitest";
import { costUsd } from "./pricing";

const none = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

describe("price table", () => {
  it("prices gpt-6.1-sol at $2 per million input and $10 per million output (ADR 0007)", () => {
    // 100K tokens each way, well under the long-prompt line: 0.2 + 1.0.
    expect(costUsd("gpt-6.1-sol", { ...none, inputTokens: 100_000, outputTokens: 100_000 })).toBeCloseTo(1.2, 6);
  });

  it("reads gpt-6.1-sol's cache at $0.10 per million and writes it at $2.50", () => {
    expect(costUsd("gpt-6.1-sol", { ...none, cacheReadTokens: 100_000 })).toBeCloseTo(0.01, 6);
    expect(costUsd("gpt-6.1-sol", { ...none, cacheWriteTokens: 100_000 })).toBeCloseTo(0.25, 6);
  });

  it("prices a gpt-6.1-sol request past 272K input tokens at twice the input and cache rates and 1.5 times the output", () => {
    // At the line, the normal rates: (200000*2 + 72000*0.1 + 1000*10) / 1e6 = 0.4172.
    expect(costUsd("gpt-6.1-sol", { inputTokens: 200_000, cacheReadTokens: 72_000, cacheWriteTokens: 0, outputTokens: 1000 })).toBeCloseTo(0.4172, 6);
    // One token past it, the whole request: ((200001*2 + 72000*0.1) * 2 + 1000*10*1.5) / 1e6 = 0.829404.
    expect(costUsd("gpt-6.1-sol", { inputTokens: 200_001, cacheReadTokens: 72_000, cacheWriteTokens: 0, outputTokens: 1000 })).toBeCloseTo(0.829404, 6);
  });

  it("returns null for a model that is not in the table (a Claude model from before the switch), never a made-up price", () => {
    expect(costUsd("claude-opus-5-5", { ...none, inputTokens: 5 })).toBeNull();
  });
});
