import { describe, expect, it } from "vitest";
import { formulaCheckErrors } from "@/course/formula-check";
import { lessonLintErrors } from "@/course/lesson-lint";
import { isConverted, loadCourseMap, testedSkills, type QuickTry, type Topic } from "@/course/map";
import { calculate } from "@/finance/calculators";
import { markerProblems } from "@/finance/formula-markers";
import { plainFormulaText } from "@/finance/formula-text";
import { drawTemplate, formatExact, markAnswer, plainExact } from "@/teaching";
import { widgetProblems, widgetRuleProblems } from "@/widgets/check";
import { recipeById } from "@/widgets/recipes";
import { readWidget } from "@/widgets/widget-reading";

/**
 * Growth, compounding and logs, taught the new way (ticket #247): the converted Topic file from story to principle.
 * Each card opens a rupee Formula Card already set, each Skill has Quick tries that open half-done and name a Known
 * mistake, both quizzes draw typed questions with new numbers, and the conversation Check lists its Skills. Every
 * fixed answer is checked against the tested calculators, or worked by hand in the comment beside it.
 */

const map = loadCourseMap();
const topic = map.topic("num-compounding")!;
const fixedTries = (t: Topic) => t.checks.flatMap((c) => c.quickTries.filter((q): q is Extract<QuickTry, { id: string }> => "id" in q));
const tryById = (id: string) => fixedTries(topic).find((q) => q.id === id)!;
const calc = (id: string, inputs: object, label: string) => {
  const run = calculate(id, inputs);
  if (!run.ok) throw new Error(run.error);
  return run.results.find((r) => r.label === label)!.value;
};

describe("Growth, compounding and logs, converted", () => {
  it("is converted, in rupees, with its five Skills, four terms and three Checks in story-to-principle order", () => {
    expect(isConverted(topic)).toBe(true);
    expect(topic.exampleCurrency).toBe("INR");
    expect(topic.restructure).toBe("content-only");
    expect(topic.skills.map((s) => s.id)).toEqual(["compound-growth", "fall-and-recover", "rule-of-72", "cagr", "log-return"]);
    expect(topic.terms.map((t) => t.term)).toEqual(["compounding", "compound annual growth rate (CAGR)", "rule of 72", "log return"]);
    expect(topic.checks.map((c) => [c.id, c.kind])).toEqual([
      ["cp-quiz-compounding", "quiz"],
      ["cp-quiz-steady-rate", "quiz"],
      ["cp-sensex-rate", "conversation"],
    ]);
    expect(topic.formulas).toEqual(["compound-growth", "cagr"]);
    expect(topic.checks.every((c) => !c.required)).toBe(true);
  });

  it("passes the lesson lint and the typed-formula check, and keeps every old question id", () => {
    expect(lessonLintErrors([topic], { notYet: [] })).toEqual([]);
    expect(formulaCheckErrors([topic], [])).toEqual([]);
    for (const id of ["cp-q-doubling-rate", "cp-q-down-up", "cp-q-rule-72", "cp-q-three-years", "cp-q-log-return", "cp-q-index-rate"]) {
      expect(topic.questions.some((q) => q.id === id), id).toBe(true);
    }
  });

  it("sends the Tutor the concept's Formula Cards in words, worked by code in rupees", () => {
    expect(markerProblems(topic.concept, topic.formulas)).toEqual([]);
    const words = plainFormulaText(topic.concept);
    expect(words).toContain("₹1,331");
    expect(words).toContain("10.00%");
    expect(words).not.toContain("{{formula:");
    expect(words).not.toContain("$");
  });

  describe("the Concept cards", () => {
    it("open a rupee Formula Card already set, which builds, passes the Widget checks and reads in rupees", () => {
      for (const c of topic.checks) {
        const preset = c.card!.widget!;
        expect("recipe" in preset && preset.recipe, c.id).toBe("formula");
        if (!("recipe" in preset)) continue;
        const built = recipeById("formula")!.build({ title: preset.title ?? c.card!.title, inputs: preset.inputs, refs: {}, facts: {} });
        if (!built.ok) throw new Error(`${c.id}: ${built.error}`);
        expect([...widgetProblems(built.code), ...widgetRuleProblems(built.code)], c.id).toEqual([]);
        const reading = readWidget(built.code, undefined, () => undefined)!;
        expect(JSON.stringify(reading), c.id).not.toContain("$");
      }
      const first = topic.checks[0].card!.widget!;
      if (!("recipe" in first)) throw new Error("recipe preset");
      const built = recipeById("formula")!.build({ title: "Growth on growth", inputs: first.inputs, refs: {}, facts: {} });
      if (!built.ok) throw new Error(built.error);
      expect(readWidget(built.code, undefined, () => undefined)!.readouts).toEqual(["Compound growth of one amount: What it grows to (future value) ₹1,331"]);
    });

    it("say the Running example in words, with the Formula Card's own figures (₹1,000 at 10% is ₹1,100, ₹1,210, ₹1,331)", () => {
      const lines = topic.checks[0].card!.lines.join(" ");
      for (const figure of ["₹1,000", "₹1,100", "₹1,210", "₹1,331"]) expect(lines).toContain(figure);
      for (const years of [1, 2, 3]) expect(calc("future_value", { amount: 1000, ratePercent: 10, years }, "Future value")).toBeCloseTo([1100, 1210, 1331][years - 1], 9);
    });

    it("round the third card's made-up stretches as the calculator does: 100 to 600 in 10 years is about 20%, 300 to 600 in 2 is about 41%", () => {
      const lines = topic.checks[2].card!.lines.join(" ");
      expect(lines).toContain("about 20% a year");
      expect(lines).toContain("about 41% a year");
      expect(Math.round(calc("cagr", { start: 100, end: 600, years: 10 }, "CAGR"))).toBe(20);
      expect(Math.round(calc("cagr", { start: 300, end: 600, years: 2 }, "CAGR"))).toBe(41);
    });
  });

  describe("the Quick tries", () => {
    it("give every Skill at least three tries, the first of them half-done", () => {
      for (const s of topic.skills) {
        const tries = topic.checks.flatMap((c) => c.quickTries).filter((q) => ("id" in q ? q.skill : topic.templates.find((x) => x.id === q.template)?.skill) === s.id);
        expect(tries.length, s.id).toBeGreaterThanOrEqual(3);
        expect(tries[0].halfDone, s.id).toBeTruthy();
      }
    });

    it("hold answers the tested calculators agree with", () => {
      // ₹2,000 at 10% for 2 years.
      expect(calc("future_value", { amount: 2000, ratePercent: 10, years: 2 }, "Future value")).toBeCloseTo(tryById("cp-try-grow-half").answer as number, 9);
      // 72 ÷ 9 is 8, and 72 ÷ 18 is 4.
      expect(calc("rule_of_72", { ratePercent: 9 }, "Years to double (approximate)")).toBe(tryById("cp-try-72-half").answer);
      expect(calc("rule_of_72", { ratePercent: 18 }, "Years to double (approximate)")).toBe(4);
      // 100 to 121 in 2 years.
      expect(calc("cagr", { start: 100, end: 121, years: 2 }, "CAGR")).toBeCloseTo(tryById("cp-try-cagr-half").answer as number, 9);
      // By hand: ₹500 down 40% is ₹300, and 40% up on ₹300 is ₹420; ₹200 back up to ₹400 is a 100% rise.
      expect(tryById("cp-try-fall-half").answer).toBe(420);
      expect(tryById("cp-try-recover").answer).toBe(100);
      // Log returns add: 0.1 and 0.2 make 0.3; 0.25 and 0.15 make 0.4. Doubling then halving: log 2 and minus log 2.
      expect(tryById("cp-try-log-half").answer).toBe(0.3);
      expect(tryById("cp-try-log-add").answer).toBe(0.4);
      expect(Math.log(2) + Math.log(0.5)).toBeCloseTo(0, 12);
    });

    it("mark the real slips as Known mistakes with their fixes", () => {
      expect(markAnswer(tryById("cp-try-grow-half"), "2400")).toMatchObject({ verdict: "known_mistake", tag: "simple_growth" });
      expect(markAnswer(tryById("cp-try-grow-half"), "₹2,420")).toMatchObject({ verdict: "right" });
      expect(markAnswer(tryById("cp-try-fall-half"), "500")).toMatchObject({ verdict: "known_mistake", tag: "back_where_started" });
      expect(markAnswer(tryById("cp-try-fall-truth"), "true")).toMatchObject({ verdict: "known_mistake", tag: "back_where_started" });
      expect(markAnswer(tryById("cp-try-72-half"), "11.1")).toMatchObject({ verdict: "known_mistake", tag: "simple_doubling" });
      expect(markAnswer(tryById("cp-try-cagr-half"), "10.5%")).toMatchObject({ verdict: "known_mistake", tag: "averaged_gain" });
      for (const q of fixedTries(topic)) expect(markAnswer(q, String(q.answer)).verdict, q.id).toBe("right");
    });
  });

  describe("the two quizzes", () => {
    it("draw typed questions with new numbers, marking the right answer and the named slip", () => {
      const quizzes = topic.checks.filter((c) => c.kind === "quiz");
      expect(quizzes.map((c) => c.kind === "quiz" && c.templates)).toEqual([["grow-amount", "double-time"], ["steady-rate"]]);
      for (const c of quizzes) {
        if (c.kind !== "quiz") continue;
        for (const tid of c.templates) {
          const t = map.template(tid)!;
          const a = drawTemplate(t, "attempt-1");
          const b = drawTemplate(t, "attempt-2");
          expect(markAnswer(a, formatExact(a.answer, a.unit)).verdict).toBe("right");
          expect(markAnswer(a, plainExact(a.mistakes[0].value))).toMatchObject({ verdict: "known_mistake", tag: t.mistakes[0].tag });
          expect([a.prompt, b.prompt].some((p) => p !== a.prompt) || drawTemplate(t, "attempt-3").prompt !== a.prompt).toBe(true);
          expect(a.unit).toMatch(/^(inr|percent|years|ratio)$/);
        }
      }
    });

    it("test only Skills taught on a card at or before them, and name a mistake on every wrong choice", () => {
      expect(testedSkills(topic, topic.checks[0])).toEqual(["compound-growth", "fall-and-recover", "rule-of-72"]);
      expect(testedSkills(topic, topic.checks[1])).toEqual(["cagr", "log-return"]);
      expect(testedSkills(topic, topic.checks[2])).toEqual(["cagr", "compound-growth"]);
      for (const q of topic.questions) for (const choice of q.choices) if (choice.id !== q.answer) expect(choice.mistake, `${q.id} ${choice.id}`).toBeDefined();
    });

    it("give the three-year question new numbers: ₹2,000 at 20% is ₹2,880, not the Running example's", () => {
      const q = topic.questions.find((x) => x.id === "cp-q-three-years")!;
      expect(q.prompt).not.toContain("1,000");
      expect(q.choices.find((c) => c.id === q.answer)!.text).toBe("₹2,880");
      expect(calc("future_value", { amount: 2000, ratePercent: 20, years: 2 }, "Future value")).toBeCloseTo(2880, 9);
    });
  });

  it("keeps the conversation Check on the Sensex, with its Skills listed", () => {
    const c = topic.checks[2];
    expect(c.kind === "conversation" && c.skills).toEqual(["cagr", "compound-growth"]);
    expect(c.kind === "conversation" && c.prompt).toContain("4,285");
  });
});
