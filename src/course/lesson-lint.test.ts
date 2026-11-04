import { describe, expect, it } from "vitest";
import { CONVERTED_TOPIC_DATA, convertedTopic, topicFileOf } from "./lesson-fixture";
import { LESSON_NOT_YET_CONVERTED, NEGATIVE_STEM, lessonLintErrors, type PresetCheck } from "./lesson-lint";
import { isConverted, loadCourseMap, parseCourseMap, testedSkills, type QuizCheck, type Topic } from "./map";
import { presetValueProblems } from "./written-ahead-check";

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

  it("leaves every real Topic not yet converted as it was: rupees, and no new teaching", () => {
    for (const t of loadCourseMap().topics.filter((x) => LESSON_NOT_YET_CONVERTED.includes(x.id))) {
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
          d.checks[2].card!.widget = { widget: "nowhere", values: { old: 3, new: 3.25 } };
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

const lint = (t: Topic, opts?: Parameters<typeof lessonLintErrors>[1]) => lessonLintErrors([t], { notYet: [], ...opts });

/** The converted fixture, changed by `edit` after it has loaded. */
function topicWith(edit: (t: Topic) => void): Topic {
  const t = convertedTopic();
  edit(t);
  return t;
}

const quiz = (t: Topic, i: number) => t.checks[i] as QuizCheck;
const ON_TOPIC = ' (Topic "pct-demo")';

describe("the lesson lint", () => {
  it("passes a full converted Topic built from the gold cards", () => {
    expect(lint(convertedTopic())).toEqual([]);
  });

  it("passes the real Course Map, where every Topic without Skills is on the not-yet-converted list", () => {
    const topics = loadCourseMap().topics;
    expect(lessonLintErrors(topics)).toEqual([]);
    expect(LESSON_NOT_YET_CONVERTED).toHaveLength(topics.filter((t) => !isConverted(t)).length);
  });

  it("only shrinks: a listed Topic with Skills comes off, an unlisted one without Skills fails, a gone Topic comes off", () => {
    expect(lessonLintErrors([convertedTopic()], { notYet: ["pct-demo"] })).toEqual([
      'List: Topic "pct-demo" has Skills, so it is converted: remove it from LESSON_NOT_YET_CONVERTED in src/course/lesson-lint.ts',
    ]);
    expect(lint(topicWith((x) => (x.skills = [])))).toEqual([
      'List: Topic "pct-demo" has no Skills, so it must be on LESSON_NOT_YET_CONVERTED (the list only shrinks: convert the Topic instead)',
    ]);
    expect(lessonLintErrors([], { notYet: ["gone"] })[0]).toContain(`"gone" is on the lesson lint's not-yet-converted list but is not a Topic`);
    expect(new Set(LESSON_NOT_YET_CONVERTED).size).toBe(LESSON_NOT_YET_CONVERTED.length);
    // The ceiling is the list's length when it was made (95 Topics, none converted). Lower it as Topics convert; never raise it.
    expect(LESSON_NOT_YET_CONVERTED.length).toBeLessThanOrEqual(95);
  });

  it("L1: fails a Check that tests a Skill no card at or before it teaches, naming both", () => {
    // Percent change moves to the last card, with its Quick tries, while Check 2 still tests it.
    const t = topicWith((x) => {
      x.checks[1].card!.skills = ["wording"];
      x.checks[1].quickTries = x.checks[1].quickTries.filter((q) => "id" in q);
      x.checks[2].card!.skills.push("pct-change");
      x.checks[2].quickTries.push({ template: "pct-change-move", halfDone: true });
    });
    expect(lint(t)).toEqual([`L1: Check "pct-demo-check-2" tests Skill "pct-change", which no Concept card at or before it teaches${ON_TOPIC}`]);
  });

  it("L1: fails a Check with no card, a question with no Skill, a bank question, a Quick try ahead of its card, and no terms", () => {
    expect(lint(topicWith((x) => delete x.checks[2].card))).toEqual([`L1: Check "pct-demo-check-3" has no Concept card${ON_TOPIC}`]);
    expect(lint(topicWith((x) => delete x.questions[0].skill))).toEqual([`L1: Check "pct-demo-check-2" question "pct-demo-headline" has no Skill${ON_TOPIC}`]);
    expect(lint(topicWith((x) => quiz(x, 1).questions.push("bank:abc")))[0]).toMatch(/^L1: Check "pct-demo-check-2" uses Question Bank question "bank:abc"/);
    const early = topicWith((x) => x.checks[0].quickTries.push({ template: "pct-change-move" }));
    expect(lint(early)).toEqual([
      `L1: Check "pct-demo-check-1" Quick try 8 (template "pct-change-move") practises Skill "pct-change", which no Concept card at or before it teaches${ON_TOPIC}`,
    ]);
    expect(lint(topicWith((x) => (x.terms = [])))).toEqual([`L1: the Topic lists no terms; a converted Topic lists the terms it introduces${ON_TOPIC}`]);
  });

  it("L1: fails a conversation Check with no skills, naming the Check", () => {
    const t = topicWith((x) => {
      (x.checks[2] as { skills: string[] }).skills = [];
    });
    expect(lint(t)).toEqual([`L1: Check "pct-demo-check-3" is a conversation Check with no skills; list the Skills it tests${ON_TOPIC}`]);
  });

  it("L5: reads the Topic's terms", () => {
    const t = topicWith((x) => {
      x.terms[0].means = "Worth $5 in a rupee Topic.";
    });
    expect(lint(t).join("\n")).toMatch(/L5: term .* uses "\$"/);
  });

  it("L2: fails a Skill with too few Quick tries or no half-done one, and a quiz Check too small for three attempts", () => {
    const few = topicWith((x) => (x.checks[0].quickTries = x.checks[0].quickTries.filter((q) => !("id" in q) || q.id !== "pct-demo-try-pts-2")));
    expect(lint(few)).toEqual([`L2: Skill "pts" has 2 Quick tries; it needs at least 3 (a template counts as unlimited)${ON_TOPIC}`]);
    const noHalf = topicWith((x) => (x.checks[1].quickTries = x.checks[1].quickTries.map((q) => ("template" in q ? { template: q.template } : q))));
    expect(lint(noHalf)).toEqual([
      `L2: Skill "pct-change" has no half-done Quick try (a fixed try with halfDone, or a template entry with halfDone: true)${ON_TOPIC}`,
    ]);
    const small = topicWith((x) => (quiz(x, 1).templates = []));
    expect(lint(small)).toEqual([
      `L2: Check "pct-demo-check-2" shows 2 per attempt, so it needs 6 distinct questions or a template for three attempts; it has 1${ON_TOPIC}`,
    ]);
  });

  it("L3: fails a card of six lines, a sentence over 20 words, and a line that holds a line break", () => {
    expect(lint(topicWith((x) => x.checks[0].card!.lines.push("One more line.")))).toEqual([
      `L3: Check "pct-demo-check-1" card has 6 lines with its write-down line; at most 5${ON_TOPIC}`,
    ]);
    const long = "A rate that moves from four percent to five percent has moved by one whole percentage point, which is one hundred basis points.";
    expect(lint(topicWith((x) => (x.checks[2].card!.lines[2] = long)))).toEqual([expect.stringMatching(/^L3: Check "pct-demo-check-3" card has a sentence of 23 words, over 20/)]);
    expect(lint(topicWith((x) => (x.checks[2].card!.lines[2] = "First line.\nSecond line.")))).toEqual([expect.stringMatching(/^L3: .* holds a line break/)]);
  });

  it("L4: fails a written-ahead preset whose value is off the slider, and runs a given preset check on recipes", () => {
    const off = topicWith((x) => (x.checks[2].card!.widget = { widget: "rate-play", values: { old: 3, $new: 12 } }));
    expect(lint(off)).toEqual([`L4: Check "pct-demo-check-3" card's Widget "rate-play" preset: new = 12 is outside 0 to 10${ON_TOPIC}`]);
    const noRecipes: PresetCheck = (p) => ("recipe" in p ? `no recipe "${p.recipe}" here` : null);
    expect(lint(convertedTopic(), { presetOk: noRecipes })).toEqual([
      `L4: Check "pct-demo-check-1" card's recipe "rate_move" preset: no recipe "rate_move" here${ON_TOPIC}`,
      `L4: Check "pct-demo-check-2" card's recipe "rate_move" preset: no recipe "rate_move" here${ON_TOPIC}`,
    ]);
  });

  it("L5: fails a dollar sign in a rupee Topic, and a rupee sign in a dollar Topic", () => {
    expect(lint(topicWith((x) => (x.skills[1].analogy = "100 cents make $1.")))).toEqual([
      `L5: Skill "pts-to-bp" analogy uses "$" in a rupee Topic (exampleCurrency INR): "100 cents make $1."${ON_TOPIC}`,
    ]);
    const dollars = lint(topicWith((x) => (x.exampleCurrency = "USD")));
    expect(dollars.length).toBeGreaterThan(0);
    expect(dollars.every((e) => e.startsWith("L5: ") && e.includes("a dollar Topic"))).toBe(true);
  });

  it("L6: bans a negative stem in a question prompt, bold or not", () => {
    const t = topicWith((x) => (x.questions[0].prompt = "A rate goes from 2% to 3%. Which description is wrong?"));
    expect(lint(t)).toEqual([
      `L6: question "pct-demo-headline" prompt says "wrong"; ask "Which one is true?" instead: "A rate goes from 2% to 3%. Which description is wrong?"${ON_TOPIC}`,
    ]);
    expect(NEGATIVE_STEM.test("Which is **not** true?")).toBe(true);
  });

  it("L6: also runs on a Topic that is not converted, and on a question no Check lists", () => {
    const notConverted = (prompt: string) =>
      topicWith((x) => {
        x.skills = [];
        x.questions[0].prompt = prompt;
        x.questions.push({ ...x.questions[0], id: "pct-demo-unlisted", prompt: "Which one is not a rate?" });
      });
    const bad = lessonLintErrors([notConverted("Which description is not right?")], { notYet: ["pct-demo"] });
    expect(bad).toEqual([
      `L6: question "pct-demo-headline" prompt says "not"; ask "Which one is true?" instead: "Which description is not right?"${ON_TOPIC}`,
      `L6: question "pct-demo-unlisted" prompt says "not"; ask "Which one is true?" instead: "Which one is not a rate?"${ON_TOPIC}`,
    ]);
    const fixed = notConverted("Which one is true?");
    fixed.questions[1].prompt = "Which one is a rate?";
    expect(lessonLintErrors([fixed], { notYet: ["pct-demo"] })).toEqual([]);
  });

  it("L7: fails a Check question that holds the Running example's move, and a template that can draw a card's example", () => {
    const t = topicWith((x) => (x.questions[0].prompt = 'A rate goes from 4% to 5%. A headline says "rates up 25%". Which one is true?'));
    expect(lint(t)).toEqual([
      `L7: Check "pct-demo-check-2" question "pct-demo-headline" uses the numbers of the Running example (4, 5); give it a different move${ON_TOPIC}`,
    ]);
    const draws = topicWith((x) => {
      const template = x.templates.find((y) => y.id === "bp-from-move")!;
      template.params = { a: { min: 3, max: 3, step: 1 }, d: { min: 0.25, max: 0.25, step: 0.25 } };
      template.avoid = [];
    });
    expect(lint(draws)).toEqual([expect.stringMatching(/^L7: Check "pct-demo-check-1" template "bp-from-move" draws .* card's example \(3, 3\.25\)/)]);
  });

  it("Draws: fails a template that cannot draw, and a fixed try whose Known mistake is its answer", () => {
    const stuck = topicWith((x) => (x.templates[1].params = { bp: { min: 100, max: 100, step: 5 } }));
    expect(lint(stuck)).toEqual([expect.stringMatching(/^Draws: template "points-from-bp": draw: Template points-from-bp found no valid draw/)]);
    const clash = topicWith((x) => {
      const q = x.checks[0].quickTries[1];
      if ("id" in q) q.mistakes = [{ answer: 0.25, fix: "Same as the answer." }];
    });
    expect(lint(clash)).toEqual([`Draws: Check "pct-demo-check-1" Quick try "pct-demo-try-pts-2" has a Known mistake 0.25 that equals its answer${ON_TOPIC}`]);
  });

  it("fails a content-only restructure that makes a Check required, which would raise a Due Check", () => {
    const t = topicWith((x) => {
      x.restructure = "content-only";
      x.checks[2].required = true;
    });
    expect(lint(t)).toEqual(['Restructure: Check "pct-demo-check-3" is required, but Topic "pct-demo" is a content-only restructure, so it would raise a Due Check']);
  });
});

describe("presetValueProblems", () => {
  const code = CONVERTED_TOPIC_DATA.widgets[0].code;

  it("accepts slider names with or without $, in range and on step", () => {
    expect(presetValueProblems(code, { old: 3, $new: 3.25 })).toEqual([]);
  });

  it("names an unknown slider, a value out of range and a value off its step", () => {
    expect(presetValueProblems(code, { rate: 3, old: -1, new: 3.255 })).toEqual([
      `"rate" is not one of the Widget's sliders (old, new)`,
      "old = -1 is outside 0 to 10",
      "new = 3.255 is not on a step of 0.01 from 0",
    ]);
  });
});
