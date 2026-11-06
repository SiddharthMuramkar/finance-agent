import { describe, expect, it } from "vitest";
import { COMPOSE_LIMIT_MS } from "@/tutor/compose";
import { FIRST_PROMPT_TURNS_USD, runUnderCap, SETTLE_POLL_MS, SETTLE_TIMEOUT_MS, Spend, TUTOR_MAX_OUTPUT_TOKENS, type TurnStep } from "./judges";

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
    const r = await runUnderCap({ spend: s, attempt: async (seen) => (tries++, tryOf(7, new Error("server down"))(seen)), usageOf: async (id: number) => usage.get(id) ?? [], settle: clock() });
    expect(tries).toBe(1);
    expect(r).toMatchObject({ refused: true });
    expect(String((r as { error?: Error }).error?.message)).toBe("server down");
    expect(s.spent).toBeCloseTo(0.6, 6);
  });

  it("retries once after a failure that left room, charging both tries", async () => {
    const s = new Spend(13);
    const usage = new Map([[7, [step]], [8, [step, step]]]);
    let n = 0;
    const r = await runUnderCap({ spend: s, attempt: async (seen) => (n++ === 0 ? tryOf(7, new Error("sign-in failed"))(seen) : tryOf(8, "row")(seen)), usageOf: async (id: number) => usage.get(id) ?? [], settle: clock() });
    expect(r).toEqual({ row: "row" });
    expect(s.spent).toBeCloseTo(0.18, 6);
  });

  it("reports the error after two failed tries", async () => {
    const s = new Spend(13);
    const r = await runUnderCap({ spend: s, attempt: tryOf(7, new Error("still down")), usageOf: async () => [], settle: clock() });
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

describe("[S3] a try whose turns cannot be charged keeps its result and stops the paid round (E4b-C1, E4b-T4)", () => {
  it("keeps the try's row when reading its usage fails, then starts no further prompt or judge call", async () => {
    const s = new Spend(13);
    const r = await runUnderCap({ spend: s, attempt: tryOf(7, "row"), usageOf: async () => { throw new Error("Connection terminated unexpectedly"); } });
    expect(r).toEqual({ row: "row" });
    expect(s.uncounted).toMatch(/Connection terminated unexpectedly/);
    expect(s.allows(0)).toBe(false);
    let started = 0;
    const next = await runUnderCap({ spend: s, attempt: async () => (started++, "row"), usageOf: async () => [] });
    expect(next).toEqual({ refused: true });
    expect(started).toBe(0);
  });

  it("keeps the try's error, and does not retry, when its turns ran on a model with no price", async () => {
    const s = new Spend(13);
    let tries = 0;
    const r = await runUnderCap({ spend: s, attempt: async (seen) => (tries++, tryOf(7, new Error("server down"))(seen)), usageOf: async () => [{ ...step, model: "claude-unknown" }], settle: clock() });
    expect(tries).toBe(1);
    expect(r).toMatchObject({ refused: true });
    expect(String((r as { error?: Error }).error?.message)).toBe("server down");
    expect(s.uncounted).toMatch(/no price/);
    expect(s.spent).toBe(0);
  });
});

/**
 * E4b-C2: a try that ends with its turn still running (the 180 s timeout, or a throw mid-turn) is not charged from a
 * partial read. /api/turn keeps running after the browser closes, and a compose_widget call in flight when a turn was
 * cut off saves its step after the turn row has ended, so the runner waits for the Learner's usage to settle first.
 */
function clock() {
  let t = 0;
  const waits: number[] = [];
  return { now: () => t, sleep: async (ms: number) => { waits.push(ms); t += ms; }, waits };
}

describe("[S3] an unfinished try is charged once its usage settles (E4b-C2)", () => {
  it("waits out a turn still running after a timeout and charges the steps it wrote later", async () => {
    const s = new Spend(13);
    const c = clock();
    // The try returns at t=0 with one step written; the turn stays open until t=30 s and writes two more steps.
    const usageOf = async () => (c.now() < 30_000 ? [step] : [step, step, step]);
    const openTurns = async () => (c.now() < 30_000 ? 1 : 0);
    const r = await runUnderCap({ spend: s, attempt: tryOf(7, "timed out"), finished: () => false, usageOf, openTurns, settle: c });
    expect(r).toEqual({ row: "timed out" });
    expect(s.spent).toBeCloseTo(0.18, 6);
    expect(s.reserve.usd).toBe(0);
  });

  it("waits after a thrown try, so a compose step saved after the turn row ended is still counted", async () => {
    const s = new Spend(13);
    const c = clock();
    // No turn is open, but compose's step lands 10 s after the try ends (its call is capped at 12 s).
    const usageOf = async () => (c.now() < 10_000 ? [step] : [step, step]);
    const r = await runUnderCap({ spend: s, attempt: async (seen) => { if (c.now() === 0) return tryOf(7, new Error("page crashed"))(seen); return tryOf(8, "row")(seen); }, usageOf, openTurns: async () => 0, settle: c });
    expect(r).toEqual({ row: "row" });
    // Try 1 settles at [step, step] ($0.12); try 2, a finished row, is charged straight away ([step, step], $0.12).
    expect(s.spent).toBeCloseTo(0.24, 6);
    expect(SETTLE_POLL_MS).toBeGreaterThan(COMPOSE_LIMIT_MS);
  });

  it("charges a finished try at once, without waiting", async () => {
    const s = new Spend(13);
    const c = clock();
    await runUnderCap({ spend: s, attempt: tryOf(7, "row"), finished: () => true, usageOf: async () => [step], openTurns: async () => 1, settle: c });
    expect(c.waits).toEqual([]);
    expect(s.spent).toBeCloseTo(0.06, 6);
  });

  it("gives up after the bound, charges a reserve of one costliest turn at max output, and fails closed before the cap", async () => {
    const c = clock();
    const s = new Spend(1.05);
    // A known prompt first: two steps, its costliest turns so far.
    s.chargeTurns([step, step]);
    const ceiling = s.turnCeiling();
    // Each step repriced at the Tutor's max output: 10 000 in at $4/M + 16 000 out at $20/M = $0.36; two of them.
    expect(ceiling).toBeCloseTo(2 * (10_000 * 4 + TUTOR_MAX_OUTPUT_TOKENS * 20) / 1e6, 6);
    const r = await runUnderCap({ spend: s, attempt: tryOf(7, "timed out"), finished: () => false, usageOf: async () => [step], openTurns: async () => 1, settle: c });
    expect(r).toEqual({ row: "timed out" });
    expect(c.now()).toBeLessThanOrEqual(SETTLE_TIMEOUT_MS);
    expect(c.now()).toBeGreaterThan(SETTLE_TIMEOUT_MS - SETTLE_POLL_MS);
    // Charged: the first prompt ($0.12) + what was read ($0.06) + the reserve.
    expect(s.spent).toBeCloseTo(0.12 + 0.06 + ceiling, 6);
    expect(s.reserve.usd).toBeCloseTo(ceiling, 6);
    expect(s.reserve.why[0]).toMatch(/Learner 7/);
    expect(s.uncounted).toBeNull();
    // $0.90 is spent with the reserve. The reserve is counted once, in `spent`, and never again in the next prompt's
    // estimate (E4b-C3): that stays the costliest prompt actually read ($0.12), so one timeout does not refuse the rest.
    expect(s.nextPrompt()).toBeCloseTo(0.12, 6);
    expect(s.allows(s.nextPrompt())).toBe(true);
    expect(s.allows(0.2)).toBe(false);
  });

  it("reserves at least the first-prompt estimate at max output when no prompt is known yet", async () => {
    const s = new Spend(13);
    expect(s.turnCeiling()).toBeGreaterThanOrEqual(FIRST_PROMPT_TURNS_USD);
  });
});
