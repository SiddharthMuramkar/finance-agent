import { describe, expect, it } from "vitest";
import { beginnerCheckErrors } from "./beginner-check";
import { endsOnOwnWork } from "./spine-check";
import { loadCourseMap } from "./map";

// The ready-Case valuation Topic, judge a published valuation (spine-15-value-yourself, Spine Topic 17), for beginners
// (#96 on #92's Topic, spec #68; ADR 0020): at most four new words, no "your story" wording, a daily-life line, and no
// Check about the Learner's own valuation. On the Spine the Learner judges a published Story, so its one Check is the
// quiz and it offers skip ahead like any other Spine Topic (A8); the Learner's own Estimate comes in an Assignment.
// Read on the real Course Map.

const map = loadCourseMap();
const ID = "spine-15-value-yourself";
const topic = map.topic(ID)!;

describe("the ready-Case valuation Topic, judge a published valuation, for beginners", () => {
  it("brings at most four new words", () => {
    expect(topic.terms.length).toBeLessThanOrEqual(4);
  });

  it("ends the Principle step on a daily-life line: check the one reason a seller's figure rests on", () => {
    expect(topic.dailyLife).toMatch(/used bike.*barely ridden.*check that one reason/i);
  });

  it("judges a published valuation from its goal, with no 'your story'", () => {
    expect(topic.goal).toMatch(/^Judge a published valuation as of a past date/);
    expect(topic.goal).not.toMatch(/\byour\s+(?:\w+\s+)?story\b/i);
  });

  it("has no Check about the Learner's own valuation: its one Check is the quiz", () => {
    expect(topic.checks.map((c) => c.id)).toEqual(["yourself-check"]);
    expect(topic.checks.some((c) => c.kind === "conversation")).toBe(false);
    expect(endsOnOwnWork(topic)).toBe(false);
    expect(topic.checks.some((c) => c.required)).toBe(false);
  });

  it("passes every beginner rule", () => {
    expect(beginnerCheckErrors(map.topics).filter((e) => e.includes(ID))).toEqual([]);
  });
});
