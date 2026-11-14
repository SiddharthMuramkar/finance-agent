import { describe, expect, it } from "vitest";
import { drawTemplate, markAnswer, type QuestionTemplate } from ".";

// Template Known mistakes on a rounded ask match a typed answer rounded to the ask's decimals (review item 1).

const DOUBLE: QuestionTemplate = {
  id: "double-time",
  skill: "rule-of-72",
  ask: "Money grows {rate}% a year. By the rule of 72, about how many years does it take to double, to one decimal place?",
  params: { rate: { min: 12, max: 12, step: 1 } },
  answer: "rule_of_72_years",
  unit: "years",
  decimals: 1,
  sign: "magnitude",
  mistakes: [{ tag: "simple_doubling", fix: "That is 100 divided by the rate." }],
};

const STEADY: QuestionTemplate = {
  id: "steady-rate",
  skill: "cagr",
  ask: "An index goes from {start} to {end} in {years} years. What steady yearly rate (CAGR) does that, in percent?",
  params: { start: { min: 100, max: 100, step: 100 }, g: { min: 30, max: 30, step: 10 }, years: { min: 2, max: 2, step: 1 } },
  derived: { r: "times(g, 0.01)", f: "plus(1, r)", grew: "times(f, f)", end: "times(start, grew)" },
  answer: "cagr_percent",
  unit: "percent",
  decimals: 0,
  sign: "magnitude",
  mistakes: [{ tag: "averaged_gain", fix: "That divides the total gain by the years." }],
};

describe("rounded template mistakes", () => {
  it("names simple_doubling for 8.3 (and 8.33) on a rate-12 double-time draw", () => {
    const item = drawTemplate(DOUBLE, "s");
    expect(markAnswer(item, "6").verdict).toBe("right");
    expect(markAnswer(item, "8.3")).toMatchObject({ verdict: "known_mistake", tag: "simple_doubling" });
    expect(markAnswer(item, "8.33")).toMatchObject({ verdict: "known_mistake", tag: "simple_doubling" });
  });

  it("matches an averaged_gain that falls on x.5 at 0 decimals", () => {
    const item = drawTemplate(STEADY, "s");
    const hit = markAnswer(item, "35");
    expect(hit).toMatchObject({ verdict: "known_mistake", tag: "averaged_gain" });
  });
});
