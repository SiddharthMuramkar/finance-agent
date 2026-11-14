import { describe, expect, it } from "vitest";
import { OWN_COMPARISON_QUESTIONS } from "./questions";

describe("comparison question set", () => {
  it("has unique ids, a reference for every teaching question, and short learner messages", () => {
    const ids = OWN_COMPARISON_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const q of OWN_COMPARISON_QUESTIONS.filter((x) => x.id.startsWith("pv-"))) expect(q.reference, q.id).toBeTruthy();
    for (const q of OWN_COMPARISON_QUESTIONS) for (const m of q.turns) expect(m.length).toBeLessThan(600);
  });
  it("includes rule-testing questions, with the reveal guarded for hindsight", () => {
    expect(OWN_COMPARISON_QUESTIONS.some((q) => q.guardsReveal)).toBe(true);
    expect(OWN_COMPARISON_QUESTIONS.filter((q) => q.id.startsWith("rule-")).length).toBeGreaterThanOrEqual(6);
  });
});
