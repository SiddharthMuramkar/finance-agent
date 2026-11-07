import { describe, expect, it } from "vitest";
import { loadCourseMap } from "@/course/map";
import { navigate, TEACHING_STEPS, type Place, type Progress } from "@/course/navigator";
import { stepContext } from "./context";
import type { TurnFacts } from "./turn-facts";

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

// Round 10 (critics BP-2, MP-1; run 23 T13 turns 5 and 15): asked "just tell me the answer pls", the Tutor said it could not
// see the Quick try's numbers although the try sat on the Learner's screen, then taught the /100 and x100 steps for the
// Learner to do. Code now gives the Tutor the open try's words and choices, and its answer only when the Learner asks for it.
describe("the Quick try open on the Learner's screen (BP-2, MP-1)", () => {
  const facts: TurnFacts = { step: "your_turn", cap: 80, exampleCurrency: "INR", caseCurrencies: ["USD"], quizOpen: false, openItems: [], blockedNumbers: [], internalWords: [] };
  const openTry = {
    ask: "If the Fed took its 3% rate to 3.5%, a rise traders call 50 basis points, her story would say: First step, done for you: a reporter writes the gap in points.",
    choices: ["Rates rose half a percentage point", "Rates rose half a percent", "Rates rose 50 percent"],
  };
  const at = () => placeAt("num-percent-bps", "your_turn", 0);

  it("gives the Tutor the open, unanswered try's words and choices, says it can see them, and never its answer", () => {
    const text = stepContext(at(), [], undefined, false, undefined, { ...facts, openTry });
    expect(text).toContain(`Quick try on the Learner's screen, not answered yet (code posts no new one this turn): "${openTry.ask}" Its choices: "Rates rose half a percentage point"; "Rates rose half a percent"; "Rates rose 50 percent".`);
    expect(text).toContain("You see this try as the Learner does: never say you cannot see it.");
    expect(text).not.toMatch(/its answer/i);
  });

  it("gives its answer only when the Learner asked for it, to say in words and stop", () => {
    const text = stepContext(at(), [], undefined, false, undefined, { ...facts, replyKind: "hint", openTry: { ...openTry, answer: "Rates rose half a percentage point" } });
    expect(text).toContain('The Learner asked for its answer: "Rates rose half a percentage point". Say it in words as a story fact and stop: no steps for the Learner to do, no ask of your own.');
  });

  it("says code posts the next try with this reply when none is open, and that try is the reply's one ask", () => {
    const text = stepContext(at(), [], undefined, false, undefined, { ...facts, tryPosted: true });
    expect(text).toContain("Code posts the next Quick try with this reply: it is the reply's one ask, so write no ask of your own.");
    expect(text).not.toContain("Quick try on the Learner's screen");
  });

  it("says neither away from Your turn", () => {
    const text = stepContext(placeAt("num-percent-bps", "concept", 0), [], undefined, false, undefined, { ...facts, step: "concept" });
    expect(text).not.toMatch(/Quick try on the Learner's screen|Code posts the next Quick try/);
  });
});

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
