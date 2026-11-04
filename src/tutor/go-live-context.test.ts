import { describe, expect, it } from "vitest";
import { CONVERTED_TOPIC_DATA, topicFileOf } from "@/course/lesson-fixture";
import { parseCourseMap, type CourseMap } from "@/course/map";
import { navigate, type Place, type Progress } from "@/course/navigator";
import { presentValueOnly } from "@/test/present-value-map";
import { stepContext } from "./context";

/**
 * Seam: the Course Navigator context (ticket #248, go-live fixes). A converted Topic's Running example and its Skills'
 * analogies reach the Tutor, so a re-teach reuses them rather than inventing new ones.
 */

const { map: parsed } = parseCourseMap([topicFileOf(CONVERTED_TOPIC_DATA)]);
const map = parsed as CourseMap;

function placeAt(m: CourseMap, step: Place["step"], checkIndex: number): Place {
  const topic = m.topics[0];
  const progress: Progress = { currentTopicId: topic.id, topics: { [topic.id]: { status: "in_progress", step, passedChecks: topic.checks.slice(0, checkIndex).map((c) => c.id), revealShown: false } } };
  const place = navigate(m, progress);
  if (!place) throw new Error("no place");
  return place;
}

describe("a converted Topic's context", () => {
  it("names the Running example and the analogy of each Skill of the current Check", () => {
    const text = stepContext(placeAt(map, "your_turn", 0));
    expect(text).toContain("Running example (reuse it): A savings rate goes from 4% to 5%.");
    expect(text).toContain("Analogy for basis points are points times 100 (reuse it, never a new one): 100 paise make ₹1.");
    // Check 2's analogy is for a Skill this Check does not test.
    expect(text).not.toContain("₹10 more on ₹20");
  });

  it("names Check 2's analogy at Check 2", () => {
    expect(stepContext(placeAt(map, "concept", 1))).toContain(
      "Analogy for percent change is the move divided by the old rate, times 100 (reuse it, never a new one): ₹10 more on ₹20 is big. ₹10 more on ₹500 is small.",
    );
  });

  it("adds nothing to a Topic not converted", () => {
    const pv = presentValueOnly({ withoutInsight: true });
    const topic = pv.topics[0];
    const place = navigate(pv, { currentTopicId: topic.id, topics: { [topic.id]: { status: "in_progress", step: "concept", passedChecks: [], revealShown: false } } })!;
    expect(stepContext(place)).not.toMatch(/Running example|Analogy for/);
  });
});
