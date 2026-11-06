// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenQuiz } from "@/learner/quiz";
import type { ReviewState } from "@/learner/review";
import { Conversation } from "./conversation";

// Appendix B.7: primary is used once per view, for the one thing to do next (#478). The real /study view, drawn whole:
// at the Story step with a StoryScene Widget in the panel and the Next chip under the reply, and again once the
// Learner has typed in the message box; with a Check marked in the panel; and with a Spaced review picked and marked
// in the Topic header. At every moment at most one enabled primary button shows.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noReview = { question: null, dueCount: 0, done: 0, cap: 5 };
const NEXT = { kind: "next", step: "concept", label: "Next: Concept", advances: true } as const;
const SCENE = [
  "```openui-lang",
  'root = Widget("Meena\'s month", [scene])',
  'scene = StoryScene([{id: "meena", emoji: "cook", name: "Meena", role: "chai stall owner"}], [{who: "narrator", says: "Meena runs a chai stall.", emoji: "hot-beverage"}, {who: "meena", says: "So the month ended in a loss.", emoji: "worried-face"}], "A month at the stall")',
  "```",
].join("\n");

let root: Root;
let host: HTMLElement;

const QUIZ: OpenQuiz = {
  attemptId: 1,
  checkId: "c",
  checkNumber: 1,
  checkCount: 2,
  attemptNo: 0,
  questions: [{ id: "q1", prompt: "What is revenue?", choices: [{ id: "a", text: "Money from sales" }, { id: "b", text: "Money left over" }] }],
};
const PASSED = {
  correctCount: 1,
  shown: 1,
  needed: 1,
  passed: true,
  attemptNo: 0,
  questions: [{ id: "q1", prompt: "What is revenue?", kind: "choice", chosen: "a", answer: "a", correct: true, explanation: "Revenue is money from sales.", choices: QUIZ.questions[0].choices, verified: true }],
};
const DUE: ReviewState = {
  question: { id: "r1", prompt: "What is profit?", choices: [{ id: "a", text: "Revenue minus costs" }, { id: "b", text: "All the cash in" }] },
  dueCount: 2,
  done: 0,
  cap: 5,
};
const MARKED = { ok: true, correct: true, answer: "a", explanation: "Profit is what is left.", choices: DUE.question!.choices, chosen: "a", nextDue: new Date().toISOString(), verified: true };

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const body = url === "/api/quiz" ? PASSED : url === "/api/review" ? MARKED : {};
      return { ok: true, status: 200, json: async () => body };
    }),
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const pause = () => act(async () => void (await new Promise((r) => setTimeout(r, 30))));

/** The labels of the enabled raised primaries on screen. */
const enabledPrimaries = () =>
  [...host.querySelectorAll<HTMLButtonElement>("button.btn-primary")].filter((b) => !b.disabled).map((b) => b.textContent?.trim());

type View = { quiz?: OpenQuiz | null; review?: ReviewState; scene?: boolean; next?: typeof NEXT | null };

/** Draws (or redraws, keeping state, as a router refresh does) the /study conversation. */
async function openStoryStep({ quiz = null, review = noReview, scene = true, next = NEXT }: View = {}) {
  await act(async () => {
    root.render(
      <Conversation
        initial={[{ role: "assistant", text: scene ? `Meena runs a chai stall.\n\n${SCENE}\n\nWhat do you think happened that month?` : "Meena runs a chai stall. What do you think happened that month?" }]}
        quiz={quiz}
        pending={null}
        review={review}
        next={next}
        place={{ stage: "foundation", title: "Income statement" }}
      />,
    );
  });
  await pause();
}

const click = (el: HTMLElement) => act(async () => el.click());
const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === label)!;
const nextChipIsSecondary = () => host.querySelector('[data-testid="next-chip"]')!.classList.contains("btn-secondary");

async function type(words: string) {
  const box = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Message']")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(box, words);
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await pause();
}

describe("one primary on /study (Appendix B.7, #478)", () => {
  it("at the Story step with a StoryScene Widget, the Next chip is the one enabled primary", async () => {
    await openStoryStep();
    expect(host.querySelector('[data-testid="story-scene"]'), "the StoryScene Widget is drawn").not.toBeNull();
    expect(host.querySelector('[data-testid="story-next"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="next-chip"]')).not.toBeNull();
    expect(enabledPrimaries()).toEqual(["Next: Concept →"]);
  });

  it("on the StoryScene's last beat, Replay is not a second primary", async () => {
    await openStoryStep();
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="story-next"]')!.click());
    expect(host.querySelector('[data-testid="story-replay"]')).not.toBeNull();
    expect(enabledPrimaries()).toEqual(["Next: Concept →"]);
  });

  it("once the Learner types, Send is the one enabled primary and the Next chip steps back to secondary", async () => {
    await openStoryStep();
    await type("Was it a loss?");
    expect(enabledPrimaries()).toEqual(["Send"]);
    const next = host.querySelector<HTMLButtonElement>('[data-testid="next-chip"]')!;
    expect(next.classList.contains("btn-secondary")).toBe(true);

    // Emptied again: the Next chip is the main move once more.
    await type("");
    expect(enabledPrimaries()).toEqual(["Next: Concept →"]);
  });

  it("with a Check open (no Next offered while it is open), Submit is the one primary; once passed and Next arrives, the Next chip is (Done steps back)", async () => {
    // While a Check is open, or after a miss, the Course Navigator offers no Next (nextOfferNow is null; check-results.test.ts),
    // so the Check's own buttons need no primary claim.
    await openStoryStep({ quiz: QUIZ, scene: false, next: null });
    expect(host.querySelector('[data-testid="next-chip"]')).toBeNull();
    await click(host.querySelector<HTMLInputElement>('[data-testid="quiz"] input[type="radio"]')!);
    expect(enabledPrimaries()).toEqual(["Submit answers"]);

    await click(button("Submit answers"));
    await pause();
    expect(button("Done"), "the passed Check's Done shows").toBeDefined();
    expect(enabledPrimaries()).toEqual([]);

    // The pass refreshes the page: the Check closes and the Navigator now offers Next, while the marked result is held.
    await openStoryStep({ quiz: null, scene: false, next: NEXT });
    expect(button("Done"), "the marked result is still held after the refresh").toBeDefined();
    expect(host.querySelector('[data-testid="next-chip"]')).not.toBeNull();
    expect(enabledPrimaries()).toEqual(["Next: Concept →"]);
  });

  it("with a Spaced review picked, Submit answer is the one enabled primary; once it is marked, Next review is", async () => {
    await openStoryStep({ review: DUE, scene: false });
    expect(enabledPrimaries()).toEqual(["Next: Concept →"]);

    await click(host.querySelector<HTMLInputElement>('[data-testid="review"] input[type="radio"]')!);
    expect(enabledPrimaries()).toEqual(["Submit answer"]);
    expect(nextChipIsSecondary()).toBe(true);

    await click(button("Submit answer"));
    await pause();
    expect(host.querySelector('[data-testid="review-result"]')).not.toBeNull();
    expect(enabledPrimaries()).toEqual(["Next review"]);
    expect(nextChipIsSecondary()).toBe(true);
  });
});
