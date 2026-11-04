import { stringify } from "yaml";
import { loadCourseMap, parseCourseMap, type CourseMap, type Topic } from "@/course/map";

/**
 * Percent's written-ahead Widget before the Topic was converted (spec #229): "One rate change, said three ways", with
 * its rateChange readouts and its reveal task. The real Topic now opens rate_move presets instead, so the tests of
 * written-ahead Widgets that read rateChange or a reveal task use this fixture.
 */
export const OLD_PERCENT_WIDGET = {
  id: "rate-change-three-ways",
  parts: ["cagr"],
  rateChange: { old: "$old", new: "$new" },
  code: [
    'root = Widget("One rate change, said three ways", [old, new, points, bps, change, steps])',
    "$old = 5",
    "$new = 5.2",
    'old = Slider("old", "Old rate", 0, 10, 0.01, $old, "percent")',
    'new = Slider("new", "New rate", 0, 10, 0.01, $new, "percent")',
    'points = TextContent("In percentage points: " + @Round($new - $old, 2) + " points")',
    'bps = TextContent("In basis points: " + @Round(($new - $old) * 100, 0) + " bp")',
    'change = TextContent("As a percent change of the old rate: " + ($old == 0 ? "none, because the old rate is 0%" : @Round(($new - $old) / $old * 100, 2) + "%"))',
    "steps = GuidedTasks([rise, cut, low])",
    'rise = GuidedTask("Set a rise from 6% to 6.4%", $old == 6 && $new == 6.4)',
    'cut = GuidedTask("Now a cut from 8% to 7.1%", $old == 8 && $new == 7.1)',
    'low = GuidedTask("Now a rise from 0.5% to 0.9%, and compare its percent change with the first rise", $old == 0.5 && $new == 0.9)',
    "",
  ].join("\n"),
  revealTask: {
    case: "fed-hike-1994",
    dataset: "fed-funds-target",
    text: "Set the Fed's move of February 1994: from {before}% to {after}%",
    done: "$old == {before} && $new == {after}",
  },
};

/**
 * The real Percent Topic alone, as a one-Topic course taught the old way: its Case, concept and questions, no Skills,
 * cards or templates, a quiz of its six questions, the Fed-language conversation Check, and the old Widget.
 */
export function oldPercentOnly(real: CourseMap = loadCourseMap()): CourseMap {
  const t = real.topic("num-percent-bps")!;
  const fed = t.checks.find((c): c is Extract<Topic["checks"][number], { kind: "conversation" }> => c.id === "pb-fed-language" && c.kind === "conversation")!;
  const body = {
    ...t,
    stage: t.stage,
    path: 1,
    prerequisites: [],
    subject: undefined,
    connections: undefined,
    restructure: undefined,
    runningExample: undefined,
    skills: [],
    templates: [],
    terms: [],
    questions: t.questions.map(({ skill: _skill, choices, ...q }) => ({ ...q, choices: choices.map(({ id, text }) => ({ id, text })) })),
    checks: [
      { id: "pb-quiz-language", kind: "quiz", questions: t.questions.map((q) => q.id), perAttempt: 3, passRule: { correct: 2 } },
      { id: fed.id, kind: "conversation", prompt: fed.prompt, passCriteria: fed.passCriteria },
    ],
    widgets: [OLD_PERCENT_WIDGET],
  };
  const { map, errors } = parseCourseMap([{ name: "num-percent-bps.yaml", text: stringify(body) }]);
  if (!map) throw new Error(errors.join("\n"));
  return map;
}
