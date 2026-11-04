import { describe, expect, it } from "vitest";
import { CONVERTED_TOPIC_DATA, convertedTopic, topicFileOf } from "./lesson-fixture";
import { loadCourseMap, parseCourseMap, testedSkills, isConverted } from "./map";

/** A deep copy of the converted fixture's data, changed by `edit`. */
function dataWith(edit: (d: typeof CONVERTED_TOPIC_DATA) => void) {
  const d = structuredClone(CONVERTED_TOPIC_DATA);
  edit(d);
  return d;
}

describe("the Topic file's teaching fields", () => {
  it("loads a converted Topic with its Skills, cards, Quick tries and templates", () => {
    const { map, errors } = parseCourseMap([topicFileOf(CONVERTED_TOPIC_DATA)]);
    expect(errors).toEqual([]);
    const t = map!.topic("pct-demo")!;
    expect(isConverted(t)).toBe(true);
    expect(t.exampleCurrency).toBe("INR");
    expect(t.checks[0].card?.title).toBe("One move, two ways");
    expect(t.checks[0].quickTries).toHaveLength(7);
    expect(map!.template("points-from-bp")?.topicId).toBe("pct-demo");
    expect(testedSkills(t, t.checks[0])).toEqual(["pts-to-bp", "bp-to-pts"]);
    expect(testedSkills(t, t.checks[1])).toEqual(["wording", "pct-change"]);
    expect(testedSkills(t, t.checks[2])).toEqual(["wording"]);
  });

  it("leaves every real Topic as it was: not converted, rupees, and no new teaching", () => {
    for (const t of loadCourseMap().topics) {
      expect(isConverted(t)).toBe(false);
      expect(t.exampleCurrency).toBe("INR");
      expect([t.terms, t.templates, ...t.checks.map((c) => c.quickTries)].every((list) => list.length === 0)).toBe(true);
    }
  });

  it("rejects a template whose answer function is not in the engine's list, naming it and the list", () => {
    const { errors } = parseCourseMap([topicFileOf(dataWith((d) => (d.templates[0].answer = "bp_from_moves")))]);
    expect(errors.join("\n")).toContain(
      'templates.0.answer: answer function "bp_from_moves" is not one of points_between, bp_from_move, points_from_bp, bp_from_points, pct_change',
    );
  });

  it("rejects a template whose mistake function is not in the engine's list", () => {
    const { errors } = parseCourseMap([topicFileOf(dataWith((d) => (d.templates[1].mistakes[0].tag = "divided_by_two")))]);
    expect(errors.join("\n")).toContain('templates.1.mistakes.0.tag: mistake function "divided_by_two" is not one of stopped_at_points, used_x10');
  });

  it("rejects references that do not resolve: a Skill, a template, a written-ahead Widget", () => {
    const { errors } = parseCourseMap([
      topicFileOf(
        dataWith((d) => {
          d.checks[0].card!.skills.push("ghost");
          d.checks[1].templates!.push("no-such-template");
          d.checks[2].card!.widget = { widget: "nowhere", values: { old: 3 } };
        }),
      ),
    ]);
    expect(errors).toEqual([
      'pct-demo.yaml: (file): Check "pct-demo-check-1" card names Skill "ghost", which the Topic does not list under skills',
      'pct-demo.yaml: (file): Check "pct-demo-check-2" draws from template "no-such-template", which the Topic does not have',
      `pct-demo.yaml: (file): Check "pct-demo-check-3" card opens Widget "nowhere", which is not one of the Topic's written-ahead Widgets`,
    ]);
  });

  it("puts template and fixed Quick-try ids in the duplicate-ID check", () => {
    const other = dataWith((d) => {
      d.id = "pct-other";
      d.cases[0].id = "pct-other-case";
      d.questions[0].id = "pct-other-headline";
      d.checks.forEach((c, i) => (c.id = `pct-other-check-${i + 1}`));
      d.checks[1].questions = ["pct-other-headline"];
    });
    const { errors } = parseCourseMap([topicFileOf(CONVERTED_TOPIC_DATA), topicFileOf(other, "pct-other.yaml")]);
    expect(errors).toContain('Duplicate ID "bp-from-move"');
    expect(errors).toContain('Duplicate ID "pct-demo-try-pts-1"');
  });

  it("lets a quiz Check with templates show more per attempt than it lists questions", () => {
    expect(convertedTopic().checks[1]).toMatchObject({ questions: ["pct-demo-headline"], perAttempt: 2 });
  });
});
