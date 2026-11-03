/**
 * What each model costs, in US dollars per million tokens. Checked on 2026-11-02 against
 * Anthropic's published rates (via the claude-api skill's pricing table): Sonnet 5.5 $2/$10,
 * Opus 5.5 $4/$20, Fable 5.1 $10/$50 (cache reads $0.25, writes 1.25 times input; checked 2026-11-03), Haiku 5.5 $0.10/$0.50 (Haiku's rate is for prompts up to 100K tokens;
 * Tutor prompts are far smaller). Writing to the 5-minute cache costs 1.25 times the input
 * price. Reading from it costs 0.1 times for Sonnet and Haiku, and $0.20 for Opus 5.5.
 */
export const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

export type TokenCounts = { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };

/** Cost of one request in USD, or null when the model has no row in the price table. */
export function costUsd(model: string, t: TokenCounts): number | null {
  const p = PRICES[model];
  if (!p) return null;
  return (t.inputTokens * p.input + t.outputTokens * p.output + t.cacheReadTokens * p.cacheRead + t.cacheWriteTokens * p.cacheWrite) / 1_000_000;
}
