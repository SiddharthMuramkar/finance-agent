import { describe, expect, it } from "vitest";
import { loadCourseMap } from "@/course/map";
import { navigate, TEACHING_STEPS, type Place, type Progress } from "@/course/navigator";
import { stepContext } from "./context";

/**
 * Seam S6: the Course Navigator context before the reveal (issue #486). The Case title, story and terms go to the
 * Tutor at every step, so they must hold only what was known on the as-of date: no word of the fraud before the reveal.
 */

const OUTCOME_WORDS = /forg|phony|fraud|fak|cook|fictitious|falsif|bogus|confession|restat/i;
// fs-earnings-quality teaches fraud by name, so before its reveal only the Case's own outcome is checked (issue #500):
// no confession, no restatement, no word of Raju's letter of 7 January 2009.
const CASE_OUTCOME_WORDS = /confession|confess|restat|7 January 2009|resign/i;
const BEFORE_REVEAL = TEACHING_STEPS.slice(0, TEACHING_STEPS.indexOf("reveal"));

function placeAt(topicId: string, step: Place["step"], checkIndex: number): Place {
  const map = loadCourseMap();
  const topic = map.topics.find((t) => t.id === topicId);
  if (!topic) throw new Error(`no Topic ${topicId}`);
  const progress: Progress = {
    currentTopicId: topic.id,
    topics: { [topic.id]: { status: "in_progress", step, passedChecks: topic.checks.slice(0, checkIndex).map((c) => c.id), revealShown: false } },
  };
  const place = navigate(map, progress);
  if (!place) throw new Error("no place");
  return place;
}

describe("the Satyam Topics' context before the reveal", () => {
  for (const topicId of ["fs-links", "fs-balance"]) {
    for (const step of BEFORE_REVEAL) {
      for (const checkIndex of [0, 1]) {
        it(`${topicId} at ${step} (Check ${checkIndex + 1}) carries no outcome word`, () => {
          const text = stepContext(placeAt(topicId, step, checkIndex));
          expect(text).not.toContain("Reveal (what happened)");
          expect(text.split("\n").filter((l) => OUTCOME_WORDS.test(l))).toEqual([]);
        });
      }
    }
  }

  for (const step of BEFORE_REVEAL) {
    for (const checkIndex of [0, 1]) {
      it(`fs-earnings-quality at ${step} (Check ${checkIndex + 1}) carries no word of the confession`, () => {
        const text = stepContext(placeAt("fs-earnings-quality", step, checkIndex));
        expect(text).not.toContain("Reveal (what happened)");
        expect(text.split("\n").filter((l) => CASE_OUTCOME_WORDS.test(l))).toEqual([]);
      });
    }
  }

  it("fs-links sends the Reveal from the reveal step on", () => {
    expect(stepContext(placeAt("fs-links", "reveal", 2))).toMatch(/Reveal \(what happened\): .*phony invoices/);
  });
});
