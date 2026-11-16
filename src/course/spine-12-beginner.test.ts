import { describe, expect, it } from "vitest";
import { BEGINNER_LISTS, beginnerCheckErrors, type BeginnerLists } from "./beginner-check";
import { loadCourseMap } from "./map";

// Spine Topic 12, how a story becomes numbers, for beginners (#96, spec #68; ADR 0020): at most four new words, with
// network effects moved to Go deeper, a conversation Check that judges Bill Gurley's Story about Uber instead of asking
// for the Learner's own, and a daily-life line. Every Check id stays and none is required, so a Learner who passed the
// Topic keeps the pass. Read on the real Course Map.

const map = loadCourseMap();
const ID = "spine-11-story-to-numbers";
const topic = map.topic(ID)!;

describe("Spine Topic 12, how a story becomes numbers, for beginners", () => {
  it("brings at most four new words and moves network effects to Go deeper", () => {
    const words = topic.terms.map((t) => t.term);
    expect(words).toEqual(["narrative", "total market", "market share", "revenue slice"]);
    for (const p of topic.primers ?? []) if (p.term) expect(words).toContain(p.term);
    expect(topic.goDeeper).toMatch(/network effect/i);
  });

  it("ends the Principle step on a daily-life line", () => {
    expect(topic.dailyLife).toMatch(/third shop.*story/i);
  });

  it("asks the Learner to judge Bill Gurley's Story, not to tell their own", () => {
    const talk = topic.checks.find((c) => c.id === "s11-talk")!;
    expect(talk.kind).toBe("conversation");
    if (talk.kind !== "conversation") return;
    expect(talk.prompt).toMatch(/Bill Gurley's story/);
    expect(talk.prompt).toMatch(/\bjudge\b/i);
    expect(talk.prompt).not.toMatch(/\btell\b[^.?!]*?\bstory\b/i);
    expect(talk.prompt).not.toMatch(/\b(?:as|how) you would (?:set|value)\b|\byour own\b|\bas you see it\b/i);
    expect(talk.skills).toEqual(["s11-story-levers", "s11-story-holds"]);
  });

  it("keeps every Check id, none required", () => {
    expect(topic.checks.map((c) => c.id)).toEqual(["s11-check", "s11-talk"]);
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
