import { describe, expect, it } from "vitest";
import { beginnerCheckErrors } from "./beginner-check";
import { loadCourseMap } from "./map";

// Spine Topic 14, what the price assumes, for beginners (#96, spec #68; ADR 0020): no "your story" wording (the term's
// example names whose plan it is) and a daily-life line, with its four new words kept. Every Check id stays and none is
// required, so a Learner who passed the Topic keeps the pass. Read on the real Course Map.

const map = loadCourseMap();
const ID = "spine-13-price-assumes";
const topic = map.topic(ID)!;

describe("Spine Topic 14, what the price assumes, for beginners", () => {
  it("brings at most four new words and keeps the Primer's term among them", () => {
    const words = topic.terms.map((t) => t.term);
    expect(words.length).toBeLessThanOrEqual(4);
    for (const p of topic.primers ?? []) if (p.term) expect(words).toContain(p.term);
  });

  it("ends the Principle step on a daily-life line", () => {
    expect(topic.dailyLife).toMatch(/asking price.*have to be true/i);
  });

  it("names whose plan the term's example reads back", () => {
    const assumes = topic.terms.find((t) => t.term === "what the price assumes")!;
    expect(assumes.example).toMatch(/its owner/);
    expect(assumes.example).not.toMatch(/\byour\b/i);
  });

  it("keeps every Check id, none required", () => {
    expect(topic.checks.map((c) => c.id)).toEqual(["s13-check", "s13-talk"]);
    expect(topic.checks.some((c) => c.required)).toBe(false);
  });

  it("passes every beginner rule", () => {
    expect(beginnerCheckErrors(map.topics).filter((e) => e.includes(ID))).toEqual([]);
  });
});
