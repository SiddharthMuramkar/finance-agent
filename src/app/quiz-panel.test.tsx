import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MissedQuiz, OpenQuiz } from "@/learner/quiz";
import { QuizPanel } from "./quiz-panel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const quiz: OpenQuiz = {
  attemptId: 1,
  checkId: "c",
  checkNumber: 1,
  checkCount: 2,
  attemptNo: 0,
  questions: [{ id: "t#1", prompt: "A rate moves from 2% to 2.6%. How many basis points?", choices: [], kind: "number", unit: "bp", decimals: 0 }],
};

const missed: MissedQuiz = {
  attemptId: 1,
  checkId: "c",
  checkNumber: 1,
  checkCount: 2,
  attemptNo: 0,
  result: {
    correctCount: 0,
    shown: 2,
    needed: 2,
    passed: false,
    questions: [
      {
        id: "t#1",
        prompt: "A rate moves from 2% to 2.6%. How many basis points?",
        kind: "number",
        chosen: null,
        given: "0.6",
        answer: "60 bp",
        expected: "60 bp",
        correct: false,
        explanation: "The right answer is 60 bp.",
        choices: [],
        verified: true,
        mistake: { tag: "stopped_at_points", fix: "That is the move in points. Times 100 gives basis points." },
      },
      {
        id: "qc",
        prompt: "What is a rate?",
        kind: "choice",
        chosen: "b",
        given: "b",
        answer: "a",
        expected: "A percent per year",
        correct: false,
        explanation: "A rate is per year.",
        choices: [
          { id: "a", text: "A percent per year" },
          { id: "b", text: "A flat fee" },
        ],
        verified: true,
        mistake: { tag: "flat_fee", fix: "A rate scales with the amount; a fee does not." },
      },
    ],
  },
};

describe("QuizPanel typed questions", () => {
  it("draws a labelled number box with the unit in words, and a Submit that waits for it", () => {
    const html = renderToStaticMarkup(<QuizPanel quiz={quiz} />);
    expect(html).toContain('data-testid="quiz"');
    expect(html).toContain("Answer in basis points");
    expect(html).toContain('inputMode="decimal"');
    expect(html).toContain('maxLength="40"');
    expect(html).not.toContain('type="radio"');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Submit answers/);
  });

  it("shows what was typed beside the right answer, then the fix line, and a wrong option's fix the same way", () => {
    const html = renderToStaticMarkup(<QuizPanel quiz={null} missed={missed} />);
    expect(html).toContain("Your answer: 0.6");
    expect(html).toContain("right answer: 60 bp");
    expect(html).toContain("That is the move in points. Times 100 gives basis points.");
    expect(html).toContain("Your answer: A flat fee");
    expect(html).toContain("A rate scales with the amount; a fee does not.");
    expect(html).toContain('data-testid="quiz-result"');
  });

  it("says the answers and fixes are below and the Tutor helps with the first idea missed, not everything", () => {
    const html = renderToStaticMarkup(<QuizPanel quiz={null} missed={missed} />);
    expect(html).toContain("The answers and fixes are below, and the Tutor will help with the first idea you missed.");
    expect(html).not.toContain("go over what you missed");
  });
});
