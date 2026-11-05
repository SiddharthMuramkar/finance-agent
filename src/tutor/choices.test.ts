import { describe, expect, it } from "vitest";
import { choicesFor, type ChoiceStep } from "./choices";

/** Seam 3: the Choices picker (spec 2026-11-05, D3a). Labels, says and emoji are the spec's code set. */

const ids = (step: ChoiceStep, suggestion: string | null = null, last: string | null = null) => choicesFor(step, suggestion, last).map((c) => c.id);

const STEPS: ChoiceStep[] = ["story", "concept", "explore", "your_turn", "check", "reveal", "principle", "none"];

describe("choicesFor", () => {
  it("gives the story step's set when the Tutor suggests none: next, word, life", () => {
    expect(choicesFor("story", null, null)).toEqual([
      { id: "next", label: "What happened next?", says: "What happened next?", emoji: "scroll" },
      { id: "word", label: "What does that word mean?", says: "What does that word mean?", emoji: "thinking-face" },
      { id: "life", label: "How does this touch my life?", says: "How does this touch my life?", emoji: "money-with-wings" },
    ]);
  });

  it("puts the Tutor's valid suggestion first at concept, then show and word", () => {
    const choices = choicesFor("concept", "Who were the traders?", null);
    expect(choices.map((c) => c.id)).toEqual(["tutor", "show", "word"]);
    expect(choices[0]).toMatchObject({ label: "Who were the traders?", says: "Who were the traders?" });
  });

  it("drops a suggestion that asks for a sum", () => {
    expect(ids("concept", "Work out the EMI")).toEqual(["show", "word", "deeper"]);
  });

  it("drops a suggestion over six words", () => {
    expect(ids("concept", "Tell me who the bond traders were then")).toEqual(["show", "word", "deeper"]);
  });

  it("drops a suggestion with an emoji, or one that copies a set label", () => {
    expect(ids("concept", "Who were they 🤔")).toEqual(["show", "word", "deeper"]);
    expect(ids("concept", "Show me")).toEqual(["show", "word", "deeper"]);
  });

  it("skips the Choice pressed last turn: show at concept leaves word and deeper", () => {
    expect(ids("concept", null, "show")).toEqual(["word", "deeper"]);
  });

  it("never offers Quiz me at a Check", () => {
    expect(ids("check")).toEqual(["word", "show", "deeper"]);
    for (const last of [null, "word", "show", "deeper"]) expect(ids("check", "Who were the traders?", last)).not.toContain("quiz");
  });

  it("gives Go deeper the Go deeper chip's words, and Show me its own", () => {
    const concept = choicesFor("concept", null, null);
    expect(concept.find((c) => c.id === "deeper")).toEqual({ id: "deeper", label: "Go deeper", says: "Go deeper.", emoji: "magnifying-glass-tilted-left" });
    expect(concept.find((c) => c.id === "show")).toEqual({ id: "show", label: "Show me", says: "Show me.", emoji: "eyes" });
    expect(choicesFor("your_turn", null, null)[0]).toEqual({ id: "quiz", label: "Quiz me", says: "Quiz me.", emoji: "direct-hit" });
  });

  it("always returns two or three Choices, for every step, suggestion and last press", () => {
    const suggestions = [null, "Who were the traders?", "Work out the EMI", "Show me"];
    const last = [null, "next", "show", "word", "life", "quiz", "deeper", "tutor"];
    for (const step of STEPS)
      for (const s of suggestions)
        for (const l of last) {
          const n = choicesFor(step, s, l).length;
          expect(n, `${step} ${s} ${l}`).toBeGreaterThanOrEqual(2);
          expect(n).toBeLessThanOrEqual(3);
        }
  });
});
