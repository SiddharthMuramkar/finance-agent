import { describe, expect, it } from "vitest";
import { loadCourseMap } from "./map";
import { courseOverview, navigate, type Progress } from "./navigator";
import { topicTexts } from "./topic-texts";

// Spine Topic 1 for beginners (spec #68, ticket #88; ADR 0020): at most four new words, "share" defined in the Moment,
// the Topic's words and the Workbench's labels the same, round numbers wherever the Learner reads one to answer, no
// typed answer and no own-story Check, the Insight settled by tap, and a daily-life line. Read on the real Topic file.

const map = loadCourseMap();
const topic = map.topic("spine-01-worth")!;

describe("Spine Topic 1 for beginners", () => {
  it("brings at most four new words, and defines 'share' in the Moment", () => {
    expect(topic.terms.length).toBeLessThanOrEqual(4);
    expect(topic.cases[0].story).toMatch(/\bA share is\b/);
  });

  it("puts on a card each new word its texts use, and says 'sales', never 'revenue' (F12)", () => {
    expect(topic.terms.map((t) => t.term)).toEqual(["price", "value", "operating margin", "cost of capital"]);
    const texts = topicTexts(topic).map((t) => t.text);
    expect(texts.some((t) => /\bcost of capital\b/i.test(t))).toBe(true);
    expect(texts.filter((t) => /\brevenue\b/i.test(t))).toEqual([]);
  });

  it("asks for no own story: its second Check is a judging Check by tap, under the same id", () => {
    expect(topic.checks.map((c) => [c.id, c.kind])).toEqual([
      ["worth-check", "quiz"],
      ["worth-talk", "quiz"],
    ]);
    // Never required, so a Learner who passed the Topic before owes no Due Check (navigator.ts, dueIn).
    expect(topic.checks.every((c) => !c.required)).toBe(true);
  });

  it("has no 'your story' wording in any of its texts", () => {
    const hits = topicTexts(topic).filter((t) => /\byour story\b/i.test(t.text));
    expect(hits.map((t) => t.text)).toEqual([]);
    expect(topic.explore?.workbench?.title).not.toMatch(/your story/i);
  });

  it("settles the Insight by a tap among written choices, one of them right", () => {
    const pick = topic.insight!.pick!;
    expect(pick.choices.length).toBeGreaterThanOrEqual(2);
    expect(pick.choices.map((c) => c.id)).toContain(pick.answer);
    expect(pick.choices.filter((c) => c.id !== pick.answer).every((c) => c.mistake?.fix)).toBe(true);
  });

  it("ends its Principle with the daily-life line", () => {
    expect(topic.dailyLife).toBe("A headline says a firm is worth $50bn. A price someone paid, or a value someone argued?");
  });

  it("shows only round numbers in the questions and Quick tries a Learner answers", () => {
    const asked = [
      ...topic.questions.flatMap((q) => [q.prompt, ...("computed" in q && q.computed ? q.computed.changes.map((c) => c.label) : (q as { choices: { text: string }[] }).choices.map((c) => c.text))]),
      ...topic.checks.flatMap((c) => c.quickTries.flatMap((t) => ["ask" in t ? t.ask : "", ...("choices" in t && t.choices ? t.choices.map((c) => c.text) : []), ...("computed" in t && t.computed ? t.computed.changes.map((c) => c.label) : [])])),
    ];
    expect(asked.filter((s) => /\d\.\d/.test(s))).toEqual([]);
  });

  it("names its levers as the Workbench does: 'Sales for each dollar invested'", () => {
    const labels = topic.questions.flatMap((q) => ("computed" in q && q.computed ? q.computed.changes.map((c) => c.label) : []));
    expect(labels.filter((l) => /sales to capital/i.test(l))).toEqual([]);
    expect(labels.some((l) => /Sales for each dollar invested/.test(l))).toBe(true);
  });
});

describe("a Learner who passed Spine Topic 1 before", () => {
  // The Topic as it was passed before ticket #88: its quiz Check and its conversation Check, both by id.
  const before: Progress = {
    currentTopicId: null,
    topics: { "spine-01-worth": { step: "principle", passedChecks: ["worth-check", "worth-talk"], revealShown: true, status: "passed", insight: "found" } },
  };

  it("keeps the pass, with every Check passed and no Due Check", () => {
    const row = courseOverview(map, before).find((t) => t.id === "spine-01-worth")!;
    expect(row.status).toBe("passed");
    expect(row.checks.map((c) => [c.id, c.passed])).toEqual([
      ["worth-check", true],
      ["worth-talk", true],
    ]);
    // The default path moves on to Spine Topic 2: nothing is owed in Topic 1.
    expect(navigate(map, before)?.topic.id).not.toBe("spine-01-worth");
  });
});
