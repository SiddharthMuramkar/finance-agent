import { describe, expect, it } from "vitest";
import { beginnerCheckErrors } from "./beginner-check";
import { loadCourseMap } from "./map";

// Spine Topic 11, what if it does not survive, for beginners (#96, spec #68; ADR 0020): at most four new words, with
// pledged shares and interest cover moved to Go deeper and cut from the main path, which says them in plain words
// (review 4, K08/K09), a conversation Check that judges the Topic's own survival story about Coffee Day instead of asking
// how the Learner would value it, and puts the Story in no real lender's mouth (K02), and a daily-life line. Every Check
// id stays and none is required, so a Learner who passed the Topic keeps the pass. Read on the real Course Map.

const map = loadCourseMap();
const ID = "spine-10-survival";
const topic = map.topic(ID)!;

/** Every string a Learner meets on the main path: the whole Topic but its Go deeper material, sources, ids and valuation. */
const OFF_PATH = new Set(["goDeeper", "source", "sources", "id", "answer", "valuation"]);
const mainPath = (value: unknown, key = ""): string[] => {
  if (OFF_PATH.has(key)) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((v) => mainPath(v));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => mainPath(v, k));
  return [];
};

describe("Spine Topic 11, what if it does not survive, for beginners", () => {
  it("brings at most four new words and keeps the Primer's term among them", () => {
    const words = topic.terms.map((t) => t.term);
    expect(words.length).toBeLessThanOrEqual(4);
    expect(words).not.toContain("pledged shares");
    for (const p of topic.primers ?? []) if (p.term) expect(words).toContain(p.term);
  });

  it("explains pledged shares and interest cover in Go deeper instead, and the main path neither names nor tests them", () => {
    expect(topic.goDeeper).toMatch(/pledged shares/i);
    expect(topic.goDeeper).toMatch(/interest cover/i);
    const words = mainPath(topic).filter((text) => /\bpledged?\b|interest cover|operating profit/i.test(text));
    expect(words).toEqual([]);
  });

  it("ends the Principle step on a daily-life line", () => {
    expect(topic.dailyLife).toMatch(/lend.*pay you back/i);
  });

  it("asks the Learner to judge the survival story about Coffee Day, not to value it their own way", () => {
    const talk = topic.checks.find((c) => c.id === "survival-talk")!;
    expect(talk.kind).toBe("conversation");
    if (talk.kind !== "conversation") return;
    // The Topic's own illustrative survival story, not a statement made up for a real party (review 4, K02).
    expect(talk.prompt).toMatch(/^The survival story values Coffee Day/);
    expect(talk.prompt).not.toMatch(/\blender\b/i);
    expect(talk.passCriteria).toMatch(/the survival story/);
    expect(talk.passCriteria).not.toMatch(/lender's Story/i);
    expect(talk.prompt).toMatch(/\bjudge\b/i);
    expect(talk.prompt).not.toMatch(/\b(?:as|how) you would (?:set|value)\b/i);
    expect(talk.prompt).not.toMatch(/\btell\b[^.?!]*?\bstory\b/i);
    expect(talk.prompt).not.toMatch(/\byour\s+(?:\w+\s+)?story\b/i);
    expect(talk.skills).toEqual(["weigh-failure", "failure-signs"]);
  });

  it("keeps every Check id, none required", () => {
    expect(topic.checks.map((c) => c.id)).toEqual(["survival-check", "survival-talk"]);
    expect(topic.checks.some((c) => c.required)).toBe(false);
  });

  it("passes every beginner rule", () => {
    expect(beginnerCheckErrors(map.topics).filter((e) => e.includes(ID))).toEqual([]);
  });
});
