import { describe, expect, it } from "vitest";
import { loadCourseMap } from "./map";

/**
 * Spec E6 shared test 2: "no outcome hint before the reveal" (issue #487). In the Satyam Topics, the terms, the
 * pre-reveal scenes and the questions of every quiz Check (all taught before the reveal) must not act out the fraud:
 * no faked sales or cash, no assets found missing, no bank confirmation of cash.
 */

const HINTS = /forg|phony|fraud|fak|cook|fictitious|falsif|bogus|never happened|made up|missing|not real|bank's own confirmation/i;

describe("the Satyam Topics before the reveal", () => {
  const map = loadCourseMap();
  for (const id of ["fs-links", "fs-balance"]) {
    const topic = map.topics.find((t) => t.id === id);

    it(`${id}: terms carry no outcome hint`, () => {
      const texts = (topic?.terms ?? []).map((t) => `${t.term} | ${t.means} | ${t.pro} | ${t.example} | ${t.inStory}`);
      expect(texts.filter((t) => HINTS.test(t))).toEqual([]);
    });

    it(`${id}: quiz questions carry no outcome hint`, () => {
      const quizIds = new Set((topic?.checks ?? []).flatMap((c) => (c.kind === "quiz" ? c.questions : [])));
      const questions = (topic?.questions ?? []).filter((q) => quizIds.has(q.id));
      expect(questions.length).toBeGreaterThan(0);
      expect(questions.filter((q) => HINTS.test(JSON.stringify(q))).map((q) => q.id)).toEqual([]);
    });

    it(`${id}: scenes before the reveal carry no outcome hint`, () => {
      const before = (topic?.scenes ?? []).filter((s) => s.step !== "reveal" && s.step !== "principle");
      expect(before.filter((s) => HINTS.test(JSON.stringify(s))).map((s) => s.id)).toEqual([]);
    });
  }
});
