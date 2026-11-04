import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Conversation } from "./conversation";
import { OldSession } from "./old-session";
import { NarrowScreen } from "./widget-panel";
import { SaveToNotesView } from "./save-to-notes";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const fence = (code: string) => ["```openui-lang", code, "```"].join("\n");
const WIDGET = 'root = Widget("What a home loan costs", [calc])\ncalc = Calculator("emi", {principal: 5000000, ratePercent: 8.5, years: 20})';
const EXPLORE = { id: "cash-now-or-later", code: 'root = Widget("Cash now or later", [calc])\ncalc = Calculator("emi", {principal: 5000000, ratePercent: 8.5, years: 20})' };
const reply = { role: "assistant" as const, text: `Here you go.\n\n${fence(WIDGET)}`, ref: { sessionId: 3, turnSeq: 0 } };
const noReview = { question: null, dueCount: 0, done: 0, cap: 5 };

describe("Save to notes in a Topic", () => {
  it("is offered under a finished reply and under its Widget, also in an old Session", () => {
    const html = renderToStaticMarkup(<OldSession lines={[{ role: "user", text: "Show me." }, reply]} />);
    expect(html).toContain('aria-label="Save this reply to notes"');
    expect(html).toContain('aria-label="Save this Widget to notes"');
  });

  it("is offered under the workspace's replies too", () => {
    const html = renderToStaticMarkup(<Conversation initial={[reply]} quiz={null} pending={null} review={noReview} />);
    expect(html).toContain('aria-label="Save this reply to notes"');
  });

  it("is not offered on a reply with no place in a Session (a reply still arriving, or the landing page sample)", () => {
    const html = renderToStaticMarkup(<OldSession lines={[{ role: "assistant", text: `Hi.\n\n${fence(WIDGET)}` }]} />);
    expect(html).not.toContain("Save to notes");
  });

  it("is offered on the explore Widget wherever it stands", () => {
    const page = <Conversation initial={[]} quiz={null} pending={null} review={noReview} explore={EXPLORE} />;
    // In the panel at a laptop width, in its card below it: the Widget is mounted once either way.
    expect(renderToStaticMarkup(page).match(/aria-label="Save this Widget to notes"/g)).toHaveLength(1);
    expect(renderToStaticMarkup(<NarrowScreen>{page}</NarrowScreen>).match(/aria-label="Save this Widget to notes"/g)).toHaveLength(1);
  });
});

describe("after Save to notes", () => {
  const noop = () => {};
  const saved = renderToStaticMarkup(<SaveToNotesView state={{ status: "saved", id: 4, topicId: "present-value" }} what="reply" onSave={noop} onUndo={noop} />);

  it('reads "Saved ✓ · Undo · Open notes", with Open notes going to that Topic\'s note', () => {
    const text = saved.replace(/<[^>]+>/g, "").replace("Saved to notes", "");
    expect(text).toMatch(/Saved ✓\s*·\s*Undo\s*·\s*Open notes/);
    expect(saved).toMatch(/<button[^>]*data-undo-save[^>]*>Undo<\/button>/);
    expect(saved).toContain('href="/notes#note-present-value"');
  });

  it("offers no second Save while it is saved, so the same reply is not saved twice", () => {
    expect(saved).not.toContain("Save to notes</button>");
  });

  it("is the plain Save to notes button before a save and after Undo", () => {
    const idle = renderToStaticMarkup(<SaveToNotesView state={{ status: "idle" }} what="Widget" onSave={noop} onUndo={noop} />);
    expect(idle).toMatch(/<button[^>]*aria-label="Save this Widget to notes"[^>]*>(<svg.*<\/svg>)?Save to notes<\/button>/);
    expect(idle).not.toContain("Undo");
  });
});

describe("a sources fence the model wrote itself", () => {
  it("shows only /passages/ and https: sources as links, anything else as plain text", async () => {
    const { SourcesFold } = await import("./reply-markdown");
    const { isSafeHref } = await import("@/tutor/citations");
    const entries = [
      { n: 1, title: "Real passage", href: "/passages/12", credit: null },
      { n: null, title: "Case data", href: "https://example.org/data", credit: null },
      { n: null, title: "Script link", href: "javascript:alert(1)", credit: null },
      { n: null, title: "Plain http", href: "http://evil.example", credit: null },
      { n: null, title: "Protocol-relative", href: "//evil.example", credit: null },
    ];
    const html = renderToStaticMarkup(<SourcesFold entries={entries} />);
    expect(html).toContain('href="/passages/12"');
    expect(html).toContain('href="https://example.org/data"');
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("evil.example");
    expect(html).toContain("Script link");
    expect(isSafeHref("/passages/12?blocks=0-1")).toBe(true);
    expect(isSafeHref("data:text/html,x")).toBe(false);
  });
});
