import { describe, expect, it } from "vitest";
import { beginnerCheckErrors } from "./beginner-check";
import { loadCourseMap } from "./map";

// Spine Topic 6, what growth costs, for beginners (#95, spec #68; ADR 0020): at most four new words, a conversation
// Check that judges a Story about Webvan instead of asking for the Learner's own, and a daily-life line. Every Check
// id stays and none is required, so a Learner who passed the Topic keeps the pass. Read on the real Course Map.

const map = loadCourseMap();
const ID = "spine-06-growth-cost";
const topic = map.topic(ID)!;

describe("Spine Topic 6, what growth costs, for beginners", () => {
  it("brings at most four new words and keeps the Primer's term among them", () => {
    const words = topic.terms.map((t) => t.term);
    expect(words.length).toBeLessThanOrEqual(4);
    for (const p of topic.primers ?? []) if (p.term) expect(words).toContain(p.term);
  });

  it("ends the Principle step on a daily-life line", () => {
    expect(topic.dailyLife).toMatch(/second shop.*earn more than the loan costs/i);
  });

  it("asks the Learner to judge Webvan's Story, not to tell their own", () => {
    const talk = topic.checks.find((c) => c.id === "growth-cost-talk")!;
    expect(talk.kind).toBe("conversation");
    if (talk.kind !== "conversation") return;
    // Review 3, L04: Webvan's own estimates from its 10-K, and the "could only add value" claim is an analyst's to judge.
    expect(talk.prompt).toMatch(/In its first annual report, Webvan estimated/);
    expect(talk.prompt).toMatch(/An analyst reading the report concludes/);
    expect(talk.prompt).not.toMatch(/founders said/i);
    expect(talk.prompt).toMatch(/\bjudge\b/i);
    expect(talk.prompt).not.toMatch(/\btell\b[^.?!]*?\bstory\b/i);
    expect(talk.prompt).not.toMatch(/\byour\s+(?:\w+\s+)?story\b/i);
    expect(talk.skills).toEqual(["growth-pays"]);
  });

  it("keeps every Check id, none required", () => {
    expect(topic.checks.map((c) => c.id)).toEqual(["growth-cost-check", "growth-cost-talk"]);
    expect(topic.checks.some((c) => c.required)).toBe(false);
  });

  it("passes every beginner rule", () => {
    expect(beginnerCheckErrors(map.topics).filter((e) => e.includes(ID))).toEqual([]);
  });
});
