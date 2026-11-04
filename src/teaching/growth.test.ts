import { describe, expect, it } from "vitest";
import { calculate } from "@/finance/calculators";
import { drawTemplate, formatExact, markAnswer, plainExact, templateProblems, type QuestionTemplate } from ".";
import { exactFrom } from "./answers";
import { nearRoundingBoundary } from "./growth";

// Growth answers and their Known mistakes (ticket #247). Worked by hand: ₹2,000 at 10% for 2 years is ₹2,420 (simple
// growth says ₹2,400); 72 ÷ 8 is 9 years (100 ÷ 8 is 12.5); 100 becoming 400 in 2 years is 100% a year, since 2 × 2 is
// 4 (the total gain of 300% divided by 2 years says 150%).

const GROW: QuestionTemplate = {
  id: "grow-amount",
  skill: "compound-growth",
  ask: "₹{amount} grows {rate}% a year for {years} years. What is it worth at the end, to the nearest rupee?",
  params: { amount: { min: 2000, max: 9000, step: 1000 }, rate: { min: 2, max: 12, step: 2 }, years: { min: 2, max: 3, step: 1 } },
  derived: { r: "times(rate, 0.01)", f: "plus(1, r)", first: "times(amount, f)" },
  answer: "compound_value",
  unit: "inr",
  decimals: 0,
  sign: "magnitude",
  mistakes: [{ tag: "simple_growth", fix: "That adds the first year's gain every year. Each year grows on the new total." }],
  halfDone: { shows: "First step, done for you: after one year it is ₹{first}.", asks: "compound_value" },
  avoid: [1000, 10],
};

const DOUBLE: QuestionTemplate = {
  id: "double-time",
  skill: "rule-of-72",
  ask: "Money grows {rate}% a year. By the rule of 72, about how many years does it take to double, to one decimal place?",
  params: { rate: { min: 2, max: 24, step: 1 } },
  answer: "rule_of_72_years",
  unit: "years",
  decimals: 1,
  sign: "magnitude",
  mistakes: [{ tag: "simple_doubling", fix: "That is 100 divided by the rate, as if growth never compounded. Divide 72 by the rate." }],
  avoid: [10],
};

const STEADY: QuestionTemplate = {
  id: "steady-rate",
  skill: "cagr",
  ask: "An index goes from {start} to {end} in {years} years. What steady yearly rate (CAGR) does that, in percent?",
  params: { start: { min: 100, max: 500, step: 100 }, g: { min: 20, max: 100, step: 10 }, years: { min: 2, max: 2, step: 1 } },
  derived: { r: "times(g, 0.01)", f: "plus(1, r)", grew: "times(f, f)", end: "times(start, grew)" },
  answer: "cagr_percent",
  unit: "percent",
  decimals: 0,
  sign: "magnitude",
  mistakes: [{ tag: "averaged_gain", fix: "That divides the total gain by the years. Find the one rate that, grown twice, gives the whole rise." }],
  halfDone: { shows: "First step, done for you: it grew {grew} times.", asks: "cagr_percent" },
  avoid: [1000, 10],
};

const pinned = (t: QuestionTemplate, values: Record<string, number>): QuestionTemplate => ({
  ...t,
  params: Object.fromEntries(Object.entries(t.params).map(([name, range]) => [name, { ...range, min: values[name], max: values[name] }])),
  avoid: [],
});

const calc = (id: string, inputs: object, label: string) => {
  const run = calculate(id, inputs);
  if (!run.ok) throw new Error(run.error);
  return run.results.find((r) => r.label === label)!.value;
};

describe("compound growth", () => {
  it("grows ₹2,000 at 10% for 2 years to ₹2,420, and names ₹2,400 as simple growth", () => {
    const item = drawTemplate(pinned(GROW, { amount: 2000, rate: 10, years: 2 }), "s");
    expect(item.prompt).toBe("₹2,000 grows 10% a year for 2 years. What is it worth at the end, to the nearest rupee?");
    expect(markAnswer(item, "2420")).toEqual({ verdict: "right", expected: "₹2,420" });
    expect(markAnswer(item, "₹2,420")).toMatchObject({ verdict: "right" });
    expect(markAnswer(item, "2400")).toMatchObject({ verdict: "known_mistake", tag: "simple_growth" });
  });

  it("shows the first year done in the half-done variant", () => {
    const item = drawTemplate(pinned(GROW, { amount: 2000, rate: 10, years: 2 }), "s", { halfDone: true });
    expect(item.prompt).toContain("after one year it is ₹2,200.");
  });

  it("rounds to the nearest rupee: ₹3,000 at 6% for 2 years is ₹3,370.80, so 3371 is right and 3,370.8 is too", () => {
    const item = drawTemplate(pinned(GROW, { amount: 3000, rate: 6, years: 2 }), "s");
    expect(plainExact(item.answer)).toBe("3371");
    expect(markAnswer(item, "3371").verdict).toBe("right");
    expect(markAnswer(item, "3370.8").verdict).toBe("right");
    expect(markAnswer(item, "3360")).toMatchObject({ verdict: "known_mistake", tag: "simple_growth" });
  });
});

describe("the rule of 72", () => {
  it("gives 9 years at 8%, and names 12.5 as simple doubling", () => {
    const item = drawTemplate(pinned(DOUBLE, { rate: 8 }), "s");
    expect(markAnswer(item, "9")).toMatchObject({ verdict: "right" });
    expect(markAnswer(item, "12.5")).toMatchObject({ verdict: "known_mistake", tag: "simple_doubling" });
  });

  it("rounds 72 ÷ 7 to 10.3 years", () => {
    const item = drawTemplate(pinned(DOUBLE, { rate: 7 }), "s");
    expect(formatExact(item.answer, item.unit)).toBe("10.3 years");
    expect(markAnswer(item, "10.29").verdict).toBe("right");
  });
});

describe("the steady yearly rate (CAGR)", () => {
  it("finds 100% a year for 100 to 400 in 2 years, and names 150% as the averaged gain", () => {
    const item = drawTemplate(pinned(STEADY, { start: 100, g: 100, years: 2 }), "s");
    expect(item.prompt).toBe("An index goes from 100 to 400 in 2 years. What steady yearly rate (CAGR) does that, in percent?");
    expect(markAnswer(item, "100")).toMatchObject({ verdict: "right" });
    expect(markAnswer(item, "150%")).toMatchObject({ verdict: "known_mistake", tag: "averaged_gain" });
  });
});

describe("every draw, against the tested calculators", () => {
  const seeds = Array.from({ length: 300 }, (_, i) => `p-${i}`);

  it("has no template problem", () => {
    for (const t of [GROW, DOUBLE, STEADY]) expect(templateProblems(t), t.id).toEqual([]);
  });

  it("marks its own answer right, matches the calculator at the stated decimals, and is never near a rounding boundary", () => {
    for (const seed of seeds) {
      for (const [t, check] of [
        [GROW, (p: Record<string, string>) => calc("future_value", { amount: +p.amount, ratePercent: +p.rate, years: +p.years }, "Future value")],
        [DOUBLE, (p: Record<string, string>) => calc("rule_of_72", { ratePercent: +p.rate }, "Years to double (approximate)")],
        [STEADY, (p: Record<string, string>) => calc("cagr", { start: +p.start, end: +p.end, years: +p.years }, "CAGR")],
      ] as const) {
        for (const halfDone of t.halfDone ? [false, true] : [false]) {
          const item = drawTemplate(t, seed, { halfDone });
          expect(markAnswer(item, formatExact(item.answer, item.unit)).verdict).toBe("right");
          const exact = check(item.params);
          expect(Number(plainExact(item.answer)), `${item.id}`).toBeCloseTo(Math.round(exact * 10 ** t.decimals) / 10 ** t.decimals, 9);
          expect(nearRoundingBoundary(exactFrom(exact.toFixed(9)), t.decimals), item.id).toBe(false);
          for (const m of item.mistakes) expect(markAnswer(item, plainExact(m.value)).verdict).toBe("known_mistake");
        }
      }
    }
  });
});

describe("the rounding boundary", () => {
  it("is near 8.4995 to 8.5005 at whole numbers, and not at 8.498", () => {
    expect(nearRoundingBoundary(exactFrom("8.4995"), 0)).toBe(true);
    expect(nearRoundingBoundary(exactFrom("8.5005"), 0)).toBe(true);
    expect(nearRoundingBoundary(exactFrom("8.498"), 0)).toBe(false);
    expect(nearRoundingBoundary(exactFrom("10.2857"), 1)).toBe(false);
    expect(nearRoundingBoundary(exactFrom("4.5500"), 1)).toBe(true);
  });
});
