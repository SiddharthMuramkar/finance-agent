import { describe, expect, it } from "vitest";
import { CONVERTED_TOPIC_DATA, convertedTopic, topicFileOf } from "./lesson-fixture";
import { lintReadyTopic } from "./lesson-lint-fixture";
import { LESSON_NOT_YET_CONVERTED, NEGATIVE_STEM, lessonLintErrors, type PresetCheck } from "./lesson-lint";
import { L10_NOT_YET_STORY } from "./l10-allowlist";
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

  it("leaves every real Topic not yet converted as it was: rupees, and no new Skills, templates or Quick tries", () => {
    for (const t of loadCourseMap().topics.filter((x) => LESSON_NOT_YET_CONVERTED.includes(x.id))) {
      expect(isConverted(t)).toBe(false);
      expect(t.exampleCurrency).toBe("INR");
      // A story-first batch (E6) gives a Topic terms and scenes before its Skills, so terms only count for a Topic with no scenes.
      expect([t.scenes.length ? [] : t.terms, t.templates, ...t.checks.map((c) => c.quickTries)].every((list) => list.length === 0)).toBe(true);
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

// The fixture's tries are typed on purpose (they pin the rate-move engine), so it sits on the L10 allowlist unless a test says otherwise.
const lint = (t: Topic, opts?: Parameters<typeof lessonLintErrors>[1]) => lessonLintErrors([t], { notYet: [], l10NotYet: ["pct-demo"], ...opts });
const l10 = (t: Topic, l10NotYet: readonly string[] = []) => lessonLintErrors([t], { notYet: [], l10NotYet }).filter((e) => e.startsWith("L10") || (e.startsWith("List") && e.includes("L10")));

/** The converted fixture, changed by `edit` after it has loaded. */
function topicWith(edit: (t: Topic) => void): Topic {
  const t = lintReadyTopic();
  edit(t);
  return t;
}

const quiz = (t: Topic, i: number) => t.checks[i] as QuizCheck;
const ON_TOPIC = ' (Topic "pct-demo")';

describe("the lesson lint", () => {
  it("passes a full converted Topic built from the gold cards, once its Check 1 tests every Skill it has Quick tries for", () => {
    expect(lint(lintReadyTopic())).toEqual([]);
  });

  it("passes the real Course Map, where every Topic without Skills is on the not-yet-converted list", () => {
    const topics = loadCourseMap().topics;
    expect(lessonLintErrors(topics)).toEqual([]);
    expect(LESSON_NOT_YET_CONVERTED).toHaveLength(topics.filter((t) => !isConverted(t)).length);
  });

  it("only shrinks: a listed Topic with Skills comes off, an unlisted one without Skills fails, a gone Topic comes off", () => {
    expect(lessonLintErrors([convertedTopic()], { notYet: ["pct-demo"], l10NotYet: ["pct-demo"] })).toEqual([
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
      (x.checks[2] as { skills: string[] }).skills.push("pct-change");
    });
    expect(lint(t)).toEqual([`L1: Check "pct-demo-check-2" tests Skill "pct-change", which no Concept card at or before it teaches${ON_TOPIC}`]);
  });

  it("L1: fails a Check with no card, a question with no Skill, a bank question, a Quick try ahead of its card, and no terms", () => {
    expect(lint(topicWith((x) => delete x.checks[2].card))).toEqual([`L1: Check "pct-demo-check-3" has no Concept card${ON_TOPIC}`]);
    expect(lint(topicWith((x) => delete x.questions[0].skill)).filter((e) => e.startsWith("L1"))).toEqual([`L1: Check "pct-demo-check-2" question "pct-demo-headline" has no Skill${ON_TOPIC}`]);
    expect(lint(topicWith((x) => quiz(x, 1).questions.push("bank:abc")))[0]).toMatch(/^L1: Check "pct-demo-check-2" uses Question Bank question "bank:abc"/);
    const early = topicWith((x) => x.checks[0].quickTries.push({ template: "pct-change-move" }));
    expect(lint(early).filter((e) => e.startsWith("L1"))).toEqual([
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
    expect(lint(small).filter((e) => e.startsWith("L2"))).toEqual([
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
    expect(lint(lintReadyTopic(), { presetOk: noRecipes })).toEqual([
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
    const bad = lessonLintErrors([notConverted("Which description is not right?")], { notYet: ["pct-demo"], l10NotYet: ["pct-demo"] });
    expect(bad).toEqual([
      `L6: question "pct-demo-headline" prompt says "not"; ask "Which one is true?" instead: "Which description is not right?"${ON_TOPIC}`,
      `L6: question "pct-demo-unlisted" prompt says "not"; ask "Which one is true?" instead: "Which one is not a rate?"${ON_TOPIC}`,
    ]);
    const fixed = notConverted("Which one is true?");
    fixed.questions[1].prompt = "Which one is a rate?";
    expect(lessonLintErrors([fixed], { notYet: ["pct-demo"], l10NotYet: ["pct-demo"] })).toEqual([]);
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

  it("L8: fails a Quick try whose Skill its own Check does not test, because it can never be shown", () => {
    // The shared fixture's Check 1 has three Quick tries on "pts" but draws no "pts" question: the Percent bug of review item 0.
    expect(lint(convertedTopic()).filter((e) => e.startsWith("L8"))).toEqual(
      ["pct-demo-try-pts-1", "pct-demo-try-pts-2", "pct-demo-try-pts-3"].map(
        (id) =>
          `L8: Check "pct-demo-check-1" Quick try "${id}" practises Skill "pts", which the Check does not test (it tests pts-to-bp, bp-to-pts), so the try is never shown; add a question or template on "pts" to the Check${ON_TOPIC}`,
      ),
    );
    const late = topicWith((x) => x.checks[2].quickTries.push({ template: "points-between" }));
    expect(lint(late)).toEqual([
      `L8: Check "pct-demo-check-3" Quick try 1 (template "points-between") practises Skill "pts", which the Check does not test (it tests wording), so the try is never shown; add a question or template on "pts" to the Check${ON_TOPIC}`,
    ]);
  });

  it("L9: fails a template whose draw can repeat the numbers of a fixed question or Quick try in the same Check", () => {
    // Only 3% to 3.5% can be drawn, which is Quick try pct-demo-try-pts-1's move.
    const t = topicWith((x) => {
      const template = x.templates.find((y) => y.id === "points-between")!;
      template.params = { a: { min: 3, max: 3, step: 1 }, d: { min: 0.5, max: 0.5, step: 0.5 } };
      template.avoid = [];
    });
    expect(lint(t)).toEqual([
      `L9: Check "pct-demo-check-1" template "points-between" draws "A rate moves from 3% to 3.5%. How many percentage points ...", which repeats the numbers of Quick try "pct-demo-try-pts-1" (3, 3.5); add one of them to the template's avoid list${ON_TOPIC}`,
    ]);
    // A question in the same Check counts too.
    const q = topicWith((x) => {
      const template = x.templates.find((y) => y.id === "pct-change-move")!;
      template.params = { a: { min: 2, max: 2, step: 1 }, d: { min: 1, max: 1, step: 1 } };
      template.avoid = [];
    });
    expect(lint(q).filter((e) => e.startsWith("L9"))).toEqual([
      expect.stringMatching(/^L9: Check "pct-demo-check-2" template "pct-change-move" draws .* question "pct-demo-headline" \(2, 3\)/),
    ]);
  });

  it("L11: fails an emoji name that is not in the registry, in terms, scenes and the Running example; passes money-bag", () => {
    type Loose = Record<string, unknown>;
    const withEmoji = (name: string, where: "terms" | "scenes" | "runningExample") =>
      topicWith((x) => {
        const loose = x as unknown as Loose;
        if (where === "terms") loose.terms = [{ term: "Basis point", means: "One hundredth of a point", emoji: name }];
        if (where === "scenes") loose.scenes = [{ recipe: "story_scene", params: { cast: [{ id: "a", emoji: name, name: "Ana" }], beats: [{ who: "a", says: "Hi", emoji: "speech-balloon" }] } }];
        if (where === "runningExample") loose.runningExample = { ...(x.runningExample as object), scene: { cast: [{ id: "a", emoji: name, name: "Ana" }] } };
      });
    expect(lint(withEmoji("money-bag", "terms"))).toEqual([]);
    expect(lint(withEmoji("money-bag", "scenes"))).toEqual([]);
    for (const where of ["terms", "scenes", "runningExample"] as const) {
      expect(lint(withEmoji("pizza-slice", where))).toEqual([`L11: emoji "pizza-slice" is not in src/emoji/registry.ts${ON_TOPIC}`]);
    }
  });

  it("L11: covers a Topic that is not converted, like L6", () => {
    const t = topicWith((x) => ((x as unknown as Record<string, unknown>).terms = [{ term: "Yield", means: "x", emoji: "pizza-slice" }]));
    expect(lessonLintErrors([t], { notYet: [t.id] }).filter((e) => e.startsWith("L11"))).toHaveLength(1);
  });

  it("L12: fails a wrong choice with no mix-up fix, in a question and in a choice Quick try, on any Topic (#485)", () => {
    const bare = topicWith((x) => {
      x.questions[0].choices.push({ id: "bare", text: "It should say up 2%." });
      const tryQ = { id: "pct-demo-try-tap", skill: "wording", kind: "choice", ask: "Which word fits?", answer: "a", choices: [{ id: "a", text: "Rise" }, { id: "b", text: "Fall" }] };
      (x.checks[1].quickTries as unknown[]).push(tryQ);
    });
    const l12 = (t: Topic, notYet: string[] = []) => lessonLintErrors([t], { notYet, l10NotYet: ["pct-demo"] }).filter((e) => e.startsWith("L12"));
    const expected = [
      `L12: question "pct-demo-headline" wrong choice "bare" has no mix-up fix; give it mistake: { tag, fix } with one line naming the slip (spec §3.3)${ON_TOPIC}`,
      `L12: Check "pct-demo-check-2" Quick try "pct-demo-try-tap" wrong choice "b" has no mix-up fix; give it mistake: { tag, fix } with one line naming the slip (spec §3.3)${ON_TOPIC}`,
    ];
    expect(l12(bare)).toEqual(expected);
    // Like L11 it covers a Topic that is not converted too.
    expect(l12(bare, ["pct-demo"])).toEqual(expected);
    expect(l12(lintReadyTopic())).toEqual([]);
  });

  it("L12: the real course has no wrong choice without a mix-up fix", () => {
    expect(lessonLintErrors(loadCourseMap().topics).filter((e) => e.startsWith("L12"))).toEqual([]);
  });

  it("fails a content-only restructure that makes a Check required, which would raise a Due Check", () => {
    const t = topicWith((x) => {
      x.restructure = "content-only";
      x.checks[2].required = true;
    });
    expect(lint(t)).toEqual(['Restructure: Check "pct-demo-check-3" is required, but Topic "pct-demo" is a content-only restructure, so it would raise a Due Check']);
  });
});

describe("lint L10: no typed number and no sum (ADR 0009)", () => {
  /** Turns every fixed Quick try into a True or False one, so no typed try is left. */
  const allTruth = (x: Topic) => {
    for (const c of x.checks)
      for (const q of c.quickTries) {
        if (!("id" in q)) continue;
        const loose = q as unknown as Record<string, unknown>;
        loose.kind = "truth";
        loose.answer = true;
        delete loose.mistakes;
        delete loose.unit;
        delete loose.sign;
        loose.ask = "True or false: the move is called a rise.";
      }
  };

  it("fails a Quick try with kind: number, in the spec's words", () => {
    expect(l10(lintReadyTopic())).toContain(
      'L10: Quick try "pct-demo-try-pts-1" is typed (kind: number): make it kind: choice (ADR 0009) (Topic "pct-demo")',
    );
  });

  it("fails a stem that asks for a sum: a question prompt, a template ask and a conversation Check prompt", () => {
    const t = topicWith((x) => {
      allTruth(x);
      x.questions[0].prompt = "Calculate the move from 4% to 5% in basis points.";
      x.templates[0].ask = "A rate moves from {a}% to {b}%. Work it out in basis points.";
      (x.checks[2] as { prompt: string }).prompt = "Multiply 25 by 4 and say what you get.";
    });
    const text = l10(t).join("\n");
    expect(text).toContain(`L10: question "${t.questions[0].id}" prompt asks for a sum ("Calculate")`);
    expect(text).toContain(`L10: template "${t.templates[0].id}" ask asks for a sum`);
    expect(text).toContain('L10: Check "pct-demo-check-3" prompt asks for a sum ("Multiply")');
  });

  it("fails a template that gives fewer than 2 distinct choices on a draw", () => {
    const t = topicWith((x) => {
      allTruth(x);
      x.templates[0].mistakes = [];
    });
    expect(l10(t).join("\n")).toMatch(/L10: template "[\w-]+" gives fewer than 2 distinct choices/);
  });

  it("skips an allowlisted Topic, fails an allowlisted clean one with 'remove it', and fails an id that is not a Topic", () => {
    expect(l10(lintReadyTopic(), ["pct-demo"])).toEqual([]);
    const cleaner = topicWith((x) => {
      allTruth(x);
      x.questions.forEach((q) => (q.prompt = "Which word names one hundredth of a point?"));
      x.templates.forEach((tpl) => (tpl.ask = "Which reading of the move is right?"));
    });
    expect(l10(cleaner)).toEqual([]);
    expect(l10(cleaner, ["pct-demo"])).toEqual(['List: Topic "pct-demo" is on L10_NOT_YET_STORY but has no L10 hit: remove it from src/course/l10-allowlist.ts']);
    expect(lessonLintErrors([], { notYet: [], l10NotYet: ["ghost"] })).toEqual([
      'List: "ghost" is on L10_NOT_YET_STORY but is not a Topic: remove it from src/course/l10-allowlist.ts',
    ]);
  });

  it("the real course passes with the allowlist: sorted, unique, every id a Topic with at least one L10 hit", () => {
    const topics = loadCourseMap().topics;
    expect(lessonLintErrors(topics)).toEqual([]);
    expect([...L10_NOT_YET_STORY]).toEqual([...L10_NOT_YET_STORY].sort());
    expect(new Set(L10_NOT_YET_STORY).size).toBe(L10_NOT_YET_STORY.length);
    for (const id of L10_NOT_YET_STORY) {
      const t = topics.find((x) => x.id === id);
      expect(t, id).toBeDefined();
      expect(l10(t!), id).not.toEqual([]);
    }
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
