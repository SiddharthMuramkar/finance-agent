import { describe, expect, it } from "vitest";
import { bondDuration } from "@/finance/valuation";
import { loadCourseMap, writtenQuestions } from "./map";

// Spec 2026-11-12, Part H: the content corrections H2 to H4. Each expected sentence or figure comes from the spec's table,
// not from the Topic files; the durations are worked by the tested bond calculator.

const map = loadCourseMap();
const topic = (id: string) => map.topic(id)!;
const BOE = "https://www.bankofengland.co.uk/quarterly-bulletin/2014/q1/money-creation-in-the-modern-economy";

describe("H2: Money, banks and credit creation", () => {
  const banking = topic("eco-money-banking");
  const questions = writtenQuestions(banking);

  it("keeps its first point, that a loan creates a deposit", () => {
    expect(banking.concept).toContain("so the loan creates a new deposit");
  });

  it("presents the multiplier as a classroom upper limit, names capital, demand for loans and the policy rate, and cites the Bank of England", () => {
    expect(banking.concept).toContain("classroom upper limit, not how lending is decided");
    for (const limit of ["capital", "demand for loans", "policy rate"]) expect(banking.concept).toContain(limit);
    expect(banking.concept).toContain("Bank of England, 2014");
    expect(banking.concept).not.toMatch(/1 divided by the reserve ratio|required to keep only a fraction/);
  });

  it("asks no question that teaches the retired model as fact: both multiplier questions are answered from the Bank of England", () => {
    for (const id of ["mb-q-multiplier", "mb-q-multiplier-ratio"]) {
      const q = questions.find((x) => x.id === id)!;
      const right = q.choices.find((c) => c.id === q.answer)!.text;
      expect(right, id).toMatch(/classroom upper limit|capital/);
      expect(q.source, id).toContain(BOE);
    }
    for (const q of questions) {
      const taught = [q.choices.find((c) => c.id === q.answer)!.text, q.explanation].join(" ");
      expect(taught, q.id).not.toMatch(/keep only a fraction of deposits as reserves|grows the money supply by a multiple|thinner slice in reserve/);
    }
  });

  it("no longer promises that reserves limit lending", () => {
    expect(banking.youllLearn!.join(" ")).not.toMatch(/reserves limit/);
  });
});

describe("H3: DCF valuation's reveal", () => {
  it("says about 9.61% and gives the published terminal value of $52,148 million without the sum that gives 52,105", () => {
    const reveal = topic("val-dcf").cases.find((c) => c.id === "amazon-dcf-2000")!.reveal;
    expect(reveal).toContain("about 9.61%");
    expect(reveal).toContain("$52,148 million");
    expect(reveal).not.toMatch(/1,881 \//);
  });
});

describe("H4: Duration and convexity", () => {
  const concept = topic("bond-duration").concept.replace(/\s+/g, " ");

  it("names both durations of a 10-year 6% bond at a 6% yield: Macaulay about 7.7 years, modified about 7.4", () => {
    expect(concept).toContain("Macaulay duration of about 7.7 years and a modified duration of about 7.4");
    expect(concept).not.toContain("has a duration of about 7.4");
  });

  it("agrees with the bond calculator for half-yearly coupons", () => {
    const { macaulay, modified } = bondDuration(100, 6, 6, 10, 2);
    expect(macaulay.toFixed(1)).toBe("7.7");
    expect(modified.toFixed(1)).toBe("7.4");
  });

  it("says modified duration wherever its questions use the 7.4 rule", () => {
    const rule = writtenQuestions(topic("bond-duration")).find((q) => q.id === "bd-q-rule")!;
    expect(rule.prompt).toContain("modified duration of 7.4");
    expect(rule.explanation).toContain("Modified duration is the rule of thumb");
    expect(rule.explanation).toContain("Macaulay duration");
  });
});

// Spec 2026-11-12 C5: Spine Topic 1's reveal gives the $91.50 high and the $14.88 low. The high came in early January
// 2000, before the Case's as-of date (the $84 close of 3 February), so the reveal places it a month earlier, never as a
// rise after the Case date.
describe("C5: Spine Topic 1's reveal", () => {
  const amazon = loadCourseMap().topic("spine-01-worth")!.cases[0];
  const reveal = amazon.reveal.replace(/\s+/g, " ");

  it("gives his $35.08 against the $84 price, the $91.50 high and the $14.88 low", () => {
    for (const figure of ["$35.08", "$84", "$91.50", "$14.88"]) expect(reveal).toContain(figure);
  });

  it("places the $91.50 high before the Case date, not as a later rise", () => {
    expect(amazon.asOf).toBe("2000-02-03");
    expect(reveal).toMatch(/a month earlier, in early January 2000, the shares had traded as high as \$91\.50/);
    expect(reveal).not.toMatch(/did not fall at once/);
    expect(reveal.indexOf("$91.50")).toBeLessThan(reveal.indexOf("$14.88"));
  });
});
