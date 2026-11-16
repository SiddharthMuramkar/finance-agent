import { describe, expect, it } from "vitest";
import { beginnerCheckErrors } from "./beginner-check";
import { loadCourseMap } from "./map";

// Spine Topic 15, living with being wrong, for beginners (#96, spec #68; ADR 0020): at most four new words, a
// conversation Check that judges Damodaran's Tesla range instead of asking for the Learner's own, no "your story"
// wording, and a daily-life line. Every Check id stays and none is required, so a Learner who passed the Topic keeps the
// pass. Read on the real Course Map.

const map = loadCourseMap();
const ID = "spine-14-being-wrong";
const topic = map.topic(ID)!;

describe("Spine Topic 15, living with being wrong, for beginners", () => {
  it("brings at most four new words", () => {
    expect(topic.terms.length).toBeLessThanOrEqual(4);
  });

  it("ends the Principle step on a daily-life line", () => {
    expect(topic.dailyLife).toMatch(/forty minutes to an hour.*bridge/i);
  });

  it("asks which lever should move in Damodaran's story on news, not in the Learner's", () => {
    const q = topic.questions.find((x) => x.id === "wrong-q-news")!;
    expect(q.prompt).toMatch(/his story/);
    expect(q.prompt).not.toMatch(/\byour\s+(?:\w+\s+)?story\b/i);
  });

  it("asks the Learner to judge Damodaran's range for Tesla, not to give their own", () => {
    const talk = topic.checks.find((c) => c.id === "wrong-talk")!;
    expect(talk.kind).toBe("conversation");
    if (talk.kind !== "conversation") return;
    expect(talk.prompt).toMatch(/Damodaran's range of about \$237 to \$673/);
    expect(talk.prompt).toMatch(/\bjudge\b/i);
    expect(talk.prompt).not.toMatch(/\byour own (?:story|range|value|valuation|settings?)\b/i);
    expect(talk.skills).toEqual(["range-rank", "change-mind"]);
  });

  it("keeps every Check id, none required", () => {
    expect(topic.checks.map((c) => c.id)).toEqual(["wrong-check", "wrong-talk"]);
    expect(topic.checks.some((c) => c.required)).toBe(false);
  });

  it("passes every beginner rule", () => {
    expect(beginnerCheckErrors(map.topics).filter((e) => e.includes(ID))).toEqual([]);
  });
});
