/**
 * What each model costs, in US dollars per million tokens. gpt-6.1-sol checked on 2026-11-11 against OpenAI's model
 * page (via Context7): input $2, cached input $0.10 (5% of input), cache writes $2.50 (1.25 times input, for the
 * default 30-minute cache), output $10 (reasoning tokens are output). A request with more than 272K input tokens is
 * priced at 2 times the input and cache rates and 1.5 times the output rate, for the whole request.
 * gpt-6.1-sol is the only model (ADR 0015). Usage stored before the switch keeps the cost worked out when it was saved.
 */
type Price = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** The long-prompt tier: past `over` input tokens, the whole request costs `input` times more input and cache, `output` times more output. */
  longPrompt?: { over: number; input: number; output: number };
};

export const PRICES: Record<string, Price> = {
  "gpt-6.1-sol": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5, longPrompt: { over: 272_000, input: 2, output: 1.5 } },
};

/** One request's tokens as stored: `inputTokens` leaves out the cached and cache-written tokens, which are counted apart. */
export type TokenCounts = { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };

/** Cost of one request in USD, or null when the model has no row in the price table. */
export function costUsd(model: string, t: TokenCounts): number | null {
  const p = PRICES[model];
  if (!p) return null;
  const prompt = t.inputTokens + t.cacheReadTokens + t.cacheWriteTokens;
  const long = p.longPrompt && prompt > p.longPrompt.over ? p.longPrompt : undefined;
  const inputTimes = long?.input ?? 1;
  const outputTimes = long?.output ?? 1;
  return ((t.inputTokens * p.input + t.cacheReadTokens * p.cacheRead + t.cacheWriteTokens * p.cacheWrite) * inputTimes + t.outputTokens * p.output * outputTimes) / 1_000_000;
}
