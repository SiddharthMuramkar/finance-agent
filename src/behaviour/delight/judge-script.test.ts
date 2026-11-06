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
    const r = await judgePrompt({ client, spend: new Spend(13), evidence, screenshot: null, calls: { count: 0 } });
    expect(client.calls).toHaveLength(4);
    expect(Object.keys(r.judgements)).toEqual(["persona", "math", "fit", "historian"]);
    expect(r.errors).toEqual([]);
  });

  it("re-asks once when a judge answers prose, and reports a judge that fails twice", async () => {
    const client = fake(["I think it was fun!", persona, "no", "still no", fit, historian]);
    const r = await judgePrompt({ client, spend: new Spend(13), evidence, screenshot: null, calls: { count: 0 } });
    expect(client.calls).toHaveLength(6);
    expect(r.judgements.persona.fun).toBe(4);
    expect(r.judgements.math).toBeUndefined();
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/^math: .*not JSON/);
  });

  it("stops starting judges once the next call would pass the cap, and counts the spend", async () => {
    const client = fake([persona, math, fit, historian], { input_tokens: 10_000, output_tokens: 1000 });
    const spend = new Spend(0.1);
    const r = await judgePrompt({ client, spend, evidence, screenshot: null, calls: { count: 0 } });
    expect(client.calls.length).toBeLessThan(4);
    expect(r.skipped.length).toBeGreaterThan(0);
    expect(spend.spent).toBeCloseTo(0.06 * client.calls.length, 5);
  });
});
