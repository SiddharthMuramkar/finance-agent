import { describe, expect, it } from "vitest";
import { BEGINNER_LISTS, beginnerCheckErrors, type BeginnerLists } from "./beginner-check";
import { loadCourseMap } from "./map";

// Spine Topic 11, what if it does not survive, for beginners (#96, spec #68; ADR 0020): at most four new words, with
// pledged shares moved to Go deeper, a conversation Check that judges a lender's Story about Coffee Day instead of asking
// how the Learner would value it, and a daily-life line. Every Check id stays and none is required, so a Learner who
// passed the Topic keeps the pass. Read on the real Course Map.

const map = loadCourseMap();
const ID = "spine-10-survival";
const topic = map.topic(ID)!;

describe("Spine Topic 11, what if it does not survive, for beginners", () => {
  it("brings at most four new words and keeps the Primer's term among them", () => {
    const words = topic.terms.map((t) => t.term);
    expect(words.length).toBeLessThanOrEqual(4);
    expect(words).not.toContain("pledged shares");
    for (const p of topic.primers ?? []) if (p.term) expect(words).toContain(p.term);
  });

  it("explains pledged shares in Go deeper instead", () => {
    expect(topic.goDeeper).toMatch(/pledged shares/i);
  });

  it("ends the Principle step on a daily-life line", () => {
    expect(topic.dailyLife).toMatch(/lend.*pay you back/i);
  });

  it("asks the Learner to judge a lender's Story about Coffee Day, not to value it their own way", () => {
    const talk = topic.checks.find((c) => c.id === "survival-talk")!;
    expect(talk.kind).toBe("conversation");
    if (talk.kind !== "conversation") return;
    expect(talk.prompt).toMatch(/A lender said Coffee Day/);
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
