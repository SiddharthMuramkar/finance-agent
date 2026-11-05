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
  questions: [{ id: "t#1", prompt: "A rate moves from 2% to 2.6%. How many basis points?", choices: [{ id: "60", text: "60 bp" }, { id: "0.6", text: "0.6 bp" }] }],
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
        kind: "choice",
        chosen: "0.6",
        given: "0.6 bp",
        answer: "60",
        expected: "60 bp",
        correct: false,
        explanation: "The right answer is 60 bp.",
        choices: [{ id: "60", text: "60 bp" }, { id: "0.6", text: "0.6 bp" }],
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

describe("QuizPanel template questions", () => {
  it("draws the choices to tap and a Submit that waits for them: no number box, no typed-number test id", () => {
    const html = renderToStaticMarkup(<QuizPanel quiz={quiz} />);
    expect(html).toContain('data-testid="quiz"');
    expect(html).toContain("60 bp");
    expect(html).toContain("0.6 bp");
    expect(html).toContain('type="radio"');
    expect(html).not.toMatch(/inputMode|inputmode/i);
    expect(html).not.toContain("quiz-number");
    expect(html).not.toContain("<input type=\"text\"");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Submit answers/);
  });

  it("shows the picked choice beside the right answer, then the fix line, and a wrong option's fix the same way", () => {
    const html = renderToStaticMarkup(<QuizPanel quiz={null} missed={missed} />);
    expect(html).toContain("Your answer: 0.6 bp");
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
