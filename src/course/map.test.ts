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
});
