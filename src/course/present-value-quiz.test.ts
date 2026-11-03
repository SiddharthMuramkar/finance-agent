import { describe, expect, it } from "vitest";
import { presentValue } from "@/finance/present-value";
import { loadCourseMap } from "./map";

const map = loadCourseMap();
const topic = map.topic("present-value")!;
const answerText = (id: string) => {
  const q = map.question(id)!;
  return q.choices.find((c) => c.id === q.answer)!.text;
};
const dollars = (text: string) => Number(text.replace(/[$,]/g, ""));

describe("present value Topic quiz", () => {
  it("has a quiz Check and a conversation Check", () => {
    expect(topic.checks.map((c) => c.kind).sort()).toEqual(["conversation", "quiz"]);
  });

  it("cites a source for every question", () => {
    for (const q of topic.questions) expect(q.source, q.id).toMatch(/https:\/\//);
  });

  it("numeric answers match the tested Finance Calculations", () => {
    const cases: [string, number, number, number][] = [
      ["pv-q-one-year", 1100, 10, 1],
      ["pv-q-two-years", 1210, 10, 2],
      ["pv-q-five-percent", 5000, 5, 2],
    ];
    for (const [id, amount, rate, years] of cases) {
      expect(dollars(answerText(id)), id).toBe(Math.round(presentValue(amount, rate, years)));
    }
  });

  it("the other answers follow from the formula", () => {
    expect(answerText("pv-q-today-vs-later")).toBe("The $1,000 offered today");
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
