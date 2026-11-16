import { describe, expect, it } from "vitest";
import { beginnerCheckErrors } from "./beginner-check";
import { loadCourseMap } from "./map";

// Spine Topics "how big can it get" and "the years you cannot forecast" for beginners (#95, spec #68): each brings at
// most four new words (the growth Topic's "life cycle" moves to Go deeper) and ends its Principle on a daily-life line.
// Every Check id stays and none is required, so a Learner who passed either Topic keeps the pass. Read on the real
// Course Map.

const map = loadCourseMap();
const GROWTH = "spine-04-growth";
const FAR = "spine-08-far-future";
const growth = map.topic(GROWTH)!;
const far = map.topic(FAR)!;

/** Spine Topics 4 to 9 (#95), by id: the outline numbers them, the ids keep their old prefixes. */
const SPINE_4_TO_9 = [
  "spine-04-growth",
  "spine-05-margins",
  "spine-06-growth-cost",
  "spine-07-risk",
  "spine-cost-of-capital",
  "spine-08-far-future",
];

describe("Spine Topics 'how big can it get' and 'the years you cannot forecast', for beginners", () => {
  it("bring at most four new words each, with life cycle moved to Go deeper", () => {
    expect(growth.terms.length).toBeLessThanOrEqual(4);
    expect(far.terms.length).toBeLessThanOrEqual(4);
    expect(growth.terms.map((t) => t.term)).not.toContain("life cycle");
    expect(growth.goDeeper).toMatch(/life cycle/);
  });

  it("each end the Principle step on a daily-life line", () => {
    expect(growth.dailyLife).toMatch(/food-delivery app.*how big a share/i);
    // Review 3, L14: "slice" is the take rate in this Topic, so the market share is a "share".
    expect(growth.dailyLife).not.toMatch(/\bslice\b/i);
    expect(far.dailyLife).toMatch(/flat.*years after/i);
  });

  it("keep every Check id, none required, so a Learner who passed either Topic keeps the pass", () => {
    expect(growth.checks.map((c) => c.id)).toEqual(["ug-check", "ug-talk"]);
    expect(far.checks.map((c) => c.id)).toEqual(["far-check", "far-talk"]);
    expect([...growth.checks, ...far.checks].some((c) => c.required)).toBe(false);
  });

});

describe("Spine Topics 4 to 9 for beginners (#95)", () => {
  // #90's statements Topic is Spine 4 in the merged outline, so these six follow it, numbered 5 to 10.
  it("are the six Spine Topics after #90's statements Topic in the outline", () => {
    const after = map.topic("spine-statements")!.spine!;
    expect(SPINE_4_TO_9.map((id) => map.topic(id)?.spine)).toEqual([1, 2, 3, 4, 5, 6].map((n) => after + n));
  });

  it("follow every beginner rule", () => {
    const errors = beginnerCheckErrors(map.topics);
    expect(errors.filter((e) => SPINE_4_TO_9.some((id) => e.includes(`"${id}"`)))).toEqual([]);
  });
});
