import { describe, expect, it } from "vitest";
import { costUsd } from "./pricing";

const none = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

describe("price table", () => {
  it("prices Sonnet 5.5 at $2 per million input and $10 per million output", () => {
    expect(costUsd("claude-sonnet-5-5", { ...none, inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(12, 6);
  });

  it("reads the cache at a tenth of the input price and writes it at one and a quarter times", () => {
    expect(costUsd("claude-sonnet-5-5", { ...none, cacheReadTokens: 1_000_000 })).toBeCloseTo(0.2, 6);
    expect(costUsd("claude-sonnet-5-5", { ...none, cacheWriteTokens: 1_000_000 })).toBeCloseTo(2.5, 6);
  });

  it("prices Opus 5.5 and Haiku 5.5 from their own rows", () => {
    expect(costUsd("claude-opus-5-5", { ...none, inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(24, 6);
    expect(costUsd("claude-haiku-5-5", { ...none, inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(0.6, 6);
  });

  it("returns null for a model that is not in the table, never a made-up price", () => {
    expect(costUsd("claude-unknown-9", { ...none, inputTokens: 5 })).toBeNull();
  });
});
