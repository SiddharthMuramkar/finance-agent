import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CONCEPT_CARD, QUICK_TRY, QUICK_TRY_RESULT, type QuickTryData } from "@/tutor/session-item-kinds";
import { pickOf, QuickTryContext, quickTryResultOf, type QuickTryHost } from "./quick-try-view";
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

const host = (over: Partial<QuickTryHost> = {}): QuickTryHost => ({ locked: false, answered: new Map(), answer: async () => null, ...over });
/** The chip button whose words are `text`, as drawn. */
const chipOf = (html: string, text: string) => html.match(new RegExp(`<button[^>]*>(?:(?!</button>).)*?${text}(?:(?!</button>).)*</button>`))![0];
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
    expect(draw(QUICK_TRY, truthTry, host({ answered: new Map([[truthTry.key, {}]]) }))).toMatch(/data-testid="quick-try-true"[^>]*disabled=""/);
  });

  describe("once answered, as a reload draws it from the stored result (issue #526)", () => {
    const answered = (pick: { choice?: string; answer?: string }) => draw(QUICK_TRY, choiceTry, host({ answered: new Map([[choiceTry.key, pick]]) }));

    it("shows the tapped wrong chip pressed and the right one marked, both still disabled", () => {
      const html = answered({ choice: "0.6", answer: "60" });
      const tapped = chipOf(html, "0.6 bp");
      expect(tapped).toContain('aria-pressed="true"');
      expect(tapped).toContain("disabled");
      expect(tapped).not.toContain("data-right");
      const right = chipOf(html, "60 bp");
      expect(right).toContain('data-right="true"');
      expect(right).toContain('aria-pressed="false"');
      expect(right).toContain("Right answer: ");
      expect(right).toMatch(/<svg[^>]*data-result="right"/);
      expect(right).toContain("disabled");
    });

    // Spec 2026-11-12 G4: a wrong tapped choice was drawn with a grey tick. Now it shows a cross and "Your pick", and only
    // the right choice shows a tick.
    it("marks a wrong tap with a cross and Your pick, never a tick, and only the right choice with a tick", () => {
      const html = answered({ choice: "0.6", answer: "60" });
      const tapped = chipOf(html, "0.6 bp");
      expect(tapped).toMatch(/<svg[^>]*data-result="wrong"/);
      expect(tapped).not.toMatch(/data-result="right"/);
      expect(tapped).not.toContain("✓");
      expect(tapped).not.toMatch(/content-\['✓/);
      expect(tapped.replace(/<[^>]+>/g, "")).toMatch(/0\.6 bp· Your pick$/);
      expect(tapped).toContain("Not right: ");
      const right = chipOf(html, "60 bp");
      expect(right).toMatch(/<svg[^>]*data-result="right"/);
      expect(right).not.toContain("Your pick");
      // One tick on the row, on the right choice; one cross, on the wrong pick.
      expect(html.match(/data-result="right"/g)).toHaveLength(1);
      expect(html.match(/data-result="wrong"/g)).toHaveLength(1);
    });

    it("marks a wrong True or False tap with a cross and Your pick, and the right one with a tick", () => {
      const html = draw(QUICK_TRY, truthTry, host({ answered: new Map([[truthTry.key, { choice: "true", answer: "false" }]]) }));
      expect(chipOf(html, "True")).toMatch(/data-result="wrong"/);
      expect(chipOf(html, "True")).toContain("Your pick");
      expect(chipOf(html, "False")).toMatch(/data-result="right"/);
      expect(chipOf(html, "False")).not.toContain("Your pick");
    });

    it("marks a right tap once: pressed and right, with no second tick", () => {
      const html = answered({ choice: "60", answer: "60" });
      const tapped = chipOf(html, "60 bp");
      expect(tapped).toContain('aria-pressed="true"');
      expect(tapped).toContain('data-right="true"');
      expect(tapped).not.toContain("Right answer: ");
      expect(tapped.match(/data-result="right"/g)).toHaveLength(1);
      expect(html).not.toContain('data-testid="quick-try-your-pick"');
      expect(html).not.toMatch(/data-result="wrong"/);
      expect(chipOf(html, "0.6 bp")).toContain('aria-pressed="false"');
    });

    it("marks a True or False try's tapped button", () => {
      const html = draw(QUICK_TRY, truthTry, host({ answered: new Map([[truthTry.key, { choice: "true", answer: "false" }]]) }));
      expect(chipOf(html, "True")).toContain('aria-pressed="true"');
      expect(chipOf(html, "False")).toContain('data-right="true"');
    });

    it("leaves every chip unmarked for a result stored before the choice was kept", () => {
      const html = answered({});
      expect(html).not.toContain('aria-pressed="true"');
      expect(html).not.toContain("data-right");
      expect(html).not.toContain("data-result");
      expect(html.match(/data-testid="quick-try-choice"[^>]*disabled=""/g)).toHaveLength(2);
    });

    it("marks nothing before an answer", () => {
      const html = draw(QUICK_TRY, choiceTry);
      expect(html).not.toContain('aria-pressed="true"');
      expect(html).not.toContain("data-right");
    });
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
    const right = draw(QUICK_TRY_RESULT, { key: "k", verdict: "right", line: "Right." });
    expect(right).toContain(">Right.<");
    // A tick in the success colour beside the words, never colour alone (ADR 0015), and never mint.
    expect(right).toMatch(/<svg[^>]*data-result="right"[^>]*text-\[var\(--success\)\]/);
    expect(right).not.toMatch(/--you|--mint/);
    expect(draw(QUICK_TRY_RESULT, { key: "k", verdict: "wrong", line: "Not quite." })).toMatch(/<svg[^>]*data-result="wrong"[^>]*text-\[var\(--danger\)\]/);
    expect(draw(QUICK_TRY_RESULT, { key: "k", verdict: "known_mistake", line: "One point is 100 basis points, so multiply by 100, not 10." })).toContain("multiply by 100, not 10.");
    expect(draw(QUICK_TRY_RESULT, { key: "k", verdict: "wrong", line: "Not quite." })).toContain('data-verdict="wrong"');
  });

  it("reads the tapped and the right choice back from the stored data, and takes an older result without them", () => {
    const stored = { key: "k", verdict: "known_mistake", line: "Fix.", choice: "0.6", answer: "60" };
    expect(pickOf(stored)).toEqual({ choice: "0.6", answer: "60" });
    expect(quickTryResultOf(stored)).toEqual(stored);
    expect(pickOf({ key: "k", verdict: "right", line: "Right." })).toEqual({});
    expect(pickOf({ choice: 6, answer: null })).toEqual({});
    expect(quickTryResultOf({ key: "k", verdict: "right", line: "Right." })).toEqual({ key: "k", verdict: "right", line: "Right." });
  });
});
