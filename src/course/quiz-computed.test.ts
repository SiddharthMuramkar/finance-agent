import { describe, expect, it } from "vitest";
import { AMAZON_2000 } from "@/finance/fixtures/amazon-2000.valuation";
import type { QuizCheck } from "./map";
import { computedKeyedQuestion, instantiateSlots, markAttempt, parseComputedInstanceId, publicQuestions, selectQuestions, type QuestionLookup } from "./quiz";
import { spineData, spineMap } from "./spine-fixture";

// Computed judgement questions served and marked in a quiz Check like written ones (spec 2026-11-12, D1 to D3, D5), on
// the Spine fixture's Amazon Case. Expected figures are the spec's (B3's table, D1's examples, Appendix B.2).

const map = spineMap();
const check = map.check("worth-check") as QuizCheck & { topicId: string };
const lookup: QuestionLookup = { question: (id) => map.question(id) ?? computedKeyedQuestion(map, id) };

describe("serving a computed question", () => {
  it("works out the choices, the right choice and the figures from the Case, with no answer in the file", () => {
    const q = computedKeyedQuestion(map, "worth-q-lever")!;
    expect(q.answer).toBe("margin");
    expect(Object.fromEntries(q.choices.map((c) => [c.id, c.figure]))).toEqual({ margin: "$48.51", revenue: "$40.66", reinvest: "$39.99", risk: "$38.34" });
    expect(q.skill).toBe("levers");
    expect(computedKeyedQuestion(map, "worth-q-price")!.answer).toBe("bigger-richer");
  });

  it("sends the browser the words only: no figure, answer or fix before the Learner taps", () => {
    const [q] = publicQuestions(lookup, ["worth-q-lever"]);
    expect(Object.keys(q).sort()).toEqual(["choices", "id", "prompt"]);
    expect(q.choices.every((c) => Object.keys(c).sort().join() === "id,text")).toBe(true);
    expect(JSON.stringify(q)).not.toContain("$48.51");
  });

  it("is found by the bare id a Check lists, so a first attempt shows the Check's own set", () => {
    expect(selectQuestions(check, 0)).toEqual(["worth-q-lever", "worth-q-price", "worth-q-predict", "worth-q-direction"]);
    expect(instantiateSlots(map, check, selectQuestions(check, 0), { learnerId: 1, attemptNo: 0 })).toEqual(selectQuestions(check, 0));
  });

  it("draws a fresh set from the pool on a retry, so the same four choices do not come back (D5)", () => {
    const slots = instantiateSlots(map, check, ["worth-q-lever"], { learnerId: 7, attemptNo: 2 });
    expect(parseComputedInstanceId(slots[0])).toEqual({ questionId: "worth-q-lever", seed: "7.worth-check.2" });
    const retry = computedKeyedQuestion(map, slots[0])!;
    expect(retry.choices.map((c) => c.id).sort()).not.toEqual(["margin", "reinvest", "revenue", "risk"]);
    expect(retry.choices.map((c) => c.id)).toContain("leaner");
  });
});

describe("marking a computed question", () => {
  it("marks the tap on the biggest move right, and every choice carries its figure in the marking", () => {
    const marking = markAttempt(lookup, check, ["worth-q-lever"], { "worth-q-lever": "margin" });
    expect(marking.questions[0]).toMatchObject({ correct: true, expected: "Margin 10% to 12%" });
    expect(marking.questions[0].choices.find((c) => c.id === "margin")?.figure).toBe("$48.51");
  });

  it("answers a wrong tap with a fix that quotes the two figures being compared (D3)", () => {
    const [q] = markAttempt(lookup, check, ["worth-q-lever"], { "worth-q-lever": "risk" }).questions;
    expect(q.correct).toBe(false);
    expect(q.mistake?.fix).toBe("Cost of capital 12.84% to 11.84% gives $38.34, about $3 a share more. Margin 10% to 12% gives $48.51, about $13 more.");
    expect(q.explanation).toContain("Margin and growth move the value most");
  });

  it("stores a predict tap and shows it beside the result, never marked wrong (D1)", () => {
    const marking = markAttempt(lookup, check, ["worth-q-predict"], { "worth-q-predict": "most" });
    expect(marking.questions[0]).toMatchObject({ correct: true, predict: { said: "About two thirds", landed: "Nothing left", figure: "$0" } });
    expect(marking.questions[0].prompt).toBe("If margins end at 4% instead of 10%, the value will be:");
    expect(markAttempt(lookup, check, ["worth-q-predict"], {}).questions[0].correct).toBe(false);
  });

  it("changes its right answer and figures when the Case's valuation input changes, with no edit to the question", () => {
    // Growth twice as costly (sales to capital 1.5): moving it to 4 now lifts the value most.
    const costly = spineMap(spineData((d) => void ((d.cases[0] as { valuation: unknown }).valuation = { ...AMAZON_2000, salesToCapital: 1.5, reproduces: false })));
    const q = computedKeyedQuestion(costly, "worth-q-lever")!;
    expect(q.answer).toBe("reinvest");
    expect(q.choices.find((c) => c.id === "margin")?.figure).not.toBe("$48.51");
  });
});

describe("a computed Quick try", () => {
  it("loads as a choice try whose answer and fixes code worked out from the Case", () => {
    const tryItem = map.topic("spine-01-worth")!.checks[0].quickTries.find((q) => "id" in q && q.id === "worth-try-lever-computed");
    expect(tryItem).toMatchObject({ kind: "choice", answer: "margin", computed: { kind: "which_lever", case: "amazon-worth" } });
    const choices = "id" in tryItem! ? tryItem.choices! : [];
    expect(choices.find((c) => c.id === "risk")?.mistake?.fix).toBe("Cost of capital 12.84% to 11.84% gives $38.34, about $3 a share more. Margin 10% to 12% gives $48.51, about $13 more.");
    expect(choices.map((c) => c.text).sort()).toEqual(["Cost of capital 12.84% to 11.84%", "Margin 10% to 12%", "Sales to capital 3 to 4"]);
  });
});
