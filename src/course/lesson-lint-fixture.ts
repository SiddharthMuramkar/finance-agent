import { CONVERTED_TOPIC_DATA, topicFileOf } from "./lesson-fixture.ts";
import { parseCourseMap, type Topic } from "./map.ts";

/**
 * The converted fixture made whole for the lesson lint's L8 and L9 (R7a, part of #248). The shared fixture's Check 1
 * has three Quick tries on Skill "pts" but tests no "pts", so those tries can never be shown, and its avoid lists let a
 * draw repeat a fixed try's numbers. Here Check 1 also draws from a "pts" template, and the avoid lists keep every draw
 * apart from the fixed tries and questions of its Check. The shared fixture stays as it is, because the practice tests
 * pin its order of Skills.
 */
export const LINT_READY_DATA = (() => {
  const d = structuredClone(CONVERTED_TOPIC_DATA);
  const apart = [3, 3.5, 6, 6.25, 7.5, 7.2];
  d.templates.push({
    id: "points-between",
    skill: "pts",
    ask: "A rate moves from {a}% to {b}%. How many percentage points did it move?",
    params: { a: { min: 1, max: 9, step: 0.25 }, d: { min: -1.2, max: 1.2, step: 0.05 } },
    derived: { b: "plus(a, d)" },
    answer: "points_between",
    unit: "points",
    decimals: 2,
    sign: "magnitude",
    mistakes: [{ tag: "forgot_to_convert", fix: "That is basis points. Points are the new rate minus the old rate." }],
    avoid: [4, 5, 1, 100, 25, 3.25, ...apart],
  } as (typeof d.templates)[number]);
  for (const t of d.templates) {
    if (t.id === "bp-from-move") t.avoid = [...t.avoid, ...apart];
    if (t.id === "points-from-bp") t.avoid = [...t.avoid, 120];
    if (t.id === "pct-change-move") t.avoid = [...t.avoid, 2, 3, 6, 7];
  }
  d.checks[0].templates = ["points-between", ...(d.checks[0].templates ?? [])];
  return d;
})();

/** The lint-ready fixture as the Course Map loads it. */
export function lintReadyTopic(): Topic {
  const { map, errors } = parseCourseMap([topicFileOf(LINT_READY_DATA)]);
  if (!map) throw new Error(`The lint-ready fixture does not load:\n${errors.join("\n")}`);
  return map.topics[0];
}
