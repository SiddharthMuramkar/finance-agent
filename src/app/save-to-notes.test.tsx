import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Conversation } from "./conversation";
import { OldSession } from "./old-session";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const fence = (code: string) => ["```openui-lang", code, "```"].join("\n");
const WIDGET = 'root = Widget("What a home loan costs", [calc])\ncalc = Calculator("emi", {principal: 5000000, ratePercent: 8.5, years: 20})';
const EXPLORE = { code: 'root = Widget("Cash now or later", [calc])\ncalc = Calculator("emi", {principal: 5000000, ratePercent: 8.5, years: 20})' };
const reply = { role: "assistant" as const, text: `Here you go.\n\n${fence(WIDGET)}`, ref: { sessionId: 3, turnSeq: 0 } };
const noReview = { question: null, dueCount: 0, done: 0, cap: 5 };

describe("Save to notes in the lesson", () => {
  it("is offered under a finished reply and under its Widget, also in an old Session", () => {
    const html = renderToStaticMarkup(<OldSession lines={[{ role: "user", text: "Show me." }, reply]} />);
    expect(html).toContain('aria-label="Save this reply to notes"');
    expect(html).toContain('aria-label="Save this Widget to notes"');
  });

  it("is offered under the workspace's replies too", () => {
    const html = renderToStaticMarkup(<Conversation initial={[reply]} summary="s" quiz={null} pending={null} review={noReview} />);
    expect(html).toContain('aria-label="Save this reply to notes"');
  });

  it("is not offered on a reply with no place in a Session (a reply still arriving, or the landing page sample)", () => {
    const html = renderToStaticMarkup(<OldSession lines={[{ role: "assistant", text: `Hi.\n\n${fence(WIDGET)}` }]} />);
    expect(html).not.toContain("Save to notes");
  });

  it("is offered on the explore Widget wherever it stands", () => {
    const html = renderToStaticMarkup(<Conversation initial={[]} summary="s" quiz={null} pending={null} review={noReview} explore={EXPLORE} />);
    expect(html.match(/aria-label="Save this Widget to notes"/g)).toHaveLength(2);
  });
});
