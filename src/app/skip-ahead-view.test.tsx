// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TopicStartData } from "@/course/topic-start";
import { QuickTryContext, type QuickTryHost } from "./quick-try-view";
import { TopicStartCard } from "./topic-start-card";

// Skip ahead on the Topic Start card (spec 2026-11-12 A8): the Choice "I know this: quiz me" opens one mixed quiz in the
// card; with at most one miss the card says the Topic is passed and offers What comes next; otherwise the Topic carries
// on from its story. One try a day.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const host: QuickTryHost = { locked: false, answered: new Map(), answer: async () => null };
const card = (skipAhead?: TopicStartData["skipAhead"]): TopicStartData => ({
  topicId: "present-value",
  title: "Present value",
  where: "Numbers & time value",
  youllLearn: ["See why money later is worth less."],
  before: [],
  uses: [],
  checks: 2,
  ...(skipAhead ? { skipAhead } : {}),
});
const draw = (data: TopicStartData, value: QuickTryHost | null = host) =>
  renderToStaticMarkup(
    <QuickTryContext.Provider value={value}>
      <TopicStartCard card={data} />
    </QuickTryContext.Provider>,
  );

describe("the Topic Start card's skip ahead", () => {
  it("offers the Choice I know this: quiz me on a Topic that offers it", () => {
    const html = draw(card("offer"));
    expect(html).toContain(">I know this: quiz me<");
    expect(html).toContain("Miss no more than one and the whole Topic is passed.");
  });

  it("says when it can be tried again once today's quiz is used, and offers nothing on a Topic without it or read-only", () => {
    expect(draw(card("tried_today")).replaceAll("&#x27;", "'")).toContain("You have had today's quiz for this Topic. You can try it again tomorrow.");
    expect(draw(card("tried_today"))).not.toContain("quiz me");
    expect(draw(card())).not.toContain("quiz me");
    expect(draw(card("offer"), null)).not.toContain("quiz me");
  });
});

const QUIZ = {
  attemptId: 7,
  topicId: "present-value",
  needed: 3,
  questions: [1, 2, 3, 4].map((n) => ({ id: `q${n}`, prompt: `Question ${n}?`, choices: [{ id: "a", text: `Right ${n}` }, { id: "b", text: `Wrong ${n}` }] })),
};
const marked = (misses: number) => {
  const questions = QUIZ.questions.map((q, i) => ({ id: q.id, prompt: q.prompt, chosen: i < misses ? "b" : "a", answer: "a", correct: i >= misses, explanation: "E", choices: q.choices, verified: true, ...(i < misses ? { mistake: { fix: `Fix ${q.id}.` } } : {}) }));
  const correctCount = 4 - misses;
  return { ok: true, topicId: "present-value", correctCount, shown: 4, needed: 3, passed: correctCount >= 3, next: correctCount >= 3 ? "Next Topic: The income statement" : null, questions };
};

let root: Root;
let el: HTMLElement;
beforeEach(() => {
  el = document.createElement("div");
  document.body.append(el);
  root = createRoot(el);
});
afterEach(() => {
  act(() => root.unmount());
  el.remove();
  vi.unstubAllGlobals();
});

async function takeQuiz(misses: number) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify("topicId" in body ? { ok: true, quiz: QUIZ } : marked(misses)), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  await act(async () =>
    root.render(
      <QuickTryContext.Provider value={host}>
        <TopicStartCard card={card("offer")} />
      </QuickTryContext.Provider>,
    ),
  );
  await act(async () => el.querySelector<HTMLButtonElement>('[data-testid="skip-ahead-open"]')!.click());
  expect(el.textContent).toContain("4 questions, one on each idea. Get 3 right and the whole Topic is passed.");
  const submit = el.querySelector<HTMLButtonElement>('[data-testid="skip-ahead-submit"]')!;
  expect(submit.disabled).toBe(true);
  for (const i of QUIZ.questions.keys()) {
    const words = i < misses ? `Wrong ${i + 1}` : `Right ${i + 1}`;
    const option = [...el.querySelectorAll<HTMLLabelElement>("label")].find((l) => l.textContent === words)!;
    await act(async () => option.querySelector("input")!.click());
  }
  await act(async () => el.querySelector<HTMLButtonElement>('[data-testid="skip-ahead-submit"]')!.click());
  expect(fetchMock).toHaveBeenCalledWith("/api/skip-ahead", expect.objectContaining({ body: JSON.stringify({ topicId: "present-value" }) }));
  return fetchMock;
}

describe("taking the quiz", () => {
  it("with one miss, says the Topic is passed and offers What comes next and the Course Map", async () => {
    const fetchMock = await takeQuiz(1);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/skip-ahead", expect.objectContaining({ body: JSON.stringify({ attemptId: 7, answers: { q1: "b", q2: "a", q3: "a", q4: "a" } }) }));
    const result = el.querySelector('[data-testid="skip-ahead-result"]')!;
    expect(result.getAttribute("data-passed")).toBe("true");
    expect(result.textContent).toContain("3 of 4 right. Topic passed.");
    expect(result.textContent).toContain("these questions come back later as Reviews");
    expect(result.textContent).toContain("Next Topic: The income statement →");
    expect(result.textContent).toContain("Course Map");
  });

  it("with two misses, shows the answers and fixes, says the Topic carries on from its story, and then that today's try is used", async () => {
    await takeQuiz(2);
    const result = el.querySelector('[data-testid="skip-ahead-result"]')!;
    expect(result.getAttribute("data-passed")).toBe("false");
    expect(result.textContent).toContain("2 of 4 right.");
    expect(result.textContent).toContain("the Topic carries on from its story");
    expect(result.textContent).toContain("Your pick: Wrong 1. Right answer: Right 1");
    expect(result.textContent).toContain("Fix q1.");
    const close = [...el.querySelectorAll("button")].find((b) => b.textContent === "Close")!;
    await act(async () => close.click());
    expect(el.textContent).toContain("You have had today's quiz for this Topic.");
    expect(el.querySelector('[data-testid="skip-ahead-open"]')).toBeNull();
  });
});
