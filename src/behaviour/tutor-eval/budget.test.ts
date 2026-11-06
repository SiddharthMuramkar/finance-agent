import { describe, expect, it } from "vitest";
import { Budget, budgetCap, DEFAULT_BUDGET_USD, FIRST_RUN_ESTIMATE_USD, requirePrice } from "./budget";

describe("the spend cap", () => {
  it("is $5 unless TUTOR_EVAL_BUDGET_USD says otherwise, and refuses a cap that is not a positive number", () => {
    expect(DEFAULT_BUDGET_USD).toBe(5);
    expect(budgetCap({})).toBe(5);
    expect(budgetCap({ TUTOR_EVAL_BUDGET_USD: "1.5" })).toBe(1.5);
    expect(() => budgetCap({ TUTOR_EVAL_BUDGET_USD: "lots" })).toThrow(/TUTOR_EVAL_BUDGET_USD/);
    expect(() => budgetCap({ TUTOR_EVAL_BUDGET_USD: "0" })).toThrow(/TUTOR_EVAL_BUDGET_USD/);
  });

  it("holds each run's estimate before it starts, and stops once the next run would pass the cap", () => {
    const b = new Budget(1);
    expect(b.estimate()).toBe(FIRST_RUN_ESTIMATE_USD);
    expect(b.hold(0.4)).toBe(true);
    expect(b.hold(0.4)).toBe(true);
    // Two runs are held at $0.80: a third would reach $1.20, past the cap, so it does not start.
    expect(b.hold(0.4)).toBe(false);
    expect(b.stopped).toMatch(/\$1\.00 cap/);
    b.settle(0.4, 0.3);
    b.settle(0.4, 0.35);
    expect(b.spent).toBeCloseTo(0.65);
    // Once stopped, it stays stopped, so the report says so even if a later run would fit.
    expect(b.hold(0.01)).toBe(false);
  });

  it("estimates the next run from what the finished runs cost", () => {
    const b = new Budget(5);
    b.hold(b.estimate());
    b.settle(FIRST_RUN_ESTIMATE_USD, 0.2);
    b.hold(b.estimate());
    b.settle(0.2, 0.1);
    expect(b.estimate()).toBeCloseTo(0.15);
  });

  it("does not let a run that spent nothing pull the estimate down to $0", () => {
    const b = new Budget(5);
    b.hold(b.estimate());
    b.settle(FIRST_RUN_ESTIMATE_USD, 0);
    expect(b.estimate()).toBe(FIRST_RUN_ESTIMATE_USD);
    b.hold(b.estimate());
    b.settle(FIRST_RUN_ESTIMATE_USD, 0.2);
    b.hold(b.estimate());
    b.settle(0.2, 0);
    expect(b.estimate()).toBeCloseTo(0.2);
  });

  // Round 10 (F1-budget): a dialogue turn (one Tutor Turn, no grader) settled into the same mean as a live run (a Tutor Turn
  // and a grade), so the dialogue held too much and the live runs after it held too little. Each kind keeps its own mean.
  it("keeps a dialogue turn's estimate apart from a live run's, so neither pulls the other's mean", () => {
    const b = new Budget(5);
    b.hold(b.estimate("run"));
    b.settle(FIRST_RUN_ESTIMATE_USD, 0.3, "run");
    for (const cost of [0.02, 0.04]) {
      const held = b.estimate("dialogue_turn");
      b.hold(held);
      b.settle(held, cost, "dialogue_turn");
    }
    expect(b.estimate("run")).toBeCloseTo(0.3);
    expect(b.estimate()).toBeCloseTo(0.3);
    expect(b.estimate("dialogue_turn")).toBeCloseTo(0.03);
    expect(b.spent).toBeCloseTo(0.36);
  });

  it("counts spend that reaches the cap as a stop", () => {
    const b = new Budget(0.5);
    expect(b.hold(0.2)).toBe(true);
    b.settle(0.2, 0.6);
    expect(b.hold(0.01)).toBe(false);
    expect(b.stopped).toMatch(/spent \$0\.60/);
  });

  it("refuses a model with no price, so spend is never counted as $0", () => {
    expect(() => requirePrice("claude-opus-5-5")).not.toThrow();
    expect(() => requirePrice("claude-unknown-9")).toThrow(/no price/);
  });
});
