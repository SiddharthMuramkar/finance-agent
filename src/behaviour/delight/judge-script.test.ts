import { describe, expect, it } from "vitest";
// @ts-expect-error the judge runner is a plain .mjs script with no types
import { judgePrompt } from "../../../scripts/delight-judge.mjs";
import { Spend } from "./judges";

const evidence = { prompt: { id: "D01", topic: "num-percent-bps", step: "story", message: "what even is a basis point lol" }, topicTitle: "Percent", reply: "A basis point is a hundredth of a point.", choices: [{ label: "Show me" }, { label: "Next" }], widgetCode: null, widgetSource: "lingo" };
const persona = JSON.stringify({ id: "D01", fun: 4, clarity: 5, lingo: { score: 4, terms: ["basis point"] }, exam: false, back: true, best_line: "a", worst_line: "b", why: "w" });
const math = JSON.stringify({ id: "D01", sums: [], count: 0 });
const fit = JSON.stringify({ id: "D01", match: 5, lively: 4, emoji: { meaningful: [], decorative: [] }, alone: true, kind: "lingo", source: "lingo", why: "w" });
const historian = JSON.stringify({ id: "D01", claims: [], wrong: 0, after_as_of: 0, unsupported: 0 });

/** A client that answers each call from a queue and records the requests. */
function fake(replies: string[], usage = { input_tokens: 2000, output_tokens: 200 }) {
  const calls: { system: string; messages: unknown[] }[] = [];
  return {
    calls,
    messages: {
      create: async (req: { system: string; messages: unknown[]; model: string }) => {
        expect(req.model).toBe("claude-opus-5-5");
        calls.push({ system: req.system, messages: [...req.messages] });
        return { content: [{ type: "text", text: replies.shift() ?? "" }], usage };
      },
    },
  };
}

describe("[S3] the judge runner", () => {
  it("makes one call per judge and parses each answer", async () => {
    const client = fake([persona, math, fit, historian]);
    const r = await judgePrompt({ client, spend: new Spend(13), evidence, screenshot: null });
    expect(client.calls).toHaveLength(4);
    expect(Object.keys(r.judgements)).toEqual(["persona", "math", "fit", "historian"]);
    expect(r.errors).toEqual([]);
  });

  it("re-asks once when a judge answers prose, and reports a judge that fails twice", async () => {
    const client = fake(["I think it was fun!", persona, "no", "still no", fit, historian]);
    const r = await judgePrompt({ client, spend: new Spend(13), evidence, screenshot: null });
    expect(client.calls).toHaveLength(6);
    expect(r.judgements.persona.fun).toBe(4);
    expect(r.judgements.math).toBeUndefined();
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/^math: .*not JSON/);
  });

  it("estimates the first call at $0.15, then at the judges' running average, and stops before the call that would pass the cap", async () => {
    // $0.06 a call; the first is estimated at $0.15 (fits $0.20), then at the $0.06 average: 0.06, 0.12, 0.18, and a fourth would make 0.24.
    const client = fake([persona, math, fit, historian], { input_tokens: 10_000, output_tokens: 1000 });
    const spend = new Spend(0.2);
    const r = await judgePrompt({ client, spend, evidence, screenshot: null });
    expect(client.calls).toHaveLength(3);
    expect(Object.keys(r.judgements)).toEqual(["persona", "math", "fit"]);
    expect(r.skipped).toEqual(["historian"]);
    expect(spend.spent).toBeCloseTo(0.18, 6);
    expect(spend.judges.calls).toBe(3);
  });

  it("starts no judge when even the first call's estimate would pass the cap", async () => {
    const client = fake([persona, math, fit, historian], { input_tokens: 10_000, output_tokens: 1000 });
    const spend = new Spend(0.1);
    const r = await judgePrompt({ client, spend, evidence, screenshot: null });
    expect(client.calls).toHaveLength(0);
    expect(r.skipped).toEqual(["persona", "math", "fit", "historian"]);
    expect(spend.spent).toBe(0);
  });

  it("shares the cap with the Tutor's turns without letting their spend inflate a judge call's estimate", async () => {
    const client = fake([persona, math, fit, historian], { input_tokens: 10_000, output_tokens: 1000 });
    const spend = new Spend(5.2);
    spend.chargeTurns([{ model: "claude-opus-5-5", inputTokens: 1_000_000, outputTokens: 50_000 }]); // $5.00 of Tutor turns
    const r = await judgePrompt({ client, spend, evidence, screenshot: null });
    expect(client.calls).toHaveLength(3);
    expect(r.skipped).toEqual(["historian"]);
    expect(spend.spent).toBeCloseTo(5.18, 6);
  });
});
