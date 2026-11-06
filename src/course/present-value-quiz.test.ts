import { describe, expect, it } from "vitest";
import { presentValue } from "@/finance/present-value";
import { loadCourseMap } from "./map";

const map = loadCourseMap();
const topic = map.topic("present-value")!;
const answerText = (id: string) => {
  const q = map.question(id)!;
  return q.choices.find((c) => c.id === q.answer)!.text;
};

describe("present value Topic quiz", () => {
  it("has a quiz Check and a conversation Check", () => {
    expect(topic.checks.map((c) => c.kind).sort()).toEqual(["conversation", "quiz"]);
  });

  it("cites a source for every question", () => {
    for (const q of topic.questions) expect(q.source, q.id).toMatch(/https:\/\//);
  });

  it("asks about ideas and words, with no choice that is a bare figure to work out (E6a)", () => {
    for (const id of ["pv-q-one-year", "pv-q-two-years", "pv-q-five-percent"]) {
      const q = map.question(id)!;
      expect(q.choices.some((c) => /^[$₹]\s?[\d,]+$/.test(c.text)), id).toBe(false);
    }
  });

  it("the answers follow from the formula", () => {
    expect(answerText("pv-q-today-vs-later")).toBe("The ₹1,000 offered today");
    // Waiting one year at 10% turns 1,100 into 1,000 today: the answer names that sum its present value.
    expect(Math.round(presentValue(1100, 10, 1))).toBe(1000);
    expect(answerText("pv-q-one-year")).toBe("Present value");
    // Two years discount twice.
    expect(Math.round(presentValue(1210, 10, 2))).toBe(1000);
    expect(answerText("pv-q-two-years")).toContain("twice");
    // A lower rate shrinks a payment less.
    expect(presentValue(5000, 5, 2)).toBeGreaterThan(presentValue(5000, 10, 2));
    expect(answerText("pv-q-five-percent")).toContain("worth more today");
    // A higher rate lowers the present value of a fixed payment.
    expect(presentValue(1000, 8, 10)).toBeLessThan(presentValue(1000, 4, 10));
    expect(answerText("pv-q-rate-rises")).toBe("It falls");
    // 30 payments, first now: the sum of present values is below the plain sum.
    const stream = Array.from({ length: 30 }, (_, year) => presentValue(50, 5, year)).reduce((a, b) => a + b, 0);
    expect(stream).toBeLessThan(30 * 50);
    expect(answerText("pv-q-annuity-total")).toBe("It is less than the total");
  });

  it("every question of the quiz Check is on the Topic, with a pass rule from the map", () => {
    const quiz = topic.checks.find((c) => c.kind === "quiz")!;
    if (quiz.kind !== "quiz") throw new Error();
    expect(quiz.questions.every((id) => map.question(id))).toBe(true);
    expect(quiz.passRule.correct).toBe(2);
  });
});
