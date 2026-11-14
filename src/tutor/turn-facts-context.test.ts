import { describe, expect, it } from "vitest";
import { navigate, type TeachingStep } from "@/course/navigator";
import { presentValueOnly } from "@/test/present-value-map";
import { noVerdictContext, openerNote, stepContext } from "./context";
import type { TurnFacts } from "./turn-facts";

/**
 * The Course Navigator context with this turn's facts (spec #229, ticket #238): code names the word limit, the
 * currency and, while a quiz is open, the numbers to keep away from. The Tutor may teach freely during an open quiz:
 * only the open answers are held back.
 */

const map = presentValueOnly({ withoutInsight: true });

function placeAt(step: TeachingStep, passedChecks: string[] = []) {
  return navigate(map, {
    currentTopicId: "present-value",
    topics: { "present-value": { step, passedChecks, revealShown: false, status: "in_progress" } },
  })!;
}

const facts = (over: Partial<TurnFacts> = {}): TurnFacts => ({
  step: "check",
  cap: 80,
  exampleCurrency: "INR",
  caseCurrencies: ["USD"],
  quizOpen: true,
  openItems: [{ prompt: "What is the present value of $1,100 received in one year, discounted at 10% a year?", choices: ["$1,000", "$990"], answer: "$1,000" }],
  blockedNumbers: ["1100", "10", "1000", "990"],
  internalWords: ["present-value"],
  ...over,
});

const REFUSALS = ["Do not write quiz questions", "help with them", "hint at answers", "Do not teach or hint", "after they submit", "after you submit"];

describe("the context at an open quiz Check", () => {
  const quiz = placeAt("check");

  it("lists the blocked numbers and the word limit, and says to teach freely with other numbers", () => {
    const context = stepContext(quiz, [], undefined, false, undefined, facts());
    expect(context).toContain("Word limit for this reply: 80 words.");
    expect(context).toContain("Blocked numbers (in the open quiz questions and the next attempt's): 1100, 10, 1000, 990.");
    expect(context).toMatch(/teach the idea, show a Widget or start again/);
    expect(context).toMatch(/Never give or confirm the answer to an open question/);
    for (const old of REFUSALS) expect(context).not.toContain(old);
  });

  it("carries the Concept, so the Tutor can teach from it", () => {
    const context = stepContext(quiz, [], undefined, false, undefined, facts());
    expect(context).toContain(`Concept: ${map.topic("present-value")!.concept.trim().slice(0, 40)}`);
  });

  it("carries the Concept card instead, when code has one", () => {
    const context = stepContext(quiz, [], undefined, false, undefined, facts({ card: "Present value is what a later amount is worth today." }));
    expect(context).toContain("Concept card: Present value is what a later amount is worth today.");
    expect(context).not.toContain(`Concept: ${map.topic("present-value")!.concept.trim().slice(0, 40)}`);
  });

  it("drops the refusal even without facts", () => {
    const context = stepContext(quiz);
    for (const old of REFUSALS) expect(context).not.toContain(old);
    expect(context).not.toContain("Word limit for this reply");
  });
});

describe("the context's turn lines", () => {
  it("name the currency, the Reply kind, the method, the frustration count and the card when set", () => {
    const context = stepContext(
      placeAt("concept"),
      [],
      undefined,
      false,
      undefined,
      facts({ step: "concept", quizOpen: false, openItems: [], blockedNumbers: [], replyKind: "go_deeper", cap: 120, method: "worked example", frustration: 2, card: "A card." }),
    );
    expect(context).toContain("Word limit for this reply: 120 words.");
    expect(context).toContain("Currency for everyday examples and Widgets: ₹ (rupees). The Case's own figures stay in $ (dollars).");
    expect(context).toContain("Reply kind: go_deeper.");
    expect(context).toContain("Method for this reply: worked example.");
    expect(context).toMatch(/Frustration: 2\. .*eight words or fewer.*smaller step/);
    expect(context).toContain("Concept card on screen (code showed it; never write your own version): A card.");
    expect(context).not.toContain("Blocked numbers");
  });

  it("are left out without facts, so the context is as before", () => {
    const context = stepContext(placeAt("concept"));
    expect(context).not.toContain("Word limit for this reply");
    expect(context).not.toContain("Currency for everyday examples");
  });
});

describe("the context at a conversation Check", () => {
  it("says to teach with other numbers and never state the reasoning the pass criteria want about the prompt's own move", () => {
    const conversation = placeAt("check", ["pv-quiz-discounting"]);
    expect(conversation.check?.kind).toBe("conversation");
    const context = noVerdictContext({ ...conversation, check: conversation.check! }, [], undefined, facts({ quizOpen: false, openItems: [], blockedNumbers: [] }));
    expect(context).toContain("No verdict was recorded");
    expect(context).toContain("Word limit for this reply: 80 words.");
    expect(context).toMatch(/teach with numbers other than the prompt's/i);
    expect(context).toMatch(/never state the reasoning the pass criteria ask for/i);
  });
});

describe("the opener at an open quiz", () => {
  it("offers help now, naming the blocked numbers, instead of help after they submit", () => {
    const note = openerNote(placeAt("check"), { quizOpen: true }, facts());
    expect(note).toContain("is open on the right, in the Check tab. Point the Learner to it");
    expect(note).toMatch(/offer help now/);
    expect(note).toContain("1100, 10, 1000, 990");
    for (const old of REFUSALS) expect(note).not.toContain(old);
  });
});
