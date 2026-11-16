import { stringify } from "yaml";
import { describe, expect, it } from "vitest";
import { goalCheckErrors } from "./goal-check";
import { lessonLintErrors } from "./lesson-lint";
import { parseCourseMap, type Topic } from "./map";
import { spineCheckErrors, spineShapeProblems } from "./spine-check";
import { parseSpine, spineData, spineTopic, SPINE_TOPIC_DATA } from "./spine-fixture";

// The course check for a Spine Topic's shape (spec 2026-11-12, C2, and its "Done when": the check fails when a Spine
// Topic is missing its Workbench Widget, Insight, judgement questions, why line or length).

/** What scripts/check-course.mjs reports for a Topic file read with the fixture's outline: map, lesson lint, Spine check, goals. */
function courseCheck(data: object): string[] {
  const { map, errors } = parseSpine(data);
  if (!map) return errors;
  return [...lessonLintErrors(map.topics, { notYet: [], l10NotYet: [] }), ...spineCheckErrors(map.topics), ...goalCheckErrors(map.topics)];
}

const shape = (edit: (d: typeof SPINE_TOPIC_DATA) => void) => courseCheck(spineData(edit));

describe("a Spine Topic missing a part fails the course check (C2)", () => {
  it("passes whole", () => {
    expect(courseCheck(SPINE_TOPIC_DATA)).toEqual([]);
  });

  it("fails with no Workbench Widget at explore", () => {
    const errors = shape((d) => void delete (d.explore as { workbench?: unknown }).workbench);
    expect(errors).toEqual([
      'Spine Topic "spine-01-worth" has no Workbench Widget at explore; give explore a workbench naming one of value_levers, cash_waterfall, wacc_stack, terminal_seesaw, value_bridge, multiple_decoder (spec C2)',
    ]);
  });

  it("fails with a Workbench recipe that is not one of the shared ids", () => {
    const { errors } = parseSpine(spineData((d) => void (d.explore.workbench.recipe = "rate_move")));
    expect(errors.join("\n")).toMatch(/explore\.workbench\.recipe: Workbench recipe "rate_move" is not one of value_levers, cash_waterfall/);
  });

  it("fails with no Insight (and so no explore step)", () => {
    const errors = shape((d) => {
      delete (d as { insight?: unknown }).insight;
      delete (d as { explore?: unknown }).explore;
    });
    expect(errors).toContain('Spine Topic "spine-01-worth" has no Insight for the Learner to find by play at explore (spec C2)');
    expect(errors).toContain('Spine Topic "spine-01-worth" has no Workbench Widget at explore; give explore a workbench naming one of value_levers, cash_waterfall, wacc_stack, terminal_seesaw, value_bridge, multiple_decoder (spec C2)');
  });

  it("fails with no judgement questions in its Check", () => {
    // Every question loses its judgement kind or is dropped: the Check asks only what things are.
    const errors = shape((d) => {
      const written = d.questions.filter((q) => !("computed" in q));
      d.questions = [...written, ...written.map((q) => ({ ...q, id: `${q.id}-2` }))];
      for (const q of d.questions) delete (q as { kind?: string }).kind;
      d.checks[0].questions = d.questions.map((q) => q.id);
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^L13: Spine Check "worth-check" has 0 judgement questions/),
        expect.stringMatching(/^L13: Spine Check "worth-check" has no computed question/),
      ]),
    );
  });

  it("fails with no why line", () => {
    const errors = shape((d) => void delete (d as { why?: string }).why);
    expect(errors).toContain('Spine Topic "spine-01-worth" has no why line; give it one line, at most 30 words, linking it to valuing a company (A6) (spec C2)');
  });

  it("fails with no length, or one over fifteen minutes", () => {
    // Read without an outline, a Spine Topic file states its own Stage, place and length.
    const file = (minutes?: number) => {
      // With no outline, there is no Elective for the Primer or the Connections to name.
      const d: Record<string, unknown> = { ...spineData(), stage: "spine", path: 1, connections: undefined, primers: undefined };
      if (minutes !== undefined) d.minutes = minutes;
      const { map, errors } = parseCourseMap([{ name: "s.yaml", text: stringify(d) }]);
      if (!map) throw new Error(errors.join("\n"));
      return spineCheckErrors(map.topics);
    };
    expect(file()).toEqual(['Spine Topic "spine-01-worth" states no length; give it minutes, 15 or fewer (spec C2)']);
    expect(file(20)).toEqual(['Spine Topic "spine-01-worth" takes 20 minutes; a Spine Topic takes 15 or fewer (spec C2)']);
    expect(file(15)).toEqual([]);
  });
});

describe("the rest of a Spine Topic's shape (C2)", () => {
  const topic = spineTopic();
  const problems = (over: Partial<Topic>) => spineShapeProblems({ ...topic, ...over });

  it("needs a Case with a valuation block", () => {
    expect(problems({ cases: topic.cases.map((c) => ({ ...c, valuation: undefined })) })).toEqual([
      "has no Case with a valuation block; give its Case one, or take Amazon's with valuationFrom",
      'binds its Workbench to Case "amazon-worth", which has no valuation block',
    ]);
  });

  it("needs exactly one Concept card, three to five terms and six to eight Quick tries", () => {
    const [quiz, talk] = topic.checks;
    expect(problems({ checks: [{ ...quiz, card: undefined }, talk] })).toEqual(["has 0 Concept cards; a Spine Topic has exactly one"]);
    expect(problems({ checks: [quiz, { ...talk, card: quiz.card }] })).toEqual(["has 2 Concept cards; a Spine Topic has exactly one"]);
    expect(problems({ terms: topic.terms.slice(0, 2) })).toEqual(["lists 2 Lingo terms; give it 3 to 5"]);
    expect(problems({ terms: [...topic.terms, { term: "share", means: "One slice." }] })).toEqual(["lists 6 Lingo terms; give it 3 to 5"]);
    expect(problems({ checks: [{ ...quiz, quickTries: quiz.quickTries.slice(0, 5) }, talk] })).toEqual(["has 5 Quick tries; give it 6 to 8"]);
    expect(problems({ checks: [{ ...quiz, quickTries: [...quiz.quickTries, ...quiz.quickTries.slice(0, 3)] }, talk] })).toEqual(["has 9 Quick tries; give it 6 to 8"]);
  });

  it("needs one quiz Check that draws four and passes at three, and at most one conversation Check", () => {
    const [quiz, talk] = topic.checks;
    if (quiz.kind !== "quiz") throw new Error("the fixture's first Check is its quiz");
    expect(problems({ checks: [{ ...quiz, perAttempt: 5 }, talk] })).toEqual([
      'quiz Check "worth-check" shows 5 and passes at 3; a Spine Check draws 4 per attempt and passes at 3 (perAttempt: 4, passRule: { correct: 3 })',
    ]);
    expect(problems({ checks: [talk] })).toEqual([
      "has 0 Concept cards; a Spine Topic has exactly one",
      "has 0 Quick tries; give it 6 to 8",
      "has 0 quiz Checks; a Spine Topic has one quiz Check of judgement questions",
    ]);
    expect(problems({ checks: [quiz, talk, { ...talk, id: "again" }] })).toEqual(["has 2 conversation Checks; at most one, in which the Learner tells the Valuation story"]);
  });

  it("lets a judging quiz Check by tap close the Topic in place of the conversation Check (ADR 0020), but not both", () => {
    const [quiz, talk] = topic.checks;
    if (quiz.kind !== "quiz") throw new Error("the fixture's first Check is its quiz");
    const judging = { ...quiz, id: talk.id, card: undefined, quickTries: [] };
    expect(problems({ checks: [quiz, judging] })).toEqual([]);
    expect(problems({ checks: [quiz, judging, talk] })).toEqual([
      "has 2 quiz Checks and 1 conversation Checks; a Spine Topic has one quiz Check and at most one closing Check, a judging quiz Check or a conversation Check",
    ]);
    expect(problems({ checks: [quiz, judging, { ...judging, id: "again" }] })).toEqual([
      "has 3 quiz Checks and 0 conversation Checks; a Spine Topic has one quiz Check and at most one closing Check, a judging quiz Check or a conversation Check",
    ]);
  });

  it("lets Spine Topic 2 explore the annuity Widget on a Case with no valuation block", () => {
    const annuity = { id: "annuity-worth-today", code: 'root = Widget("What the annuity is worth today", [chart])\nchart = AnnuityChart(1537, 30, 5, $rate, "jackpot/cash-option", 2018)', parts: [] };
    const two = { ...topic, spine: 2, cases: topic.cases.map((c) => ({ ...c, valuation: undefined })), widgets: [annuity], explore: { before: "worth-check", requiredWhenPassed: false, widget: annuity.id } };
    expect(spineShapeProblems(two)).toEqual([]);
    expect(spineShapeProblems({ ...two, widgets: [{ ...annuity, code: 'root = Widget("Rates", [])' }] })).toEqual([
      "explores no annuity Widget; Spine Topic 2 explores the written-ahead annuity Widget (an AnnuityChart) on its Mega Millions Case",
    ]);
  });

  it("lets Spine Topic 3 explore a cash waterfall from one year's inputs", () => {
    const waterfall = { recipe: "cash_waterfall" as const, inputs: { growthPercent: 100, marginPercent: -20, salesToCapital: 2 } };
    const three = { ...topic, spine: 3, cases: topic.cases.map((c) => ({ ...c, valuation: undefined })), explore: { ...topic.explore!, workbench: waterfall } };
    expect(spineShapeProblems(three)).toEqual([]);
    expect(spineShapeProblems({ ...three, explore: { ...topic.explore!, workbench: { ...waterfall, inputs: {} } } })).toEqual([
      "gives its cash waterfall no inputs; give it one year's revenue growth, margin and sales to capital",
    ]);
    expect(spineShapeProblems({ ...three, explore: { ...topic.explore!, workbench: { ...topic.explore!.workbench!, inputs: waterfall.inputs } } })).toEqual([
      'explores the Workbench "value_levers"; Spine Topic 3 explores cash_waterfall',
    ]);
  });

  it("reads Spine Topics only", () => {
    expect(spineCheckErrors([{ ...topic, stage: "foundation", terms: [] }])).toEqual([]);
  });
});
