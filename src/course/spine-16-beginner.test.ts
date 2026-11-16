import { describe, expect, it } from "vitest";
import { beginnerCheckErrors } from "./beginner-check";
import { endsOnOwnWork } from "./spine-check";
import { loadCourseMap } from "./map";

// Spine Topic 16, value one yourself, for beginners (#96, spec #68; ADR 0020): at most four new words, no "your story"
// wording, a daily-life line, and a closing conversation Check that walks through the valuation the Learner saved
// without asking them to "tell" a story. It is still the Learner's own work (ownWork), so it offers no skip ahead (A8).
// Every Check id stays and none is required, so a Learner who passed the Topic keeps the pass. Read on the real Course Map.

const map = loadCourseMap();
const ID = "spine-15-value-yourself";
const topic = map.topic(ID)!;

describe("Spine Topic 16, value one yourself, for beginners", () => {
  it("brings at most four new words", () => {
    expect(topic.terms.length).toBeLessThanOrEqual(4);
  });

  it("ends the Principle step on a daily-life line", () => {
    expect(topic.dailyLife).toMatch(/used bike.*write down what you think it is worth/i);
  });

  it("saves the valuation, not 'your story', from its goal", () => {
    expect(topic.goal).toMatch(/save it to your Notebook/);
    expect(topic.goal).not.toMatch(/\byour\s+(?:\w+\s+)?story\b/i);
  });

  it("closes on the Learner's own work: walking through the valuation they saved, lever by lever", () => {
    const talk = topic.checks.find((c) => c.id === "yourself-talk")!;
    expect(talk.kind).toBe("conversation");
    if (talk.kind !== "conversation") return;
    expect(talk.ownWork).toBe(true);
    expect(endsOnOwnWork(topic)).toBe(true);
    expect(talk.prompt).toMatch(/^Walk through the valuation you saved/);
    expect(talk.prompt).not.toMatch(/\btell\b[^.?!]*?\bstory\b/i);
    expect(talk.prompt).not.toMatch(/\byour\s+(?:\w+\s+)?story\b/i);
    expect(talk.skills).toEqual(["as-of", "own-story"]);
  });

  it("keeps every Check id, none required", () => {
    expect(topic.checks.map((c) => c.id)).toEqual(["yourself-check", "yourself-talk"]);
    expect(topic.checks.some((c) => c.required)).toBe(false);
  });

  it("passes every beginner rule", () => {
    expect(beginnerCheckErrors(map.topics).filter((e) => e.includes(ID))).toEqual([]);
  });
});
