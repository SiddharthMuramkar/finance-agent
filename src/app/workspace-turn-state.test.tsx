import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Conversation } from "./conversation";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

// What the Study Workspace shows for the latest turn's saved status, as the page found it (Seam 2).

const noReview = { question: null, dueCount: 0, done: 0, cap: 5 };
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

function workspace(pending: Parameters<typeof Conversation>[0]["pending"]) {
  return renderToStaticMarkup(
    <Conversation initial={[{ role: "user", text: "What is a basis point?" }]} summary="You are learning present value." quiz={null} pending={pending} review={noReview} />,
  );
}

describe("the latest turn's saved status in the workspace", () => {
  it("shows a failed turn's error and offers Retry", () => {
    const html = workspace({ status: "failed", error: "The Tutor could not answer (500)." });
    expect(html).toMatch(/data-testid="turn-error"[^>]*>The Tutor could not answer \(500\)\.</);
    expect(text(html)).toContain("Retry");
  });

  it("says a turn is in progress elsewhere while one is running, without Retry", () => {
    const html = workspace({ status: "running", error: null });
    expect(html).toMatch(/data-testid="turn-notice"[^>]*>A turn is in progress, perhaps on another device\.</);
    expect(text(html)).not.toContain("Retry");
    expect(html).not.toContain("turn-error");
  });

  it("shows no notice, error or Retry when the latest turn finished", () => {
    const html = workspace(null);
    expect(html).not.toContain("turn-notice");
    expect(html).not.toContain("turn-error");
    expect(text(html)).not.toContain("Retry");
  });

  it("keeps the Learner's messages and the message box in the left column, before the Widget panel", () => {
    const html = workspace(null);
    const pane = html.indexOf('data-testid="widget-pane"');
    expect(html.indexOf("What is a basis point?")).toBeLessThan(pane);
    expect(html.indexOf('placeholder="Ask the Tutor"')).toBeLessThan(pane);
    expect(html.indexOf("Attach a passage")).toBeLessThan(pane);
  });
});
