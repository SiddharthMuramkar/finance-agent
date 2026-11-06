import { describe, expect, it } from "vitest";
import { FIRST_PROMPT_TURNS_USD, runUnderCap, Spend, type TurnStep } from "./judges";

/**
 * Seam S3: the round's budget (spec Appendix D.3, "<= $13 a round, about 22 turns plus 80 judge calls") covers the
 * Tutor's turns and the judges in one Spend. A prompt is two paid Tutor turns (the Topic's opener and the reply to the
 * prompt); the runner refuses to start one that would pass the cap, and charges what its turns really cost from the
 * usage rows the app recorded, a failed try too.
 */

/** One Opus step of 10 000 input and 1 000 output tokens: $0.06. */
const step: TurnStep = { model: "claude-opus-5-5", inputTokens: 10_000, outputTokens: 1_000 };

describe("[S3] the Delight round's spend counts the Tutor's turns", () => {
  it("charges a prompt's turns at the price table, into the same total the judges add to", () => {
    const s = new Spend(13);
    expect(s.chargeTurns([step, step, step])).toBeCloseTo(0.18, 6);
    s.chargeJudge("claude-opus-5-5", { inputTokens: 10_000, outputTokens: 1_000 });
    expect(s.spent).toBeCloseTo(0.24, 6);
    expect(s.tutor.usd).toBeCloseTo(0.18, 6);
    expect(s.judges.usd).toBeCloseTo(0.06, 6);
    expect(() => s.chargeTurns([{ ...step, model: "claude-unknown" }])).toThrow(/no price/);
  });

  it("estimates the next prompt at the costliest so far, and the first one conservatively", () => {
    const s = new Spend(13);
    expect(s.nextPrompt()).toBe(FIRST_PROMPT_TURNS_USD);
    s.chargeTurns([step, step]);
    s.chargeTurns([step]);
    expect(s.nextPrompt()).toBeCloseTo(0.12, 6);
  });

  it("estimates the next judge call from the judges' own calls, never the Tutor's spend", () => {
    const s = new Spend(13);
    s.chargeTurns([step, step, step, step, step]);
    s.chargeJudge("claude-opus-5-5", { inputTokens: 10_000, outputTokens: 1_000 });
    expect(s.nextJudgeCall()).toBeCloseTo(0.06, 6);
  });
});

/** A try that runs as a Learner and records `steps` for it, or throws after doing so. */
function tryOf(learnerId: number, row: string | Error) {
  return async (seen: { learnerId: number | null }) => {
    seen.learnerId = learnerId;
    if (row instanceof Error) throw row;
    return row;
  };
}

describe("[S3] the runner refuses a prompt whose turns would pass the cap", () => {
  it("does not start a prompt when its estimate would pass the cap", async () => {
    const s = new Spend(FIRST_PROMPT_TURNS_USD - 0.01);
    let started = 0;
    const r = await runUnderCap({ spend: s, attempt: async () => (started++, "row"), usageOf: async () => [] });
    expect(r).toEqual({ refused: true });
    expect(started).toBe(0);
    expect(s.spent).toBe(0);
  });

  it("charges the turns the try ran, so spendUsd covers the Tutor", async () => {
    const s = new Spend(13);
    const usage = new Map([[7, [step, step]]]);
    const r = await runUnderCap({ spend: s, attempt: tryOf(7, "row"), usageOf: async (id: number) => usage.get(id) ?? [] });
    expect(r).toEqual({ row: "row" });
    expect(s.spent).toBeCloseTo(0.12, 6);
  });

  it("charges a failed try too, and does not retry when the retry would pass the cap", async () => {
    const s = new Spend(1);
    const usage = new Map([[7, Array.from({ length: 10 }, () => step)]]); // $0.60, the costliest prompt so far
    let tries = 0;
    const r = await runUnderCap({ spend: s, attempt: async (seen) => (tries++, tryOf(7, new Error("server down"))(seen)), usageOf: async (id: number) => usage.get(id) ?? [] });
    expect(tries).toBe(1);
    expect(r).toMatchObject({ refused: true });
    expect(String((r as { error?: Error }).error?.message)).toBe("server down");
    expect(s.spent).toBeCloseTo(0.6, 6);
  });

  it("retries once after a failure that left room, charging both tries", async () => {
    const s = new Spend(13);
    const usage = new Map([[7, [step]], [8, [step, step]]]);
    let n = 0;
    const r = await runUnderCap({ spend: s, attempt: async (seen) => (n++ === 0 ? tryOf(7, new Error("sign-in failed"))(seen) : tryOf(8, "row")(seen)), usageOf: async (id: number) => usage.get(id) ?? [] });
    expect(r).toEqual({ row: "row" });
    expect(s.spent).toBeCloseTo(0.18, 6);
  });

  it("reports the error after two failed tries", async () => {
    const s = new Spend(13);
    const r = await runUnderCap({ spend: s, attempt: tryOf(7, new Error("still down")), usageOf: async () => [] });
    expect(String((r as { error?: Error }).error?.message)).toBe("still down");
    expect(r).not.toHaveProperty("row");
  });

  it("runs uncapped and charges nothing with no Spend (the built-in Widget eval)", async () => {
    let asked = 0;
    const r = await runUnderCap({ spend: null, attempt: tryOf(7, "row"), usageOf: async () => (asked++, [step]) });
    expect(r).toEqual({ row: "row" });
    expect(asked).toBe(0);
  });
});
