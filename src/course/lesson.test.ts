import { describe, expect, it } from "vitest";
import { loadCourseMap, parseCourseMap, STEP_KEYS } from "./map";
import { goalCheckErrors, whyProblems } from "./goal-check";
import { finishFromWidget, navigate, nextOffer, stepSetting, takeNext, TEACHING_STEPS, widgetDone, type Progress } from "./navigator";
import { foundLines } from "./outcome";
import { conditionValue, guidedTaskTexts, type SavedWork } from "./written-ahead";

/** The goal, step settings (opens, doneWhen) and found lines of a Topic: the schema, the course check, the Navigator and the outcome lines. */

const WIDGET = `root = Widget("Rate", [rate, steps])
$rate = 5
rate = Slider("rate", "Rate", 0, 10, 0.01, $rate, "percent")
steps = GuidedTasks([zero, even])
zero = GuidedTask("Set the rate to 0%", $rate == 0)
even = GuidedTask("Find the break-even rate", $rate >= 3.36 && $rate <= 3.39)`;

/** A minimal Topic file with one written-ahead Widget; `extra` adds Topic-level keys. */
function file(extra = "", checks = "") {
  const indented = WIDGET.split("\n").map((l) => `      ${l}`).join("\n");
  return {
    name: "t.yaml",
    text: `
id: t
title: T
stage: foundation
path: 1
${extra}
cases:
  - id: t-case
    title: A case
    asOf: 2018-10-24
    story: What people knew then.
    reveal: What happened.
concept: The idea.
principle: The lesson.
widgets:
  - id: w
    code: |
${indented}
${checks || `checks:\n  - id: c1\n    kind: conversation\n    prompt: Explain it.\n    passCriteria: Explains it.`}
`,
  };
}

const errorsOf = (extra: string, checks?: string) => parseCourseMap([file(extra, checks)]).errors;

describe("the Topic schema: goal, steps and found", () => {
  it("accepts a goal, step settings and found lines", () => {
    const { map, errors } = parseCourseMap([
      file(`goal: Move money to today.
steps:
  - step: your_turn
    opens: w
    doneWhen: { kind: ticked, widget: w, task: 1 }
  - step: concept
    check: c1
    opens: w
found:
  - when: { kind: near, widget: w, variable: $rate, value: 3.37, within: 0.02 }
    text: You found it at {value}%.`),
    ]);
    expect(errors).toEqual([]);
    const t = map!.topic("t")!;
    expect(t.goal).toBe("Move money to today.");
    expect(t.steps).toHaveLength(2);
    expect(t.found).toHaveLength(1);
  });

  it("refuses a goal over a line, and a setting that does nothing", () => {
    expect(errorsOf(`goal: ${"x".repeat(121)}`).join("\n")).toContain("goal");
    expect(errorsOf("steps:\n  - step: concept").join("\n")).toContain("needs opens or doneWhen");
  });

  it("names the Widget, Check or Guided Task that does not exist", () => {
    expect(errorsOf("steps:\n  - step: concept\n    opens: nope").join("\n")).toContain('opens "nope"');
    expect(errorsOf("steps:\n  - step: concept\n    check: nope\n    opens: w").join("\n")).toContain('no Check "nope"');
    expect(errorsOf("steps:\n  - step: concept\n    doneWhen: { kind: ticked, widget: w, task: 3 }").join("\n")).toContain("no Guided Task 3");
    expect(errorsOf("found:\n  - when: { kind: set, widget: gone, variable: $a }\n    text: x").join("\n")).toContain('no written-ahead Widget "gone"');
  });

  it("never lets Widget state finish explore, a Check or the principle (ADR 0001), and keeps the explore Widget to code", () => {
    for (const step of ["explore", "check", "principle"]) {
      expect(errorsOf(`steps:\n  - step: ${step}\n    doneWhen: { kind: set, widget: w, variable: $rate }`).join("\n")).toMatch(/cannot finish from Widget state|completed by the Learner/);
    }
    const insight = `insight:
  question: What happens?
  written: It flips.
  foundWhen: They say so.
  hints: [Look again.]
explore:
  before: c1
  widget: w
`;
    expect(errorsOf(`${insight}steps:\n  - step: concept\n    opens: w`).join("\n")).toContain("explore Widget");
  });

  it("keeps the schema's step words equal to the Navigator's", () => {
    expect([...STEP_KEYS]).toEqual([...TEACHING_STEPS]);
  });

  it("is used by the real Topics: present value and Percent have a goal, and present value has a found line", () => {
    const map = loadCourseMap();
    expect(map.topic("present-value")?.goal).toBeTruthy();
    expect(map.topic("present-value")?.found).toEqual([expect.objectContaining({ when: { kind: "ticked", widget: "annuity-worth-today", task: 2 } })]);
    expect(map.topic("num-percent-bps")?.goal).toBeTruthy();
    expect(goalCheckErrors(map.topics)).toEqual([]);
  });
});

describe("the course check for goals, why lines and found lines", () => {
  const base = { id: "t", insight: { question: "q", written: "Money received later is worth less than money received now, so waiting costs you.", foundWhen: "f", hints: ["h"] } };
  it("wants words: no figure, no typed formula, no Insight repeated", () => {
    expect(goalCheckErrors([{ ...base, goal: "Compare money at different dates." }])).toEqual([]);
    expect(goalCheckErrors([{ ...base, goal: "Earn 5% a year." }]).join()).toContain("figure");
    expect(goalCheckErrors([{ ...base, goal: "Money received later is worth less than money received now." }]).join()).toContain("repeats its Insight");
  });
  it("takes a found line's number from the saved state, never from the text", () => {
    const when = { kind: "set", widget: "w", variable: "$a" } as const;
    expect(goalCheckErrors([{ ...base, found: [{ when, text: "You guessed {value}%." }] }])).toEqual([]);
    expect(goalCheckErrors([{ ...base, found: [{ when, text: "You guessed 12%." }] }]).join()).toContain("types a figure");
  });

  // Spec A6: one line, at most thirty words, linking the Topic to valuing a company; on every Spine Topic.
  it("keeps a why line to thirty words, and never says valuation starts from a rate", () => {
    const thirty = "A value starts as a story about how big a business gets, what it keeps, what growth costs and how risky it is, and this Topic sets the first lever.";
    expect(thirty.split(" ")).toHaveLength(30);
    expect(goalCheckErrors([{ ...base, why: thirty }])).toEqual([]);
    expect(goalCheckErrors([{ ...base, why: `${thirty} Really.` }])).toEqual([`Topic t: its why line has 31 words; keep it to 30 or fewer: "${thirty} Really."`]);
    const rate = "Valuing a company, Damodaran's way, starts from a rate, so basis points matter.";
    expect(goalCheckErrors([{ ...base, why: rate }]).join()).toContain("says valuation starts from a rate; it starts from a story about the business");
  });

  it("keeps a why line in plain words: no figure and no typed formula", () => {
    expect(goalCheckErrors([{ ...base, why: "Amazon's value sat 90% in the years after year 10, so this matters." }]).join()).toContain("its why line has a figure; write it in words");
    expect(goalCheckErrors([{ ...base, why: "Value = cash / (r - g) is why the far future matters." }]).join()).toContain("its why line types a formula");
  });

  it("gives every written Topic a why line that passes, linking it to valuing a company (A6)", () => {
    const map = loadCourseMap();
    for (const t of map.topics) {
      expect(t.why, t.id).toBeTruthy();
      expect(whyProblems(t.why!), t.id).toEqual([]);
      expect(t.why, t.id).toMatch(/valu|worth|price/i);
    }
  });

  it("needs a why line on a Spine Topic only", () => {
    expect(goalCheckErrors([{ ...base, stage: "spine" }]).join()).toContain("Spine Topic t has no why line");
    expect(goalCheckErrors([{ ...base, stage: "foundation" }])).toEqual([]);
    expect(goalCheckErrors([{ ...base, stage: "spine", why: "A price is paid and a value is argued; this Topic shows the difference." }])).toEqual([]);
  });
});

describe("conditions on saved Widget state", () => {
  const topic = parseCourseMap([file()]).map!.topic("t")!;
  const saved = (w: SavedWork): Record<string, SavedWork> => ({ w });

  it("reads Guided Task texts in list order", () => {
    expect(guidedTaskTexts(topic.widgets[0].code)).toEqual(["Set the rate to 0%", "Find the break-even rate"]);
  });
  it("ticked: the task's text is among the ticked", () => {
    const when = { kind: "ticked", widget: "w", task: 2 } as const;
    expect(conditionValue(topic, when, saved({ values: {}, ticked: ["Set the rate to 0%"] }))).toBeNull();
    expect(conditionValue(topic, when, saved({ values: {}, ticked: ["Find the break-even rate"] }))).toBe(true);
    expect(conditionValue(topic, when, {})).toBeNull();
  });
  it("set and near: the $variable's saved value, near a target", () => {
    expect(conditionValue(topic, { kind: "set", widget: "w", variable: "$guess" }, saved({ values: {}, ticked: [] }))).toBeNull();
    expect(conditionValue(topic, { kind: "set", widget: "w", variable: "$guess" }, saved({ values: { $guess: 12 }, ticked: [] }))).toBe(12);
    const near = { kind: "near", widget: "w", variable: "$rate", value: 3.37, within: 0.05 } as const;
    expect(conditionValue(topic, near, saved({ values: { $rate: 3.4 }, ticked: [] }))).toBe(3.4);
    expect(conditionValue(topic, near, saved({ values: { $rate: 5 }, ticked: [] }))).toBeNull();
  });
  it("the found lines say what the Learner found, with their own number", () => {
    const withFound = parseCourseMap([
      file(`found:
  - when: { kind: set, widget: w, variable: $rate }
    text: You set the rate to {value}%.
  - when: { kind: ticked, widget: w, task: 2 }
    text: You found the break-even.`),
    ]).map!.topic("t")!;
    expect(foundLines(withFound, {})).toEqual([]);
    expect(foundLines(withFound, saved({ values: { $rate: 3.3712 }, ticked: ["Find the break-even rate"] }))).toEqual(["You set the rate to 3.37%.", "You found the break-even."]);
  });
});

describe("the Course Navigator finishes a step from saved Widget state", () => {
  // A Topic whose your turn opens its Widget and is done once the first Guided Task is ticked (Percent's old setting).
  const map = parseCourseMap([file("steps:\n  - step: your_turn\n    opens: w\n    doneWhen: { kind: ticked, widget: w, task: 1 }")]).map!;
  const topicId = "t";
  const progress: Progress = { currentTopicId: topicId, topics: { [topicId]: { step: "your_turn", passedChecks: [], revealShown: false, status: "in_progress" } } };
  const task = guidedTaskTexts(map.topic(topicId)!.widgets[0].code)[0];
  const done: Record<string, SavedWork> = { w: { values: { $rate: 0 }, ticked: [task] } };

  it("knows the current step's setting", () => {
    const place = navigate(map, progress)!;
    expect(place.step).toBe("your_turn");
    expect(stepSetting(place.topic, place.step, place.check)?.opens).toBe("w");
  });
  it("is done only once the condition holds", () => {
    expect(widgetDone(map, progress, {})).toBe(false);
    expect(widgetDone(map, progress, { w: { values: {}, ticked: [] } })).toBe(false);
    expect(widgetDone(map, progress, done)).toBe(true);
    expect(finishFromWidget(map, progress, {}).ok).toBe(false);
  });
  it("moves on to the Check, like the Tutor finishing the step", () => {
    const moved = finishFromWidget(map, progress, done);
    expect(moved.ok && navigate(map, moved.progress)?.step).toBe("check");
  });
  it("does nothing at a step with no condition, and a ticked task elsewhere does not finish it", () => {
    const concept: Progress = { currentTopicId: topicId, topics: { [topicId]: { step: "concept", passedChecks: [], revealShown: false, status: "in_progress" } } };
    expect(widgetDone(map, concept, done)).toBe(false);
    expect(finishFromWidget(map, concept, done).ok).toBe(false);
  });
  it("the offer after it is Next for a step not yet taught: it teaches without moving on", () => {
    const moved = finishFromWidget(map, progress, done);
    if (!moved.ok) throw new Error(moved.reason);
    // The Check step offers no Next; a Learner at the principle after a finished Check is a Next as usual.
    expect(nextOffer(map, moved.progress, { begun: false })).toBeNull();
    const taken = takeNext(map, { ...progress }, "check", { begun: true });
    expect(taken.ok).toBe(true);
  });
});
