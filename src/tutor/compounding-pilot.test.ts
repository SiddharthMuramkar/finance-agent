import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { formulaCheckErrors } from "@/course/formula-check";
import { lessonLintErrors } from "@/course/lesson-lint";
import { L10_NOT_YET_STORY } from "@/course/l10-allowlist";
import { isConverted, loadCourseMap, parseCourseMap, testedSkills, type CourseMap, type QuickTry, type Topic } from "@/course/map";
import { navigate } from "@/course/navigator";
import { parseTemplateInstanceId, selectQuestions } from "@/course/quiz";
import { OWNER_LEARNER_ID } from "@/db/schema";
import { loadProgress, saveCheckResult, saveFinishedStep } from "@/learner/memory";
import { openQuiz, submitQuiz } from "@/learner/quiz";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { WIDGET_SHOWN } from "@/widgets/shown-widget";
import { enterStepItems, quickTryItem } from "./practice";
import { answerTyped } from "@/test/answer-typed";
import { CONCEPT_CARD, QUICK_TRY, QUICK_TRY_RESULT, type QuickTryData } from "./session-item-kinds";
import { runTutorTurn } from "./turn";
import { calculate } from "@/finance/calculators";
import { markerProblems } from "@/finance/formula-markers";
import { plainFormulaText } from "@/finance/formula-text";
import { drawTemplate, formatExact, markAnswer, markChoice, plainExact } from "@/teaching";
import { widgetProblems, widgetRuleProblems } from "@/widgets/check";
import { recipeById } from "@/widgets/recipes";
import { readWidget } from "@/widgets/widget-reading";

/**
 * Growth, compounding and logs, taught the new way (ticket #247, split one idea per Check for #248): the converted
 * Topic file from story to principle. Each Check and its card teach one Skill; every card but the log-return one opens
 * a rupee Formula Card already set, each Skill has Quick tries that open half-done and name a Known mistake, the
 * quizzes on a calculation draw typed questions with new numbers, and the conversation Check lists its Skills. Every
 * fixed answer is checked against the tested calculators, or worked by hand in the comment beside it.
 */

const map = loadCourseMap();
const topic = map.topic("num-compounding")!;
const fixedTries = (t: Topic) => t.checks.flatMap((c) => c.quickTries.filter((q): q is Extract<QuickTry, { id: string }> => "id" in q));
const tryById = (id: string) => fixedTries(topic).find((q) => q.id === id)!;
const checkById = (id: string) => topic.checks.find((c) => c.id === id)!;
/** The quiz Checks in order, each with the one Skill it teaches and the templates it draws from. */
const QUIZZES = [
  { id: "cp-quiz-compounding", skill: "compound-growth", templates: ["grow-amount"] },
  { id: "cp-quiz-fall-recover", skill: "fall-and-recover", templates: [] },
  { id: "cp-quiz-rule-72", skill: "rule-of-72", templates: ["double-time"] },
  { id: "cp-quiz-steady-rate", skill: "cagr", templates: ["steady-rate"] },
  { id: "cp-quiz-log-return", skill: "log-return", templates: [] },
];
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
  it("is converted, in rupees, with its six Skills, six terms and six Checks in story-to-principle order", () => {
    expect(isConverted(topic)).toBe(true);
    expect(topic.exampleCurrency).toBe("INR");
    expect(topic.restructure).toBe("content-only");
    expect(topic.skills.map((s) => s.id)).toEqual(["compound-growth", "fall-and-recover", "rule-of-72", "cagr", "log-return", "steady-pace"]);
    expect(topic.terms.map((t) => t.term)).toEqual(["index", "compounding", "CAGR", "bull run", "rule of 72", "log return"]);
    expect(topic.checks.map((c) => [c.id, c.kind])).toEqual([...QUIZZES.map((q) => [q.id, "quiz"]), ["cp-sensex-rate", "conversation"]]);
    expect(topic.formulas).toEqual(["compound-growth", "cagr"]);
    expect(topic.checks.every((c) => !c.required)).toBe(true);
  });

  it("passes the lesson lint and the typed-formula check, and keeps every old question id", () => {
    expect(lessonLintErrors([topic], { notYet: [], l10NotYet: L10_NOT_YET_STORY.filter((id) => id === topic.id) })).toEqual([]);
    expect(formulaCheckErrors([topic], [])).toEqual([]);
    for (const id of ["cp-q-doubling-rate", "cp-q-down-up", "cp-q-rule-72", "cp-q-three-years", "cp-q-log-return", "cp-q-index-rate"]) {
      expect(topic.questions.some((q) => q.id === id), id).toBe(true);
    }
    // Each old question stays in the Check that now teaches its Skill.
    for (const [checkId, questionId] of [
      ["cp-quiz-compounding", "cp-q-three-years"],
      ["cp-quiz-fall-recover", "cp-q-down-up"],
      ["cp-quiz-rule-72", "cp-q-rule-72"],
      ["cp-quiz-steady-rate", "cp-q-doubling-rate"],
      ["cp-quiz-log-return", "cp-q-log-return"],
    ]) {
      const c = checkById(checkId);
      expect(c.kind === "quiz" && c.questions, checkId).toContain(questionId);
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
    it("teach one Skill each, the one their Check tests (a Check teaches one idea)", () => {
      for (const q of QUIZZES) {
        const c = checkById(q.id);
        expect(c.card!.skills, q.id).toEqual([q.skill]);
        expect(testedSkills(topic, c), q.id).toEqual([q.skill]);
      }
      expect(checkById("cp-sensex-rate").card!.skills).toEqual(["steady-pace"]);
    });

    it("open a rupee Formula Card already set, which builds, passes the Widget checks and reads in rupees; log returns have no formula and teach in words", () => {
      expect(checkById("cp-quiz-log-return").card!.widget).toBeUndefined();
      for (const c of topic.checks.filter((x) => x.id !== "cp-quiz-log-return")) {
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

    it("show the fall-and-recover sums the Formula Card agrees with: ₹800 up 20% is ₹960, and up 25% is back to ₹1,000", () => {
      const lines = checkById("cp-quiz-fall-recover").card!.lines.join(" ");
      for (const figure of ["₹1,000", "₹800", "₹160", "₹960", "25%"]) expect(lines).toContain(figure);
      expect(calc("future_value", { amount: 800, ratePercent: 20, years: 1 }, "Future value")).toBeCloseTo(960, 9);
      expect(calc("future_value", { amount: 800, ratePercent: 25, years: 1 }, "Future value")).toBeCloseTo(1000, 9);
    });

    it("check the rule of 72 against compounding: ₹1,000 at 6% for 12 years is about ₹2,012, close to double", () => {
      const lines = checkById("cp-quiz-rule-72").card!.lines.join(" ");
      expect(lines).toContain("about 12 years");
      expect(lines).toContain("₹2,012");
      expect(calc("rule_of_72", { ratePercent: 6 }, "Years to double (approximate)")).toBe(12);
      expect(Math.round(calc("future_value", { amount: 1000, ratePercent: 6, years: 12 }, "Future value"))).toBe(2012);
    });

    it("say on the log-return card what its true-or-false try needs: a price that ends where it began has a log return of zero", () => {
      expect(checkById("cp-quiz-log-return").card!.lines.join(" ")).toContain("A price that ends where it began has a log return of zero.");
    });

    it("round the last card's made-up stretches as the calculator does: 100 to 600 in 10 years is about 20%, 300 to 600 in 2 is about 41%", () => {
      const lines = checkById("cp-sensex-rate").card!.lines.join(" ");
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

    /** The words of a written choice Quick try's right choice (E6a: no Quick try is typed any more). */
    const rightText = (id: string) => {
      const q = tryById(id);
      return q.choices?.find((c) => c.id === q.answer)?.text;
    };

    it("hold choices the tested calculators agree with", () => {
      // ₹2,000 at 10% for 2 years is ₹2,420: the second year adds ₹220, more than the first year's ₹200.
      expect(calc("future_value", { amount: 2000, ratePercent: 10, years: 2 }, "Future value")).toBeCloseTo(2420, 9);
      expect(rightText("cp-try-grow-half")).toContain("₹2,200");
      // 72 ÷ 9 is 8, and 72 ÷ 18 is 4.
      expect(calc("rule_of_72", { ratePercent: 9 }, "Years to double (approximate)")).toBe(8);
      expect(rightText("cp-try-72-half")).toBe("8 years");
      expect(calc("rule_of_72", { ratePercent: 18 }, "Years to double (approximate)")).toBe(4);
      // 100 to 121 in 2 years is 10% a year, not the 10.5% of splitting the gain.
      expect(calc("cagr", { start: 100, end: 121, years: 2 }, "CAGR")).toBeCloseTo(10, 9);
      expect(rightText("cp-try-cagr-half")).toContain("10%");
      // By hand: ₹500 down 40% is ₹300, and 40% up on ₹300 is ₹420, short of ₹500; ₹200 back up to ₹400 is a 100% rise, bigger than the 50% fall.
      expect(500 * 0.6 * 1.4).toBeCloseTo(420, 9);
      expect(rightText("cp-try-fall-half")).toContain("Short of ₹500");
      expect(rightText("cp-try-recover")).toContain("Bigger than the fall");
      // Log returns add: 0.1 and 0.2 make 0.3; 0.25 and 0.15 make 0.4. Doubling then halving: log 2 and minus log 2.
      expect(0.1 + 0.2).toBeCloseTo(0.3, 12);
      expect(0.25 + 0.15).toBeCloseTo(0.4, 12);
      expect(rightText("cp-try-log-half")).toContain("0.3");
      expect(rightText("cp-try-log-add")).toContain("0.4");
      expect(Math.log(2) + Math.log(0.5)).toBeCloseTo(0, 12);
      // Steady pace, in words: growing about 9 times in 10 years is about 25% a year, and tripling in 2 is about 73%, far faster;
      // doubling in 4 years is about 19% a year, and even just doubling in 2 is about 41%, so "more than doubled in 2" is faster.
      expect(Math.round(calc("cagr", { start: 1, end: 9, years: 10 }, "CAGR"))).toBe(25);
      expect(Math.round(calc("cagr", { start: 1, end: 3, years: 2 }, "CAGR"))).toBe(73);
      expect(rightText("cp-try-pace-half")).toContain("Far faster");
      expect(calc("cagr", { start: 1, end: 2, years: 4 }, "CAGR")).toBeLessThan(calc("cagr", { start: 1, end: 2, years: 2 }, "CAGR"));
      expect(rightText("cp-try-pace-stretch")).toBe("The last 2 years");
    });

    it("let the steady-pace tries be answered by the idea, with no division (#484)", () => {
      for (const id of ["cp-try-pace-half", "cp-try-pace-stretch"]) {
        const q = tryById(id);
        const words = [q.ask, q.halfDone ?? "", ...(q.choices ?? []).flatMap((c) => [c.text, c.mistake?.fix ?? ""])].join(" ");
        // No money figures, no rates, no decimals, no big numbers to divide: only year counts and small multiples.
        expect(words, id).not.toMatch(/₹|%|\d\.\d|\d{3}|\d,\d/);
      }
      expect(tryById("cp-try-pace-stretch").ask).toContain("more than doubled");
      expect(tryById("cp-try-pace-half").ask).toContain("more than tripled");
    });

    it("mark the real slips as Known mistakes with their fixes", () => {
      expect(markChoice(tryById("cp-try-grow-half"), "b")).toMatchObject({ verdict: "known_mistake", tag: "simple_growth" });
      expect(markChoice(tryById("cp-try-grow-half"), "a")).toMatchObject({ verdict: "right" });
      expect(markChoice(tryById("cp-try-fall-half"), "b")).toMatchObject({ verdict: "known_mistake", tag: "back_where_started" });
      expect(markAnswer(tryById("cp-try-fall-truth"), "true")).toMatchObject({ verdict: "known_mistake", tag: "back_where_started" });
      expect(markChoice(tryById("cp-try-72-half"), "b")).toMatchObject({ verdict: "known_mistake", tag: "simple_doubling" });
      expect(markChoice(tryById("cp-try-cagr-half"), "b")).toMatchObject({ verdict: "known_mistake", tag: "averaged_gain" });
      for (const q of fixedTries(topic)) {
        expect(q.kind, q.id).not.toBe("number");
        expect((q.kind === "choice" ? markChoice : markAnswer)(q, String(q.answer)).verdict, q.id).toBe("right");
      }
    });
  });

  describe("the quizzes", () => {
    it("draw typed questions with new numbers, marking the right answer and the named slip", () => {
      const quizzes = topic.checks.filter((c) => c.kind === "quiz");
      expect(quizzes.map((c) => c.kind === "quiz" && c.templates)).toEqual(QUIZZES.map((q) => q.templates));
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

    it("keep a double-time draw apart from the rule-of-72 question and Quick tries at 8%, 9% and 18%", () => {
      const t = map.template("double-time")!;
      for (const n of [8, 9, 18]) expect(t.avoid, String(n)).toContain(n);
      for (let i = 0; i < 300; i++) expect(drawTemplate(t, `apart-${i}`).prompt).not.toMatch(/grows (8|9|18)% a year/);
    });

    it("show at least one typed question on every attempt of a Check that has templates", () => {
      for (const c of topic.checks) {
        if (c.kind !== "quiz" || c.templates.length === 0) continue;
        for (let attempt = 0; attempt < 10; attempt++) expect(selectQuestions(c, attempt).some((id) => c.templates.includes(id)), `${c.id} attempt ${attempt}`).toBe(true);
      }
    });

    it("test only Skills taught on a card at or before them, and name a mistake on every wrong choice", () => {
      expect(topic.checks.map((c) => testedSkills(topic, c))).toEqual([...QUIZZES.map((q) => [q.skill]), ["steady-pace", "cagr"]]);
      for (const q of topic.questions) for (const choice of q.choices) if (choice.id !== q.answer) expect(choice.mistake, `${q.id} ${choice.id}`).toBeDefined();
    });

    it("give the three-year question new numbers: ₹2,000 at 20% is ₹2,880, not the Running example's", () => {
      const q = topic.questions.find((x) => x.id === "cp-q-three-years")!;
      expect(q.prompt).not.toContain("1,000");
      expect(q.choices.find((c) => c.id === q.answer)!.text).toContain("bigger total");
      expect(calc("future_value", { amount: 2000, ratePercent: 20, years: 2 }, "Future value")).toBeCloseTo(2880, 9);
    });
  });

  it("plays story to principle: every quiz taken (one slip first), the conversation Check, the reveal and a passed Topic", async () => {
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

    /** Enters the Concept step: code shows the card, then its rupee Formula Card set to the card's numbers, if it has one. */
    const concept = async (checkId: string) => {
      const items = await enterStepItems(db, one, OWNER_LEARNER_ID, sessionId, new Date());
      const withWidget = Boolean(checkById(checkId).card!.widget);
      expect(items.map((i) => i.kind), checkId).toEqual(withWidget ? [CONCEPT_CARD, WIDGET_SHOWN] : [CONCEPT_CARD]);
      expect(items[0].data).toMatchObject({ checkId });
      if (withWidget) expect(items[1].data).toMatchObject({ recipe: "formula" });
      expect(JSON.stringify(items.at(-1)!.data)).not.toContain('"usd"');
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
          "templateId" in item
            ? item.mistakes[0]
              ? plainExact(item.mistakes[0].value)
              : undefined
            : item.kind === "choice"
              ? item.choices?.find((c) => c.mistake)?.id
              : item.mistakes?.[0]
                ? String(item.mistakes[0].answer)
                : undefined;
        const input: string = !slipped && mistake ? mistake : right;
        const answered = await answerTyped(db, one, OWNER_LEARNER_ID, open.key, input, new Date());
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
            return [id, plainExact(drawn.answer)];
          }
          return [id, topic.questions.find((q) => q.id === id)!.answer];
        }),
      );

    for (const [i, { id: checkId, templates }] of QUIZZES.entries()) {
      expect((await at())?.step, checkId).toBe("concept");
      await concept(checkId);
      await yourTurn(checkId);
      const open = (await openQuiz(db, one, new Date(), OWNER_LEARNER_ID))!;
      expect(open.checkId).toBe(checkId);
      const typed = open.questions.filter((q) => parseTemplateInstanceId(q.id));
      if (templates.length) expect(typed.length, checkId).toBeGreaterThan(0);
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
    const c = checkById("cp-sensex-rate");
    expect(c.kind === "conversation" && c.skills).toEqual(["steady-pace", "cagr"]);
    expect(c.kind === "conversation" && c.prompt).toContain("4,285");
  });
});
