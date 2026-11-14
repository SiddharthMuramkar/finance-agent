import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { AMAZON_2000 } from "../finance/fixtures/amazon-2000.valuation";
import { isComputedQuestion, loadCourseMap, parseCourseMap, writtenQuestions, type CourseMap } from "./map";
import { computedKeyedQuestion } from "./quiz";
import { parseOutline } from "./outline";

/** A minimal valid Topic file; tests override pieces of it. */
function topic(id: string, extra = "", checks = defaultChecks(id)) {
  return {
    name: `${id}.yaml`,
    text: `
id: ${id}
title: ${id}
stage: foundation
path: 1
${extra}
cases:
  - id: ${id}-case
    title: A case
    asOf: 2018-10-24
    story: What people knew then.
    reveal: What happened.
concept: The idea.
principle: The lesson.
${checks}
`,
  };
}

function defaultChecks(id: string) {
  return `checks:
  - id: ${id}-check
    kind: conversation
    prompt: Explain it.
    passCriteria: Explains it.`;
}

describe("Course Map validator", () => {
  it("accepts a valid map and lets Topics and Checks be found by ID", () => {
    const { map, errors } = parseCourseMap([topic("a"), topic("b", "prerequisites: [a]")]);
    expect(errors).toEqual([]);
    expect(map?.topic("b")?.prerequisites).toEqual(["a"]);
    expect(map?.check("a-check")?.topicId).toBe("a");
  });

  it("rejects a missing prerequisite", () => {
    const { errors } = parseCourseMap([topic("a", "prerequisites: [ghost]")]);
    expect(errors).toEqual(['Topic "a" requires "ghost", which is not on the Course Map']);
  });

  it("rejects a prerequisite loop", () => {
    const { errors } = parseCourseMap([
      topic("a", "prerequisites: [c]"),
      topic("b", "prerequisites: [a]"),
      topic("c", "prerequisites: [b]"),
    ]);
    expect(errors).toEqual(["Prerequisite loop: a -> c -> b -> a"]);
  });

  it("rejects duplicate IDs across Topics, Cases and Checks", () => {
    const dupCheck = `checks:
  - id: a-check
    kind: conversation
    prompt: Again.
    passCriteria: Again.`;
    const { errors } = parseCourseMap([topic("a"), topic("a"), topic("b", "", dupCheck)]);
    expect(errors).toEqual(['Duplicate ID "a"', 'Duplicate ID "a-case"', 'Duplicate ID "a-check"', 'Duplicate ID "a-check"']);
  });

  it("rejects a Topic without Checks", () => {
    const { errors } = parseCourseMap([topic("a", "", "checks: []")]);
    expect(errors).toEqual(['Topic "a" has no Checks']);
  });

  it("accepts a Topic that lists registered formulas, and none by default", () => {
    const { map, errors } = parseCourseMap([topic("a", "formulas: [present-value]"), topic("b")]);
    expect(errors).toEqual([]);
    expect(map?.topic("a")?.formulas).toEqual(["present-value"]);
    expect(map?.topic("b")?.formulas).toEqual([]);
  });

  it("exposes a Topic's You'll learn bullets, and none when the file has none", () => {
    const { map, errors } = parseCourseMap([topic("a", "youllLearn:\n  - Tell a point from a percent.\n  - Name the base of a change."), topic("b")]);
    expect(errors).toEqual([]);
    expect(map?.topic("a")?.youllLearn).toEqual(["Tell a point from a percent.", "Name the base of a change."]);
    expect(map?.topic("b")?.youllLearn).toBeUndefined();
  });

  it("rejects one You'll learn bullet or four", () => {
    expect(parseCourseMap([topic("a", "youllLearn: [One.]")]).errors.join()).toMatch(/a\.yaml: youllLearn/);
    expect(parseCourseMap([topic("a", "youllLearn: [One., Two., Three., Four.]")]).errors.join()).toMatch(/a\.yaml: youllLearn/);
  });

  it("rejects a Topic that lists a formula the registry does not have", () => {
    const { errors } = parseCourseMap([topic("a", "formulas: [wacc]")]);
    expect(errors.join()).toMatch(/a\.yaml: formulas\.0: Unknown formula; the formula registry has: present-value/);
  });

  it("rejects a malformed file with its name", () => {
    const { errors } = parseCourseMap([{ name: "bad.yaml", text: "id: bad\nstage: someday\n" }]);
    expect(errors[0]).toMatch(/^bad\.yaml: /);
  });

  it("passes on the real Topic files", () => {
    const map = loadCourseMap();
    const pv = map.topic("present-value");
    expect(pv?.stage).toBe("foundation");
    expect(pv?.checks.length).toBeGreaterThanOrEqual(1);
    expect(pv?.formulas).toEqual(["present-value", "annuity-present-value", "growing-annuity-present-value"]);
    expect(pv?.cases[0].asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  describe("quiz Checks", () => {
    const questions = `questions:
  - id: q1
    prompt: Which is worth more today?
    choices: [{ id: a, text: Now }, { id: b, text: Later }]
    answer: a
    explanation: Money now can be invested.
    source: A textbook
  - id: q2
    prompt: Which falls as the rate rises?
    choices: [{ id: a, text: PV }, { id: b, text: FV }]
    answer: a
    explanation: Higher discounting.
    source: A textbook`;
    const quiz = (lines: string) => `checks:
  - id: quiz
    kind: quiz
${lines}`;

    it("accepts a quiz Check whose questions the Topic holds, and finds a question by ID", () => {
      const { map, errors } = parseCourseMap([topic("a", questions, quiz("    questions: [q1, q2]\n    passRule: { correct: 2 }"))]);
      expect(errors).toEqual([]);
      expect(map?.question("q2")?.answer).toBe("a");
    });

    it("rejects a quiz Check that names a question the Topic does not have", () => {
      const { errors } = parseCourseMap([topic("a", questions, quiz("    questions: [q1, ghost]\n    passRule: { correct: 1 }"))]);
      expect(errors).toEqual(['Check "quiz" uses question "ghost", which Topic "a" does not have']);
    });

    it("accepts Question Bank IDs in a quiz Check beside the Topic's own questions, without needing them in the file", () => {
      const checks = `checks:
  - id: qc
    kind: quiz
    questions: [q1, "bank:eab:MBA-FIN-CF-0002", "bank:unipd:IMP-UNIPD-AFA-0004"]
    passRule: { correct: 2 }`;
      const { map, errors } = parseCourseMap([topic("a", questions, checks)]);
      expect(errors).toEqual([]);
      expect(map?.question("bank:eab:MBA-FIN-CF-0002")).toBeUndefined();
    });

    it("still rejects a bank ID listed twice, and a pass rule the list cannot meet", () => {
      const twice = `checks:
  - id: qc
    kind: quiz
    questions: ["bank:x:1", "bank:x:1"]
    passRule: { correct: 1 }`;
      expect(parseCourseMap([topic("a", "", twice)]).errors.join()).toMatch(/lists a question twice/);
      const short = `checks:
  - id: qc
    kind: quiz
    questions: ["bank:x:1"]
    passRule: { correct: 2 }`;
      expect(parseCourseMap([topic("a", "", short)]).errors.join()).toMatch(/shows 2 questions per attempt but lists only 1/);
    });

    it("rejects an answer that is not one of the choices", () => {
      const { errors } = parseCourseMap([topic("a", questions.replace("answer: a\n    explanation: Money", "answer: z\n    explanation: Money"), quiz("    questions: [q1]\n    passRule: { correct: 1 }"))]);
      expect(errors).toEqual(['Question "q1" has answer "z", which is not one of its choices']);
    });

    it("rejects a question without a source, and a pass rule that cannot be met", () => {
      const noSource = parseCourseMap([topic("a", questions.replace("    source: A textbook\n", ""), quiz("    questions: [q1]\n    passRule: { correct: 1 }"))]);
      expect(noSource.errors[0]).toMatch(/questions\.0\.source/);
      const tooMany = parseCourseMap([topic("a", questions, quiz("    questions: [q1]\n    passRule: { correct: 2 }"))]);
      expect(tooMany.errors).toEqual(['Check "quiz" shows 2 questions per attempt but lists only 1']);
    });

    it("rejects a question ID that another Topic or Check already uses", () => {
      const { errors } = parseCourseMap([topic("a", questions, quiz("    questions: [q1]\n    passRule: { correct: 1 }")), topic("b", questions, quiz("    questions: [q1]\n    passRule: { correct: 1 }"))]);
      expect(errors).toContain('Duplicate ID "q1"');
    });
  });

  describe("Insight and explore", () => {
    const insight = `insight:
  question: What do you notice when the rate is high?
  written: When rates are high, money today beats bigger payments later.
  foundWhen: The Learner says that a higher rate shrinks the value of later payments.
  hints:
    - Look at the bars for the far-off payments.`;
    const explore = (before = "a-check", extra = "") => `explore:
  before: ${before}
${extra}`;

    it("accepts an Insight with explore naming one of the Topic's own Checks", () => {
      const { map, errors } = parseCourseMap([topic("a", `${insight}\n${explore("a-check", "  requiredWhenPassed: true")}`)]);
      expect(errors).toEqual([]);
      expect(map?.topic("a")?.explore).toEqual({ before: "a-check", requiredWhenPassed: true });
      expect(map?.topic("a")?.insight?.hints).toHaveLength(1);
    });

    it("needs both an Insight and explore, or neither", () => {
      expect(parseCourseMap([topic("a", insight)]).errors.join()).toContain("explore");
      expect(parseCourseMap([topic("a", explore())]).errors.join()).toContain("insight");
    });

    it("rejects an explore that names a Check the Topic does not have", () => {
      const { errors } = parseCourseMap([topic("a", `${insight}\n${explore("ghost")}`)]);
      expect(errors).toEqual(['Topic "a" explores before Check "ghost", which it does not have']);
    });

    it("rejects figures in the Insight text", () => {
      const withFigure = insight.replace("money today", "money today (8%)");
      const { errors } = parseCourseMap([topic("a", `${withFigure}\n${explore()}`)]);
      expect(errors.join()).toContain("figure");
    });

    it("allows one or two hints, no more", () => {
      const three = insight + "\n    - Two.\n    - Three.";
      expect(parseCourseMap([topic("a", `${three}\n${explore()}`)]).errors).not.toEqual([]);
    });

    it("loads present value with its Insight and explore anchor", () => {
      const pv = loadCourseMap().topic("present-value")!;
      expect(pv.insight?.written).toBeTruthy();
      expect(pv.explore?.before).toBe("pv-jackpot-choice");
    });
  });

  describe("written-ahead Widgets that say a rate change", () => {
    const widget = (rateChange: string) => `widgets:
  - id: rates
    rateChange: ${rateChange}
    code: |
      root = Widget("Rates", [old, new, steps])
      $old = 5
      $new = 5.2
      old = Slider("old", "Old rate", 0, 10, 0.01, $old, "percent")
      new = Slider("new", "New rate", 0, 10, 0.01, $new, "percent")
      steps = GuidedTasks([up])
      up = GuidedTask("Set 6%", $new == 6)`;

    it("accepts two sliders the Widget declares", () => {
      const { map, errors } = parseCourseMap([topic("a", widget("{ old: $old, new: $new }"))]);
      expect(errors).toEqual([]);
      expect(map?.topic("a")?.widgets[0].rateChange).toEqual({ old: "$old", new: "$new" });
    });

    it("rejects a slider the Widget does not declare", () => {
      const { errors } = parseCourseMap([topic("a", widget("{ old: $old, new: $later }"))]);
      expect(errors).toEqual(['Topic "a" written-ahead Widget "rates" works out a rate change from $later, which its code does not declare']);
    });
  });

  describe("Connections", () => {
    const connection = (text: string, topics = "[b]") => `  - text: ${text}\n    topics: ${topics}`;
    const withConnections = (...items: string[]) => `connections:\n${items.join("\n")}`;
    const good = [connection("Rates and prices move opposite ways"), connection("Risk changes the rate demanded", "[b, c]")];

    it("accepts two or three Connections that name Topics on the map, and fills in their titles", () => {
      const { map, errors } = parseCourseMap([topic("a", withConnections(...good)), topic("b"), topic("c")]);
      expect(errors).toEqual([]);
      expect(map?.topic("a")?.connections).toEqual([
        { text: "Rates and prices move opposite ways", topics: ["b"], titles: ["b"] },
        { text: "Risk changes the rate demanded", topics: ["b", "c"], titles: ["b", "c"] },
      ]);
      expect(map?.topic("b")?.connections).toEqual([]);
    });

    it("fails on a Connection that names a Topic that is not there, or the Topic itself", () => {
      const ghost = parseCourseMap([topic("a", withConnections(good[0], connection("Ghost link", "[ghost]"))), topic("b")]);
      expect(ghost.errors).toEqual(['Topic "a" Connection 2 links to "ghost", which is not in the outline']);
      const self = parseCourseMap([topic("a", withConnections(good[0], connection("Self link", "[a]"))), topic("b")]);
      expect(self.errors).toEqual(['Topic "a" Connection 2 links to the Topic itself']);
    });

    it("fails on Connection text that contains a figure", () => {
      for (const bad of ["Bonds fall 15 percent", "A 5% rise", "Costs $5", "Worth ₹100"]) {
        const { errors } = parseCourseMap([topic("a", withConnections(good[0], connection(`"${bad}"`))), topic("b")]);
        expect(errors).toEqual(['Topic "a" Connection 2 contains a figure; Connections are written in words']);
      }
    });

    it("needs two or three Connections when it has any", () => {
      expect(parseCourseMap([topic("a", withConnections(good[0])), topic("b")]).errors[0]).toMatch(/connections/);
      const four = withConnections(good[0], good[1], good[0], good[1]);
      expect(parseCourseMap([topic("a", four), topic("b")]).errors[0]).toMatch(/connections/);
    });

    it("checks against the outline when there is one, so a Topic still to be written is a valid target", () => {
      const outline = parseOutline(`topics:
  - id: a
    title: Alpha
    stage: foundation
    subject: "Numbers & time value"
    cases:
      - title: A case
        asOf: 2018-10-24
        outcome: What happened.
        sources: [https://example.com/a]
        verified: true
  - id: later
    title: Later Topic
    stage: foundation
    subject: "Numbers & time value"
    cases:
      - title: A case
        asOf: 2018-10-24
        outcome: What happened.
        sources: [https://example.com/a]
        verified: true
`);
      expect(outline.errors).toEqual([]);
      const file = topic("a", withConnections(good[0].replace("[b]", "[later]"), good[1].replace("[b, c]", "[later]")));
      const text = file.text.replace(/^stage: foundation\npath: 1\n/m, "");
      const { map, errors } = parseCourseMap([{ name: file.name, text }], outline.outline);
      expect(errors).toEqual([]);
      expect(map?.topic("a")?.connections[0].titles).toEqual(["Later Topic"]);
    });

    it("gives present value its three Connections, in words", () => {
      const pv = loadCourseMap().topic("present-value")!;
      expect(pv.connections.map((c) => c.topics)).toEqual([["bond-pricing", "bond-yield"], ["eco-gdp-cycles", "eco-central-banks"], ["val-dcf"]]);
    });
  });

  describe("story scenes, terms and the Running example's scene (E3)", () => {
    const scenes = `scenes:
  - id: opening-story
    step: story
    recipe: story_scene
    title: The day the bank surprised everyone
    inputs:
      cast: [{ id: fed, emoji: bank, name: The central bank }]
      beats:
        - { who: narrator, says: It is a calm morning. }
        - { who: fed, says: We are moving the rate today. }
      date: "2018-10-24"`;
    const terms = `terms:
  - term: present value
    means: What a later payment is worth today.
    pro: The present value of the annuity is the cash option.
    example: A promise of rent next year is worth less today.
    emoji: house
    inStory: The cash option was the present value, in the story.`;
    const running = `runningExample:
  text: Asha can take cash today or payments each year.
  numbers: [1]
  scene:
    cast: [{ id: asha, emoji: woman, name: Asha }]
    beats:
      - { who: narrator, says: Asha must choose today. }
      - { who: asha, says: Now beats later for me. }`;

    it("parses terms with pro, example, emoji and inStory, a scenes entry and a Running-example scene", () => {
      const { map, errors } = parseCourseMap([topic("a", `${terms}\n${running}\n${scenes}`)]);
      expect(errors).toEqual([]);
      const t = map?.topic("a");
      expect(t?.terms[0]).toMatchObject({ term: "present value", pro: "The present value of the annuity is the cash option.", emoji: "house", inStory: "The cash option was the present value, in the story." });
      expect(t?.runningExample?.scene?.cast[0]).toMatchObject({ id: "asha", emoji: "woman" });
      expect(t?.scenes).toHaveLength(1);
      expect(t?.scenes[0]).toMatchObject({ id: "opening-story", step: "story", recipe: "story_scene", title: "The day the bank surprised everyone" });
      expect(t?.scenes[0].inputs).toMatchObject({ date: "2018-10-24" });
    });

    it("keeps old terms and Running examples working, with no scenes by default", () => {
      const { map, errors } = parseCourseMap([topic("a", "terms:\n  - { term: yield, means: Income for lending. }")]);
      expect(errors).toEqual([]);
      expect(map?.topic("a")?.terms[0]).toEqual({ term: "yield", means: "Income for lending." });
      expect(map?.topic("a")?.scenes).toEqual([]);
    });

    it("fails two scenes for the same step and Check, and allows the same step for another Check", () => {
      const again = `\n  - id: another-story\n    step: story\n    recipe: story_scene\n    inputs: {}`;
      const dup = parseCourseMap([topic("a", `${scenes}${again}`)]);
      expect(dup.errors.join()).toMatch(/two Scenes for step story/);
      const secondCheck = `${scenes}\n  - id: check-story\n    step: story\n    check: a-check\n    recipe: story_scene\n    inputs: {}`;
      expect(parseCourseMap([topic("a", secondCheck)]).errors).toEqual([]);
    });

    it("fails a repeated scene id and a scene that names a Check the Topic does not have", () => {
      const repeat = `${scenes}\n  - id: opening-story\n    step: reveal\n    recipe: timeline\n    inputs: {}`;
      expect(parseCourseMap([topic("a", repeat)]).errors.join()).toMatch(/Scene "opening-story" repeats its id/);
      const ghost = scenes.replace("step: story", "step: concept\n    check: ghost-check");
      expect(parseCourseMap([topic("a", ghost)]).errors.join()).toMatch(/no Check "ghost-check"/);
    });
  });
});

// The course-file contracts of spec 2026-11-12: a Case's valuation block (B1), the why line and length (A6, C2), Primers
// (C3) and judgement questions (D1, D2, D5). Damodaran's Amazon of February 2000 is the Case throughout.
describe("Spine Topic files", () => {
  const whichLever = {
    id: "s-q-lever",
    kind: "which_lever",
    prompt: "From his story, which change lifts the value most?",
    skill: "levers",
    computed: {
      case: "amazon",
      changes: [
        { id: "margin", label: "Margin from 10% to 12%", levers: { marginTarget: 12 } },
        { id: "revenue", label: "Revenue in year 10 from $39bn to $44bn", levers: { revenueYear10: 44000 } },
        { id: "reinvest", label: "Sales to capital from 3 to 4", levers: { salesToCapital: 4 } },
        { id: "risk", label: "Cost of capital from 12.84% to 11.84%", levers: { costOfCapitalGrowing: 11.84 } },
      ],
    },
  };
  const direction = {
    id: "s-q-direction",
    kind: "direction",
    prompt: "Amazon will sell toys and electronics as well as books. Which lever moves, and which way?",
    skill: "levers",
    choices: [
      { id: "size-up", text: "How big it gets, up" },
      { id: "risk-up", text: "How risky it is, up", mistake: { tag: "lever_mixup", fix: "More things to sell is more sales: that is size, not risk." } },
    ],
    answer: "size-up",
    explanation: "New things to sell make the company bigger.",
    source: "Damodaran, valuation of Amazon, February 2000",
  };
  const primer = {
    id: "s-primer-growth",
    title: "Growth on growth",
    lines: ["Growth adds to what grew last year.", "So steady growth makes a curve, not a line."],
    term: "value",
    quickTry: { id: "s-primer-try", skill: "levers", ask: "Does steady growth make a straight line?", kind: "truth", answer: false, mistakes: [{ answer: true, fix: "Each year grows on a bigger base, so it curves up." }] },
    elective: "pct",
    at: "concept",
  };

  /** A Spine Topic file on the Amazon Case, with `over` laid on top. */
  const spineFile = (over: Record<string, unknown> = {}) => ({
    name: "s.yaml",
    text: stringify({
      id: "s",
      title: "What is a business worth?",
      stage: "spine",
      path: 1,
      cases: [{ id: "amazon", title: "Damodaran values Amazon", asOf: "2000-02-01", story: "Amazon sells books online.", reveal: "The shares fell.", valuation: AMAZON_2000 }],
      concept: "A price is paid. A value is argued.",
      principle: "Ask what a price assumes.",
      terms: [{ term: "value", means: "What the future cash is worth today." }],
      skills: [{ id: "levers", rule: "A value is a story set as four levers." }],
      questions: [whichLever, direction],
      checks: [{ id: "s-check", kind: "quiz", questions: ["s-q-lever", "s-q-direction"], passRule: { correct: 2 } }],
      ...over,
    }),
  });
  const parse = (over: Record<string, unknown> = {}) => parseCourseMap([spineFile(over), topic("pct"), { ...topic("fol"), text: topic("fol").text.replace("stage: foundation", "stage: follow") }]);
  const errorsOf = (over: Record<string, unknown>) => parse(over).errors.join("\n");

  it("reads a Case's valuation block, with its defaults filled in", () => {
    const { map, errors } = parse();
    expect(errors).toEqual([]);
    const valuation = map?.topic("s")?.cases[0].valuation;
    expect(valuation).toMatchObject({ currency: "USD", unit: "millions", baseRevenue: 1117, price: { value: 84 }, reproduces: true });
    expect(map?.topic("pct")?.cases[0].valuation).toBeUndefined();
  });

  it("rejects a valuation block that breaks the block's rules", () => {
    const short = { ...AMAZON_2000, growthPercent: AMAZON_2000.growthPercent.slice(1) };
    const cases = [{ id: "amazon", title: "Amazon", asOf: "2000-02-01", story: "Books.", reveal: "Fell.", valuation: short }];
    expect(errorsOf({ cases })).toMatch(/s\.yaml: cases\.0\.valuation\.growthPercent: growthPercent lists 10 years/);
  });

  it("rejects a valuation block whose reproduces flag the engine does not bear out", () => {
    const cases = [{ id: "amazon", title: "Amazon", asOf: "2000-02-01", story: "Books.", reveal: "Fell.", valuation: { ...AMAZON_2000, reproduces: false } }];
    expect(parse({ cases }).errors).toEqual(['Topic "s" Case "amazon" says reproduces: false, but the engine gives 35.04 a share against the published 35.08']);
  });

  it("accepts a computed question with no answer or choices, and leaves it to code rather than question()", () => {
    const { map } = parse();
    const q = map!.topic("s")!.questions.find((x) => x.id === "s-q-lever")!;
    expect(isComputedQuestion(q)).toBe(true);
    expect(map!.question("s-q-lever")).toBeUndefined();
    expect(map!.question("s-q-direction")?.answer).toBe("size-up");
    expect(writtenQuestions(map!.topic("s")!).map((x) => x.id)).toEqual(["s-q-direction"]);
  });

  describe("a valuation block written once and borrowed with valuationFrom", () => {
    // The Elective holds Amazon's block; the Spine Topic's own Case borrows it, and its computed question values that Case.
    const elective = {
      name: "dcf.yaml",
      text: stringify({
        id: "dcf",
        title: "DCF valuation",
        stage: "foundation",
        path: 2,
        cases: [{ id: "amazon", title: "Damodaran values Amazon", asOf: "2000-02-01", story: "Amazon sells books online.", reveal: "The shares fell.", valuation: AMAZON_2000 }],
        concept: "Discount the cash.",
        principle: "State the assumptions.",
        checks: [{ id: "dcf-check", kind: "conversation", prompt: "Explain it.", passCriteria: "Explains it." }],
      }),
    };
    const borrowing = (valuationFrom: string, extra: Record<string, unknown> = {}) => ({
      cases: [{ id: "amazon-spine", title: "Amazon, February 2000", asOf: "2000-02-01", story: "Amazon sells books online.", reveal: "The shares fell.", valuationFrom, ...extra }],
      questions: [{ ...whichLever, computed: { ...whichLever.computed, case: "amazon-spine" } }, direction],
    });
    const parseWith = (over: Record<string, unknown>) => parseCourseMap([spineFile(over), elective, topic("pct")]);

    it("fills in the borrowed block, so the Spine Topic's Case and its computed question read it as their own", () => {
      const { map, errors } = parseWith(borrowing("amazon"));
      expect(errors).toEqual([]);
      const valuation = map!.topic("s")!.cases[0].valuation;
      expect(valuation).toMatchObject({ baseRevenue: 1117, salesToCapital: 3, price: { value: 84 }, published: { valuePerShare: 35.08 } });
      expect(valuation).toEqual(map!.topic("dcf")!.cases[0].valuation);
    });

    it("changes the Spine question's right answer and figures when the borrowed Case Data changes, with the Spine Topic file untouched (D2)", () => {
      const spine = spineFile(borrowing("amazon"));
      const before = parseCourseMap([spine, elective, topic("pct")]).map!;
      // Only the Elective's file changes: growth twice as costly (sales to capital 1.5), so moving it lifts the value most.
      const costly = { ...elective, text: elective.text.replace("salesToCapital: 3\n", "salesToCapital: 1.5\n").replace("reproduces: true", "reproduces: false") };
      expect(costly.text).not.toBe(elective.text);
      const { map: parsed, errors } = parseCourseMap([spine, costly, topic("pct")]);
      expect(errors).toEqual([]);
      const after = parsed!;
      const lever = (m: CourseMap) => computedKeyedQuestion(m, "s-q-lever")!;
      expect(lever(before).answer).toBe("margin");
      expect(lever(after).answer).toBe("reinvest");
      expect(lever(after).choices.find((c) => c.id === "margin")?.figure).not.toBe(lever(before).choices.find((c) => c.id === "margin")?.figure);
    });

    it("fails the course check on an id that names no Case, or a Case with no block of its own", () => {
      expect(parseWith(borrowing("ghost")).errors).toEqual(['Topic "s" Case "amazon-spine" takes its valuation from "ghost", which is not a Case on the Course Map']);
      expect(parseWith(borrowing("pct-case")).errors).toEqual(['Topic "s" Case "amazon-spine" takes its valuation from "pct-case", which has no valuation block of its own']);
    });

    it("rejects a Case that both writes a block and borrows one", () => {
      expect(parseWith(borrowing("amazon", { valuation: AMAZON_2000 })).errors).toEqual(['s.yaml: Case "amazon-spine" has a valuation block and takes one from "amazon"; give one']);
    });

    it("checks a borrowed block's reproduces flag once, on the Case that writes it", () => {
      const wrong = { ...elective, text: elective.text.replace("reproduces: true", "reproduces: false") };
      expect(parseCourseMap([spineFile(borrowing("amazon")), wrong, topic("pct")]).errors).toEqual([
        'Topic "dcf" Case "amazon" says reproduces: false, but the engine gives 35.04 a share against the published 35.08',
      ]);
    });
  });

  it("rejects a computed question that writes its own answer or choices (D2)", () => {
    expect(errorsOf({ questions: [{ ...whichLever, answer: "margin" }] })).toContain("questions.0.answer: a computed question's right choice is worked out by code from the Case (spec D2): remove answer");
    expect(errorsOf({ questions: [{ ...whichLever, choices: [{ id: "a", text: "A" }] }] })).toContain("remove choices");
  });

  it("rejects a computed question on a Case it cannot value", () => {
    const on = (c: string) => ({ questions: [{ ...whichLever, computed: { ...whichLever.computed, case: c } }], checks: [{ id: "s-check", kind: "conversation", prompt: "Tell it.", passCriteria: "Tells it." }] });
    expect(errorsOf(on("ghost"))).toContain('Question "s-q-lever" values Case "ghost", which is not one of the Topic\'s Cases');
    const bare = { cases: [{ id: "amazon", title: "Amazon", asOf: "2000-02-01", story: "Books.", reveal: "Fell." }] };
    expect(errorsOf(bare)).toContain('Question "s-q-lever" values Case "amazon", which has no valuation block');
  });

  it("asks which lever among two to four changes shown from a pool of at most eight (D5)", () => {
    const changes = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, label: `Margin to ${i}%`, levers: { marginTarget: i } }));
    const withChanges = (n: number, extra: Record<string, unknown> = {}) => ({ questions: [{ ...whichLever, computed: { case: "amazon", changes: changes(n), ...extra } }], checks: [{ id: "s-check", kind: "conversation", prompt: "Tell it.", passCriteria: "Tells it." }] });
    expect(parse(withChanges(8, { shown: 4 })).errors).toEqual([]);
    expect(errorsOf(withChanges(9))).toMatch(/questions\.0\.computed\.changes/);
    expect(errorsOf(withChanges(1))).toContain('Question "s-q-lever" is a which_lever question, so it needs at least two changes to choose between');
    expect(errorsOf(withChanges(3, { shown: 4 }))).toContain('Question "s-q-lever" shows 4 changes but lists only 3');
    expect(errorsOf(withChanges(3, { shown: 5 }))).toMatch(/questions\.0\.computed\.shown/);
    expect(errorsOf(withChanges(2, { bands: [{ id: "a", label: "Up", min: 1 }, { id: "b", label: "Down", max: 1 }] }))).toContain("so it takes no bands (only predict does)");
  });

  it("rejects a change that sets no lever, a repeated change id, and a lever the Workbench does not have", () => {
    const one = (changes: unknown[]) => ({ questions: [{ ...whichLever, computed: { case: "amazon", changes } }], checks: [{ id: "s-check", kind: "conversation", prompt: "Tell it.", passCriteria: "Tells it." }] });
    expect(errorsOf(one([{ id: "a", label: "Nothing", levers: {} }, { id: "b", label: "Margin", levers: { marginTarget: 12 } }]))).toContain("a change sets at least one lever");
    expect(errorsOf(one([{ id: "a", label: "Margin", levers: { marginTarget: 12 } }, { id: "a", label: "Margin", levers: { marginTarget: 14 } }]))).toContain("repeats a change id");
    expect(errorsOf(one([{ id: "a", label: "Tax", levers: { taxPercent: 20 } }, { id: "b", label: "Margin", levers: { marginTarget: 12 } }]))).toMatch(/Unrecognized key/);
  });

  it("predicts a band from one change at a time, which needs bands and takes no shown", () => {
    const predict = {
      id: "s-q-predict",
      kind: "predict",
      prompt: "If margins end at 4%, not 10%, the value will be:",
      computed: {
        case: "amazon",
        preset: { marginTarget: 10 },
        changes: [{ id: "thin", label: "Margins end at 4%", levers: { marginTarget: 4 } }],
        bands: [
          { id: "half", label: "About half", min: 0.3, max: 0.75 },
          { id: "tenth", label: "About a tenth", min: 0.02, max: 0.3 },
          { id: "none", label: "Nothing left", max: 0.02 },
        ],
      },
    };
    const only = (q: unknown) => ({ questions: [q], checks: [{ id: "s-check", kind: "conversation", prompt: "Tell it.", passCriteria: "Tells it." }] });
    expect(parse(only(predict)).errors).toEqual([]);
    expect(errorsOf(only({ ...predict, computed: { ...predict.computed, bands: undefined } }))).toContain("is a predict question, so it needs bands");
    expect(errorsOf(only({ ...predict, computed: { ...predict.computed, shown: 2 } }))).toContain("takes no shown");
    expect(errorsOf(only({ ...predict, computed: { ...predict.computed, bands: [{ id: "x", label: "X" }, { id: "y", label: "Y", min: 1, max: 0.5 }] } }))).toMatch(/a band needs min, max or both[\s\S]*a band's min must be below its max/);
  });

  it("keeps figures out of a computed question's explanation, since code adds them", () => {
    expect(errorsOf({ questions: [{ ...whichLever, explanation: "Margin adds $13 a share." }, direction] })).toContain("types a figure in its explanation");
    expect(parse({ questions: [{ ...whichLever, explanation: "Margin moves the cash of every year." }, direction] }).errors).toEqual([]);
  });

  it("needs choices and an answer on a written judgement question, two to four of them", () => {
    const { choices: _choices, ...noChoices } = direction;
    void _choices;
    expect(errorsOf({ questions: [whichLever, noChoices] })).toMatch(/questions\.1\.choices/);
    const five = Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, text: `Choice ${i}`, ...(i ? { mistake: { fix: "Not this one." } } : {}) }));
    expect(errorsOf({ questions: [whichLever, { ...direction, choices: five, answer: "c0" }] })).toContain('Question "s-q-direction" is a judgement question, so it shows 4 choices at most; it has 5');
  });

  it("rejects a kind that is not one of the six", () => {
    expect(errorsOf({ questions: [{ ...direction, kind: "guess" }] })).toMatch(/questions\.0\.kind: Invalid discriminator value/);
  });

  it("keeps the written questions of today's Topics as they are, with no kind; only Spine Topics ask judgement kinds", () => {
    const real = loadCourseMap();
    const offSpine = real.topics.filter((t) => t.stage !== "spine");
    expect(offSpine.flatMap((t) => t.questions).every((q) => !isComputedQuestion(q) && q.kind === undefined)).toBe(true);
    expect(real.topic("spine-01-worth")!.questions.every((q) => q.kind !== undefined)).toBe(true);
  });

  it("reads the why line, the length and up to two Primers", () => {
    const { map, errors } = parse({ why: "Every value is a story set as four levers; this Topic sets the first one.", minutes: 12, primers: [primer] });
    expect(errors).toEqual([]);
    const s = map!.topic("s")!;
    expect(s).toMatchObject({ why: "Every value is a story set as four levers; this Topic sets the first one.", minutes: 12 });
    expect(s.primers?.[0]).toMatchObject({ id: "s-primer-growth", term: "value", elective: "pct", at: "concept", quickTry: { id: "s-primer-try", answer: false } });
    expect(map!.topic("pct")?.primers).toBeUndefined();
  });

  it("rejects a length that is not a whole number of minutes", () => {
    expect(errorsOf({ minutes: 0 })).toMatch(/minutes/);
    expect(errorsOf({ minutes: 7.5 })).toMatch(/minutes/);
  });

  it("rejects a third Primer, a fourth line and a Primer inside a Check", () => {
    expect(errorsOf({ primers: [primer, { ...primer, id: "p2", quickTry: { ...primer.quickTry, id: "t2" } }, { ...primer, id: "p3", quickTry: { ...primer.quickTry, id: "t3" } }] })).toMatch(/primers/);
    expect(errorsOf({ primers: [{ ...primer, lines: ["One.", "Two.", "Three.", "Four."] }] })).toMatch(/primers\.0\.lines/);
    expect(errorsOf({ primers: [{ ...primer, at: "check" }] })).toContain("a Primer comes before or after a Check, never inside one");
  });

  it("rejects a Primer whose term, Skill, Quick try or Elective does not hold", () => {
    expect(errorsOf({ primers: [{ ...primer, term: "beta" }] })).toContain('Primer "s-primer-growth" teaches the term "beta", which is not one of the Topic\'s terms');
    expect(errorsOf({ primers: [{ ...primer, quickTry: { ...primer.quickTry, skill: "ghost" } }] })).toContain('names Skill "ghost"');
    expect(errorsOf({ primers: [{ ...primer, quickTry: { ...primer.quickTry, answer: "yes" } }] })).toContain("is a truth item, so its answer must be true or false");
    expect(errorsOf({ primers: [{ ...primer, elective: "ghost" }] })).toContain('Primer "s-primer-growth" links to "ghost", which is not in the outline');
    expect(errorsOf({ primers: [{ ...primer, elective: "fol" }] })).toContain('links to "fol", which is not an Elective (a Foundation Topic)');
    expect(errorsOf({ primers: [{ ...primer, widget: { widget: "ghost", values: {} } }] })).toContain('opens Widget "ghost", which is not one of the Topic\'s written-ahead Widgets');
  });

  it("counts a Primer's Quick try among the ids that must not repeat", () => {
    expect(errorsOf({ primers: [{ ...primer, quickTry: { ...primer.quickTry, id: "s-q-lever" } }] })).toContain('Duplicate ID "s-q-lever"');
  });
});
