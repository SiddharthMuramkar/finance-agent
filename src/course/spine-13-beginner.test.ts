import { describe, expect, it } from "vitest";
import { BEGINNER_LISTS, beginnerCheckErrors, type BeginnerLists } from "./beginner-check";
import { loadCourseMap } from "./map";

// Spine Topic 13, is a price a value, for beginners (#96, spec #68; ADR 0020): at most four new words, with EV/EBITDA
// moved to Go deeper and the enterprise value Primer's term kept, no "your story" wording (the decoder's inStory line
// names whose Story it is), and a daily-life line. Every Check id stays and none is required, so a Learner who passed
// the Topic keeps the pass. Read on the real Course Map.

const map = loadCourseMap();
const ID = "spine-12-price-or-value";
const topic = map.topic(ID)!;

describe("Spine Topic 13, is a price a value, for beginners", () => {
  it("brings at most four new words, keeps the Primer's term and moves EV/EBITDA to Go deeper", () => {
    const words = topic.terms.map((t) => t.term);
    expect(words).toEqual(["multiple", "comparable", "enterprise value", "justified multiple"]);
    for (const p of topic.primers ?? []) if (p.term) expect(words).toContain(p.term);
    expect(topic.goDeeper).toMatch(/EV\/EBITDA is enterprise value divided by/);
  });

  it("ends the Principle step on a daily-life line", () => {
    expect(topic.dailyLife).toMatch(/flat.*next door sold for/i);
  });

  it("names whose Story the decoder justifies", () => {
    const justified = topic.terms.find((t) => t.term === "justified multiple")!;
    expect(justified.inStory).toMatch(/each Story for WeWork or IWG/);
  });

  it("keeps every Check id, none required", () => {
    expect(topic.checks.map((c) => c.id)).toEqual(["s12-check", "s12-talk"]);
    expect(topic.checks.some((c) => c.required)).toBe(false);
  });

  it("passes the beginner rules off every not-yet list", () => {
    const off = (ids: readonly string[]) => ids.filter((id) => id !== ID);
    const lists: BeginnerLists = {
      newWords: off(BEGINNER_LISTS.newWords),
      ownStory: off(BEGINNER_LISTS.ownStory),
      yourStory: off(BEGINNER_LISTS.yourStory),
      dailyLife: off(BEGINNER_LISTS.dailyLife),
    };
    expect(beginnerCheckErrors(map.topics, { lists }).filter((e) => e.includes(ID))).toEqual([]);
  });
});
