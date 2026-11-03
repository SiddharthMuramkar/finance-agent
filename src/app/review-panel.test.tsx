import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ReviewPanel } from "./review-panel";

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
});
