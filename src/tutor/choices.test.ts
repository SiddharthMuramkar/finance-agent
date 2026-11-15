import { describe, expect, it } from "vitest";
import { loadCourseMap } from "@/course/map";
import { choicesFor, wordChoiceTerm, type ChoiceStep } from "./choices";
import { isChipMessage } from "./chips";

/** Seam 3: the Choices picker (spec 2026-11-05, D3a). Labels and says are the spec's code set; a Choice is words only (ADR 0008, A2). */

const ids = (step: ChoiceStep, suggestion: string | null = null, last: string | null = null) => choicesFor(step, suggestion, last).map((c) => c.id);

const STEPS: ChoiceStep[] = ["story", "concept", "explore", "your_turn", "check", "reveal", "principle", "none"];

describe("choicesFor", () => {
  it("gives the story step's set when the Tutor suggests none: next, word, life", () => {
    expect(choicesFor("story", null, null)).toEqual([
      { id: "next", label: "What happened next?", says: "What happened next?" },
      { id: "word", label: "What does that word mean?", says: "What does that word mean?" },
      { id: "life", label: "How does this touch my life?", says: "How does this touch my life?" },
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
    expect(concept.find((c) => c.id === "deeper")).toEqual({ id: "deeper", label: "Go deeper", says: "Go deeper." });
    expect(concept.find((c) => c.id === "show")).toEqual({ id: "show", label: "Show me", says: "Show me." });
    expect(choicesFor("your_turn", null, null)[0]).toEqual({ id: "quiz", label: "Quiz me", says: "Quiz me." });
  });

  it("makes every Choice words only: id, label and says, at every step, the Tutor's suggestion included (A2)", () => {
    for (const step of STEPS)
      for (const c of choicesFor(step, "Who were the traders?", null)) expect(Object.keys(c).sort(), `${step} ${c.id}`).toEqual(["id", "label", "says"]);
  });

  it("posts only chip words for code's set, so a press is never an Insight attempt", () => {
    for (const step of STEPS) for (const c of choicesFor(step, null, null)) expect(isChipMessage(c.says), c.says).toBe(true);
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

  it("always returns two or three Choices with no word Choice offered (the reply named no term, G6)", () => {
    const suggestions = [null, "Who were the traders?", "Show me"];
    const last = [null, "next", "show", "word", "life", "quiz", "deeper", "tutor"];
    for (const step of STEPS)
      for (const s of suggestions)
        for (const l of last) {
          const set = choicesFor(step, s, l, null);
          expect(set.length, `${step} ${s} ${l}`).toBeGreaterThanOrEqual(2);
          expect(set.length).toBeLessThanOrEqual(3);
          expect(set.map((c) => c.id)).not.toContain("word");
          if (step === "check") expect(set.map((c) => c.id)).not.toContain("quiz");
        }
  });
});

/** Spec 2026-11-12, G6: the word Choice names the first Topic term in the reply; with no term, it is not offered. */
describe("the word Choice names its word", () => {
  const percent = loadCourseMap().topic("num-percent-bps")!;
  const term = (reply: string) => wordChoiceTerm(percent.terms, reply);

  it("names the first Topic term in the reply: basis points in num-percent-bps gives 'basis point'", () => {
    const word = term("The Fed raised rates by 50 basis points.");
    expect(word).toBe("basis point");
    expect(choicesFor("concept", null, null, word)).toEqual([
      { id: "show", label: "Show me", says: "Show me." },
      { id: "word", label: "What does 'basis point' mean?", says: "What does 'basis point' mean?" },
      { id: "deeper", label: "Go deeper", says: "Go deeper." },
    ]);
  });

  it("takes the term that comes first in the reply, not the first in the Topic file", () => {
    expect(term("Fifty basis points is half a percentage point.")).toBe("basis point");
    expect(term("Half a percentage point is fifty basis points.")).toBe("percentage point");
  });

  it("matches any case and at word boundaries only", () => {
    expect(term("A Rate Hike lands.")).toBe("rate hike");
    expect(term("The basis pointer moved.")).toBeNull();
  });

  it("leaves the word Choice out when the reply uses no Topic term, and keeps the others", () => {
    expect(term("February 1994. Bond traders in New York are about to get a surprise.")).toBeNull();
    expect(choicesFor("story", null, null, null).map((c) => c.label)).toEqual(["What happened next?", "How does this touch my life?"]);
    expect(choicesFor("concept", null, null, null).map((c) => c.label)).toEqual(["Show me", "Go deeper"]);
  });

  it("puts the step's spare in when the last press and the missing word would leave one", () => {
    expect(choicesFor("story", null, "next", null).map((c) => c.id)).toEqual(["life", "deeper"]);
    expect(choicesFor("check", null, "show", null).map((c) => c.id)).toEqual(["deeper", "life"]);
  });

  it("names a term with a short form by the spelling the reply used: the phrase without brackets, or the short form", () => {
    const terms = [{ term: "compound annual growth rate (CAGR)" }, { term: "basis point (bp)" }];
    expect(wordChoiceTerm(terms, "Its compound annual growth rate was 12 percent.")).toBe("compound annual growth rate");
    expect(wordChoiceTerm(terms, "Its CAGR was 12 percent.")).toBe("CAGR");
    expect(wordChoiceTerm(terms, "A cut of 25 bps.")).toBe("bp");
    expect(wordChoiceTerm(terms, "A cut of 25 basis points.")).toBe("basis point");
    expect(choicesFor("check", null, null, wordChoiceTerm(terms, "Its cagr was 12 percent."))[0].label).toBe("What does 'CAGR' mean?");
  });

  it("posts chip words, so a press of the named Choice is never an Insight attempt", () => {
    expect(isChipMessage("What does 'basis point' mean?")).toBe(true);
    expect(isChipMessage("What does that word mean?")).toBe(true);
    expect(isChipMessage("What does 'basis point' mean? And why?")).toBe(false);
  });

  it("does not offer the Tutor's suggestion and the word Choice twice when they say the same", () => {
    const set = choicesFor("concept", "What does 'basis point' mean?", null, "basis point");
    expect(set.filter((c) => c.label === "What does 'basis point' mean?")).toHaveLength(1);
    expect(set).toHaveLength(3);
  });
});
