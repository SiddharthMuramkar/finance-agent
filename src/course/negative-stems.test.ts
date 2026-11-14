import { describe, expect, it } from "vitest";
import { NEGATIVE_STEM } from "./lesson-lint";
import { loadCourseMap } from "./map";

// Spec #229 (ticket #240): no Check question in any Topic file asks which one is wrong, not true or an exception.
// Stored attempts and review cards point at question ids and old markings are re-marked against the current key, so
// the 19 questions that were reworded keep their ids and their answer ids.
const REWORDED: Record<string, string> = {
  "pb-q-wrong-description": "c",
  "fi-q-not-on-statement": "c",
  "fl-q-error-all-three": "a",
  "ja-q-period": "a",
  "jn-q-loss-labels": "a",
  "jud-po-q-run-rate": "a",
  "jrb-q-mislabel": "b",
  "br-q-aoci": "a",
  "ca-q-cash-vs-profit": "a",
  "op-q-replicate-put": "a",
  "fb-q-missing-assets": "b",
  "jn-q-period-basis": "b",
  "jrb-q-what-survives": "c",
  "bf-q-herding": "a",
  "bf-q-extrapolation": "a",
  "ef-q-semi-strong": "b",
  "ip-q-retail": "a",
  "ra-q-yield-falls": "c",
  "ra-q-gold-valuation": "b",
};

describe("negative stems in Topic-file questions", () => {
  const questions = loadCourseMap().topics.flatMap((t) => t.questions);

  it("has no question prompt that matches the negative-stem rule", () => {
    expect(questions.filter((q) => NEGATIVE_STEM.test(q.prompt)).map((q) => q.id)).toEqual([]);
  });

  it("keeps all 19 reworded question ids with the same answer id", () => {
    expect(Object.keys(REWORDED)).toHaveLength(19);
    for (const [id, answer] of Object.entries(REWORDED)) {
      const q = questions.find((x) => x.id === id);
      expect(q, id).toBeDefined();
      expect(q?.answer, id).toBe(answer);
    }
  });
});
