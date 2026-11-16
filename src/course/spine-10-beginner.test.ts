import { describe, expect, it } from "vitest";
import { beginnerCheckErrors } from "./beginner-check";
import { loadCourseMap } from "./map";

// Spine Topic 10, from the business to one share, for beginners (#96, spec #68; ADR 0020): at most four new words, with
// minority interests moved to Go deeper, and a daily-life line. Every Check id stays and none is required, so a Learner
// who passed the Topic keeps the pass. Read on the real Course Map.

const map = loadCourseMap();
const ID = "spine-09-to-one-share";
const topic = map.topic(ID)!;

describe("Spine Topic 10, from the business to one share, for beginners", () => {
  it("brings at most four new words and keeps the Primer's term among them", () => {
    const words = topic.terms.map((t) => t.term);
    expect(words.length).toBeLessThanOrEqual(4);
    expect(words).not.toContain("minority interests");
    for (const p of topic.primers ?? []) if (p.term) expect(words).toContain(p.term);
  });

  it("explains minority interests in Go deeper instead", () => {
    expect(topic.goDeeper).toMatch(/minority interests/i);
  });

  it("ends the Principle step on a daily-life line", () => {
    expect(topic.dailyLife).toMatch(/house.*mortgage/i);
  });

  it("keeps every Check id, none required", () => {
    expect(topic.checks.map((c) => c.id)).toEqual(["share-check", "share-talk"]);
    expect(topic.checks.some((c) => c.required)).toBe(false);
  });

  it("passes every beginner rule", () => {
    expect(beginnerCheckErrors(map.topics).filter((e) => e.includes(ID))).toEqual([]);
  });
});
