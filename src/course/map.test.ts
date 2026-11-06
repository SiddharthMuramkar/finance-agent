import { describe, expect, it } from "vitest";
import { loadCourseMap, parseCourseMap } from "./map";
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
