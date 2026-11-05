import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CONCEPT_CARD, QUICK_TRY, QUICK_TRY_RESULT, type QuickTryData } from "@/tutor/session-item-kinds";
import { QuickTryContext, type QuickTryHost } from "./quick-try-view";
import { SessionItemView } from "./session-item-view";

/** The Concept card, the Quick try and its result as the Learner sees them in the conversation (spec #229, ticket #243). */

const card = { checkId: "c1", title: "One move, two ways", lines: ["A savings rate goes from 4% to 5%.", "Points: 5 minus 4 is 1 percentage point."], writeDown: "Points times 100 give basis points." };
const choiceTry: QuickTryData = {
  key: "qt:1:0:t:bp-from-move:half",
  checkId: "c1",
  skillId: "pts-to-bp",
  prompt: "A rate moves from 2% to 2.6%. How many basis points?",
  kind: "choice",
  choices: [
    { id: "0.6", text: "0.6 bp" },
    { id: "60", text: "60 bp" },
  ],
  halfDone: "First step, done for you: the move is 0.6 points.",
};
/** A Quick try stored before taps: kind "number" and no choices. */
const oldTry: QuickTryData = { key: "qt:1:0:old", checkId: "c1", skillId: "pts-to-bp", prompt: "How many basis points?", kind: "number", unit: "bp" };
const truthTry: QuickTryData = { key: "qt:1:1:word-1", checkId: "c2", skillId: "wording", prompt: "A rate goes from 2% to 3%. True or false: rates rose 50%.", kind: "truth" };

const host = (over: Partial<QuickTryHost> = {}): QuickTryHost => ({ locked: false, answered: new Set(), answer: async () => null, ...over });
const draw = (kind: string, data: object, value: QuickTryHost | null = host()) =>
  renderToStaticMarkup(
    <QuickTryContext.Provider value={value}>
      <SessionItemView item={{ kind, data: data as Record<string, unknown> }} />
    </QuickTryContext.Provider>,
  );

describe("the Concept card", () => {
  it("draws its plain lines with the write-down line in bold", () => {
    const html = draw(CONCEPT_CARD, card);
    expect(html).toContain('data-testid="concept-card"');
    expect(html).toContain("A savings rate goes from 4% to 5%.");
    expect(html).toMatch(/<p data-testid="concept-card-write-down" class="[^"]*font-semibold[^"]*">Points times 100 give basis points\.<\/p>/);
  });
  it("draws nothing for a broken row", () => {
    expect(draw(CONCEPT_CARD, { title: "x" })).toBe("");
  });
});

describe("a Quick try", () => {
  it("is a row of choices to tap, never a box, and shows a half-done try's first step", () => {
    const html = draw(QUICK_TRY, choiceTry);
    expect(html.match(/data-testid="quick-try-choice"/g)).toHaveLength(2);
    expect(html).toContain(">0.6 bp<");
    expect(html).toContain(">60 bp<");
    expect(html).toContain("First step, done for you: the move is 0.6 points.");
    expect(html).not.toMatch(/inputmode|quick-try-input|quick-try-check|<input/i);
    expect(html).not.toMatch(/data-testid="quick-try-choice"[^>]*disabled=""/);
  });

  it("is True and False buttons for a truth try", () => {
    const html = draw(QUICK_TRY, truthTry);
    expect(html).toContain('data-testid="quick-try-true"');
    expect(html).toContain('data-testid="quick-try-false"');
    expect(html).not.toContain("quick-try-input");
  });

  it("is locked while a Tutor turn runs, and once it has a result", () => {
    expect(draw(QUICK_TRY, choiceTry, host({ locked: true }))).toMatch(/data-testid="quick-try-choice"[^>]*disabled=""/);
    expect(draw(QUICK_TRY, truthTry, host({ answered: new Set([truthTry.key]) }))).toMatch(/data-testid="quick-try-true"[^>]*disabled=""/);
  });

  it("draws read-only with no host (old Sessions, Past Sessions)", () => {
    const html = draw(QUICK_TRY, choiceTry, null);
    expect(html).toContain("A rate moves from 2% to 2.6%. How many basis points?");
    expect(html).not.toContain("quick-try-choice");
  });

  it("draws an older stored number try read-only, with a line that the Tutor can give a fresh one", () => {
    const html = draw(QUICK_TRY, oldTry);
    expect(html).toContain("How many basis points?");
    expect(html).toContain("Ask the Tutor for a fresh Quick try.");
    expect(html).not.toMatch(/inputmode|<input|quick-try-choice/i);
  });
});

describe("a Quick try's result", () => {
  it("shows its line: Right., a Known mistake's fix, or Not quite.", () => {
    expect(draw(QUICK_TRY_RESULT, { key: "k", verdict: "right", line: "Right." })).toContain(">Right.<");
    expect(draw(QUICK_TRY_RESULT, { key: "k", verdict: "known_mistake", line: "One point is 100 basis points, so multiply by 100, not 10." })).toContain("multiply by 100, not 10.");
    expect(draw(QUICK_TRY_RESULT, { key: "k", verdict: "wrong", line: "Not quite." })).toContain('data-verdict="wrong"');
  });
});
