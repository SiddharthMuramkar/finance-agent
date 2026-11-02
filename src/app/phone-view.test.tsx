import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { QuizPanel } from "./quiz-panel";
import { ReviewPanel } from "./review-panel";
import { ThemeToggle } from "./theme-toggle";
import { readFileSync } from "node:fs";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

// Phone view (#29): the real 390px check is the Playwright run in evidence/29; these keep the
// class-level rules from being lost: answers are big enough to tap, and wide content scrolls inside itself.
const choices = [{ id: "a", text: "A" }, { id: "b", text: "B" }];

describe("phone view", () => {
  it("gives every quiz and review answer a tap-sized row", () => {
    const quiz = renderToStaticMarkup(<QuizPanel quiz={{ attemptId: 1, checkId: "c", attemptNo: 0, questions: [{ id: "q", prompt: "P", choices }] }} />);
    const review = renderToStaticMarkup(<ReviewPanel review={{ question: { id: "q", prompt: "P", choices }, dueCount: 1, done: 0, cap: 5 }} />);
    for (const html of [quiz, review]) {
      const labels = html.match(/<label[^>]*>/g) ?? [];
      expect(labels).toHaveLength(2);
      for (const l of labels) expect(l).toMatch(/min-h-11/);
    }
  });

  it("makes the dark-mode switch tap-sized", () => {
    expect(renderToStaticMarkup(<ThemeToggle initial="light" />)).toMatch(/min-h-11|py-2/);
  });

  it("scrolls a wide table or long address inside its own box instead of the page", () => {
    const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.md table \{[^}]*overflow-x-auto/);
    expect(css).toMatch(/\.md \{[^}]*break-words/);
  });
});
