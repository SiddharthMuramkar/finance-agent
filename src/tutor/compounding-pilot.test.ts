import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { formulaCheckErrors } from "@/course/formula-check";
import { lessonLintErrors } from "@/course/lesson-lint";
import { isConverted, loadCourseMap, parseCourseMap, testedSkills, type CourseMap, type QuickTry, type Topic } from "@/course/map";
import { navigate } from "@/course/navigator";
import { parseTemplateInstanceId, selectQuestions } from "@/course/quiz";
import { OWNER_LEARNER_ID } from "@/db/schema";
import { loadProgress, saveCheckResult, saveFinishedStep } from "@/learner/memory";
import { openQuiz, submitQuiz } from "@/learner/quiz";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { WIDGET_SHOWN } from "@/widgets/shown-widget";
import { answerQuickTry, enterStepItems, quickTryItem } from "./practice";
import { CONCEPT_CARD, QUICK_TRY, QUICK_TRY_RESULT, type QuickTryData } from "./session-item-kinds";
import { runTutorTurn } from "./turn";
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
/** The real Topic alone, as a one-Topic course, so it comes first on the path. */
function compoundingOnly(): CourseMap {
  const text = stringify({ ...topic, connections: undefined, stage: "foundation", path: 1, prerequisites: [], subject: undefined });
  const { map: one, errors } = parseCourseMap([{ name: "num-compounding.yaml", text }]);
  if (!one) throw new Error(errors.join("\n"));
  return one;
}
const calc = (id: string, inputs: object, label: string) => {
  const run = calculate(id, inputs);
  if (!run.ok) throw new Error(run.error);
  return run.results.find((r) => r.label === label)!.value;
};

describe("Growth, compounding and logs, converted", () => {
  it("is converted, in rupees, with its six Skills, four terms and three Checks in story-to-principle order", () => {
    expect(isConverted(topic)).toBe(true);
    expect(topic.exampleCurrency).toBe("INR");
    expect(topic.restructure).toBe("content-only");
    expect(topic.skills.map((s) => s.id)).toEqual(["compound-growth", "fall-and-recover", "rule-of-72", "cagr", "log-return", "steady-pace"]);
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
      // Steady pace: 300 to 900 in 2 years is about 73% a year (100 to 900 in 10 is about 25%); ₹800 to ₹1,800 in 2 is 50%.
      expect(Math.round(calc("cagr", { start: 300, end: 900, years: 2 }, "CAGR"))).toBe(tryById("cp-try-pace-half").answer);
      expect(Math.round(calc("cagr", { start: 100, end: 900, years: 10 }, "CAGR"))).toBe(25);
      expect(calc("cagr", { start: 800, end: 1800, years: 2 }, "CAGR")).toBeCloseTo(tryById("cp-try-pace-stretch").answer as number, 9);
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

    it("show at least one typed question on every attempt", () => {
      for (const c of topic.checks) {
        if (c.kind !== "quiz") continue;
        for (let attempt = 0; attempt < 10; attempt++) expect(selectQuestions(c, attempt).some((id) => c.templates.includes(id)), `${c.id} attempt ${attempt}`).toBe(true);
      }
    });

    it("test only Skills taught on a card at or before them, and name a mistake on every wrong choice", () => {
      expect(testedSkills(topic, topic.checks[0])).toEqual(["compound-growth", "fall-and-recover", "rule-of-72"]);
      expect(testedSkills(topic, topic.checks[1])).toEqual(["cagr", "log-return"]);
      expect(testedSkills(topic, topic.checks[2])).toEqual(["steady-pace", "cagr"]);
      for (const q of topic.questions) for (const choice of q.choices) if (choice.id !== q.answer) expect(choice.mistake, `${q.id} ${choice.id}`).toBeDefined();
    });

    it("give the three-year question new numbers: ₹2,000 at 20% is ₹2,880, not the Running example's", () => {
      const q = topic.questions.find((x) => x.id === "cp-q-three-years")!;
      expect(q.prompt).not.toContain("1,000");
      expect(q.choices.find((c) => c.id === q.answer)!.text).toBe("₹2,880");
      expect(calc("future_value", { amount: 2000, ratePercent: 20, years: 2 }, "Future value")).toBeCloseTo(2880, 9);
    });
  });

  it("plays story to principle: both quizzes taken with typed answers (one slip first), the conversation Check, the reveal and a passed Topic", async () => {
    const one = compoundingOnly();
    const db = await testDb();
    const at = async () => navigate(one, await loadProgress(db, OWNER_LEARNER_ID));
    const finishStep = (step: Parameters<typeof saveFinishedStep>[2]) => saveFinishedStep(db, one, step, new Date(), OWNER_LEARNER_ID);
    // The opener starts the Topic and its Session.
    const { client } = scriptedClient([{ content: [{ type: "text", text: "Picture Bombay in March 1992." }] }]);
    let sessionId = 0;
    for await (const e of runTutorTurn({ db, client, map: one, learnerId: OWNER_LEARNER_ID }, "Hi")) if (e.type === "done") sessionId = e.ref.sessionId;
    expect((await at())?.step).toBe("story");
    await finishStep("story");

    /** Enters the Concept step: code shows the card, then its rupee Formula Card set to the card's numbers. */
    const concept = async (checkId: string) => {
      const items = await enterStepItems(db, one, OWNER_LEARNER_ID, sessionId, new Date());
      expect(items.map((i) => i.kind), checkId).toEqual([CONCEPT_CARD, WIDGET_SHOWN]);
      expect(items[0].data).toMatchObject({ checkId });
      expect(items[1].data).toMatchObject({ recipe: "formula" });
      expect(JSON.stringify(items[1].data)).not.toContain('"usd"');
      await finishStep("concept");
    };

    /** Plays Your turn through code's Quick tries until fluency ends it; the first try makes the named slip once. */
    const yourTurn = async (checkId: string) => {
      let open = (await enterStepItems(db, one, OWNER_LEARNER_ID, sessionId, new Date())).find((i) => i.kind === QUICK_TRY)?.data as QuickTryData | undefined;
      expect(open?.halfDone, `${checkId}: the first try is half-done`).toBeTruthy();
      let slipped = false;
      for (let n = 0; open && n < 40; n++) {
        const { item } = quickTryItem(one.topic("num-compounding")!, open.key)!;
        const right: string = "templateId" in item ? formatExact(item.answer, item.unit) : String(item.answer);
        const mistake: string | undefined =
          "templateId" in item ? (item.mistakes[0] ? plainExact(item.mistakes[0].value) : undefined) : item.mistakes?.[0] ? String(item.mistakes[0].answer) : undefined;
        const input: string = !slipped && mistake ? mistake : right;
        const answered = await answerQuickTry(db, one, OWNER_LEARNER_ID, open.key, input, new Date());
        if (!answered.ok) throw new Error(answered.error);
        const result = answered.items.find((i) => i.kind === QUICK_TRY_RESULT)!.data as { verdict: string };
        expect(result.verdict, open.prompt).toBe(input === right ? "right" : "known_mistake");
        slipped ||= input !== right;
        open = answered.items.find((i) => i.kind === QUICK_TRY)?.data as QuickTryData | undefined;
      }
      expect(slipped, checkId).toBe(true);
      expect((await at())?.step, checkId).toBe("check");
    };

    /** The right answer to each shown question: a choice's key, or a typed draw rebuilt from its seed. */
    const rightAnswers = (ids: string[]) =>
      Object.fromEntries(
        ids.map((id) => {
          const parsed = parseTemplateInstanceId(id);
          if (parsed) {
            const drawn = drawTemplate(one.template(parsed.templateId)!, parsed.seed);
            return [id, formatExact(drawn.answer, drawn.unit)];
          }
          return [id, topic.questions.find((q) => q.id === id)!.answer];
        }),
      );

    for (const [i, checkId] of ["cp-quiz-compounding", "cp-quiz-steady-rate"].entries()) {
      expect((await at())?.step, checkId).toBe("concept");
      await concept(checkId);
      await yourTurn(checkId);
      const open = (await openQuiz(db, one, new Date(), OWNER_LEARNER_ID))!;
      expect(open.checkId).toBe(checkId);
      const typed = open.questions.filter((q) => q.kind === "number");
      expect(typed.length, checkId).toBeGreaterThan(0);
      const answers = rightAnswers(open.questions.map((q) => q.id));
      if (i === 0) {
        // The first attempt makes the named slip on a typed question and on a choice, and fails.
        const slipped = { ...answers };
        for (const q of open.questions) {
          const parsed = parseTemplateInstanceId(q.id);
          if (parsed) slipped[q.id] = plainExact(drawTemplate(one.template(parsed.templateId)!, parsed.seed).mistakes[0].value);
          else slipped[q.id] = topic.questions.find((x) => x.id === q.id)!.choices.find((c) => c.mistake)!.id;
        }
        const res = await submitQuiz(db, one, open.attemptId, slipped, new Date(), OWNER_LEARNER_ID);
        if (!res.ok) throw new Error(res.reason);
        expect(res.passed).toBe(false);
        expect(res.questions.every((q) => q.mistake)).toBe(true);
        const retry = (await openQuiz(db, one, new Date(), OWNER_LEARNER_ID))!;
        const passed = await submitQuiz(db, one, retry.attemptId, rightAnswers(retry.questions.map((q) => q.id)), new Date(), OWNER_LEARNER_ID);
        expect(passed).toMatchObject({ ok: true, passed: true });
      } else {
        expect(await submitQuiz(db, one, open.attemptId, answers, new Date(), OWNER_LEARNER_ID)).toMatchObject({ ok: true, passed: true });
      }
    }

    // The conversation Check, then the reveal and the principle.
    expect((await at())?.step).toBe("concept");
    await concept("cp-sensex-rate");
    // The conversation Check practises its own Skill (steady pace), so Your turn ends through Quick tries here too.
    expect((await finishStep("your_turn")).ok).toBe(false);
    await yourTurn("cp-sensex-rate");
    expect(await saveCheckResult(db, one, { checkId: "cp-sensex-rate", passed: true, toolCallId: "v-sensex" }, new Date(), OWNER_LEARNER_ID)).toMatchObject({ ok: true });
    expect((await at())?.step).toBe("reveal");
    await finishStep("reveal");
    expect((await at())?.step).toBe("principle");
    await finishStep("principle");
    expect((await loadProgress(db, OWNER_LEARNER_ID)).topics["num-compounding"]?.status).toBe("passed");
  });

  it("keeps the conversation Check on the Sensex, with its Skills listed", () => {
    const c = topic.checks[2];
    expect(c.kind === "conversation" && c.skills).toEqual(["steady-pace", "cagr"]);
    expect(c.kind === "conversation" && c.prompt).toContain("4,285");
  });
});
