import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ReviewPanel, ReviewResultView } from "./review-panel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const review = {
  question: { id: "q", prompt: "How many basis points?", choices: [{ id: "a", text: "Twenty-five" }, { id: "b", text: "Zero point two five" }] },
  dueCount: 3,
  done: 2,
  cap: 10,
};

describe("review panel", () => {
  it("states the cap as a day's Reviews, not a Session's", () => {
    const html = renderToStaticMarkup(<ReviewPanel review={review} />);
    expect(html).toContain("Up to 10 a day; 2 done so far.");
    expect(html).not.toMatch(/Session/);
  });

  it("stacks the choices as chips in a column, one per row", () => {
    const html = renderToStaticMarkup(<ReviewPanel review={review} />);
    expect(html).toMatch(/<label[^>]*data-affordance="chip"[^>]*class="[^"]*\bchip\b[^"]*"/);
    expect(html).toMatch(/<div class="flex flex-col gap-2"><label/);
    expect(html).not.toMatch(/<label[^>]*\bmb-2\b/);
  });
});

describe("a marked review", () => {
  const result = {
    ok: true as const,
    correct: false,
    answer: "a",
    chosen: "b",
    choices: review.question.choices,
    explanation: "A quarter of a point is 25 basis points.",
    nextDue: new Date(0),
    verified: true,
  };

  it("shows the picked wrong choice's mix-up fix", () => {
    const html = renderToStaticMarkup(<ReviewResultView review={review} onNext={() => {}} result={{ ...result, mistake: { tag: "stopped_at_points", fix: "That is the move in points. Times 100 gives basis points." } }} />);
    expect(html).toContain('data-testid="review-fix"');
    expect(html).toContain("That is the move in points. Times 100 gives basis points.");
    expect(html).toContain("You chose: Zero point two five");
  });

  it("shows no fix line when the pick names no mix-up, or was right", () => {
    expect(renderToStaticMarkup(<ReviewResultView review={review} onNext={() => {}} result={result} />)).not.toContain("review-fix");
    expect(renderToStaticMarkup(<ReviewResultView review={review} onNext={() => {}} result={{ ...result, correct: true, chosen: "a" }} />)).toContain("Correct.");
  });
});
