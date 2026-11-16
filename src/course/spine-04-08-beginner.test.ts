import { describe, expect, it } from "vitest";
import { BEGINNER_LISTS, beginnerCheckErrors, type BeginnerLists } from "./beginner-check";
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

/** BEGINNER_LISTS with these Topics deleted from every list, as the combiner will write them. */
const without = (...ids: string[]): BeginnerLists => ({
  newWords: BEGINNER_LISTS.newWords.filter((id) => !ids.includes(id)),
  ownStory: BEGINNER_LISTS.ownStory.filter((id) => !ids.includes(id)),
  yourStory: BEGINNER_LISTS.yourStory.filter((id) => !ids.includes(id)),
  dailyLife: BEGINNER_LISTS.dailyLife.filter((id) => !ids.includes(id)),
});

describe("Spine Topics 'how big can it get' and 'the years you cannot forecast', for beginners", () => {
  it("bring at most four new words each, with life cycle moved to Go deeper", () => {
    expect(growth.terms.length).toBeLessThanOrEqual(4);
    expect(far.terms.length).toBeLessThanOrEqual(4);
    expect(growth.terms.map((t) => t.term)).not.toContain("life cycle");
    expect(growth.goDeeper).toMatch(/life cycle/);
  });

  it("each end the Principle step on a daily-life line", () => {
    expect(growth.dailyLife).toMatch(/food-delivery app.*how big a slice/i);
    expect(far.dailyLife).toMatch(/flat.*years after/i);
  });

  it("keep every Check id, none required, so a Learner who passed either Topic keeps the pass", () => {
    expect(growth.checks.map((c) => c.id)).toEqual(["ug-check", "ug-talk"]);
    expect(far.checks.map((c) => c.id)).toEqual(["far-check", "far-talk"]);
    expect([...growth.checks, ...far.checks].some((c) => c.required)).toBe(false);
  });

  it("follow every beginner rule, so the combiner can delete them from the lists", () => {
    const errors = beginnerCheckErrors(map.topics, { lists: without(GROWTH, FAR) });
    expect(errors.filter((e) => e.includes(GROWTH) || e.includes(FAR))).toEqual([]);
  });

  it("leave the risk and cost-of-capital Topics, already off every list, passing", () => {
    const errors = beginnerCheckErrors(map.topics, { lists: without(GROWTH, FAR) });
    expect(errors.filter((e) => e.includes("spine-07-risk") || e.includes("spine-cost-of-capital"))).toEqual([]);
  });
});
