import { describe, expect, it } from "vitest";
import { beginnerCheckErrors } from "./beginner-check";
import { loadCourseMap } from "./map";
import { courseOverview, navigate, type Progress } from "./navigator";

// Spine Topic 5, margins, for beginners (#95, spec #68; ADR 0020): at most four new words, a conversation Check that
// judges a given Story instead of asking for the Learner's own, and a daily-life line. Every Check id stays, none
// required, so a Learner who passed the Topic keeps the pass. Read on the real Course Map.

const map = loadCourseMap();
const MARGINS = "spine-05-margins";
const margins = map.topic(MARGINS)!;

/** The same asks the course check calls a Learner's own story (src/course/beginner-check.ts). */
const OWN_STORY_ASKS = [
  /\btell\b[^.?!]*?\bstory\b/i,
  /\b(?:as|how) you would (?:set|value)\b/i,
  /\byour own (?:story|range|value|valuation|settings?)\b/i,
  /\bas you see it\b/i,
];

describe("Spine Topic 5, margins, for beginners", () => {
  it("brings at most four new words", () => {
    expect(margins.terms.length).toBeLessThanOrEqual(4);
  });

  it("keeps unit economics, cut from the terms, in Go deeper", () => {
    expect(margins.terms.map((t) => t.term)).not.toContain("unit economics");
    expect(margins.goDeeper).toMatch(/unit economics/i);
  });

  it("ends the Principle step on a daily-life line", () => {
    expect(margins.dailyLife).toMatch(/coffee shop.*what the shops around it keep/i);
  });

  it("asks the Learner to judge a given Story, not tell their own", () => {
    const talk = margins.checks.find((c) => c.id === "margins-talk")!;
    expect(talk.kind).toBe("conversation");
    if (talk.kind !== "conversation") return;
    expect(talk.prompt).toMatch(/fund manager says/i);
    expect(talk.prompt).toMatch(/judge that story/i);
    expect(OWN_STORY_ASKS.filter((re) => re.test(talk.prompt))).toEqual([]);
    expect(talk.passCriteria).toMatch(/judge/i);
    expect(talk.skills).toEqual(["rivals-cap"]);
  });

  it("passes every beginner rule", () => {
    expect(beginnerCheckErrors(map.topics).filter((e) => e.includes(MARGINS))).toEqual([]);
  });

  it("keeps every Check id, none required, so a Learner who passed the Topic keeps the pass", () => {
    expect(margins.checks.map((c) => c.id)).toEqual(["margins-check", "margins-talk"]);
    expect(margins.checks.some((c) => c.required)).toBe(false);
    const passed: Progress = {
      currentTopicId: null,
      topics: { [MARGINS]: { step: "principle", passedChecks: ["margins-check", "margins-talk"], revealShown: true, status: "passed" } },
    };
    expect(courseOverview(map, passed).find((t) => t.id === MARGINS)).toMatchObject({ status: "passed" });
    expect(navigate(map, passed)?.dueChecks ?? []).toEqual([]);
  });
});
