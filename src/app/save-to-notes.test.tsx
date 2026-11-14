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

describe("Save to Notebook in a Topic", () => {
  it("is offered under a finished reply and under its Widget, also in an old Session", () => {
    const html = renderToStaticMarkup(<OldSession lines={[{ role: "user", text: "Show me." }, reply]} />);
    expect(html).toContain('aria-label="Save this reply to Notebook"');
    expect(html).toContain('aria-label="Save this Widget to Notebook"');
  });

  it("is offered under the workspace's replies too", () => {
    const html = renderToStaticMarkup(<Conversation initial={[reply]} quiz={null} pending={null} review={noReview} />);
    expect(html).toContain('aria-label="Save this reply to Notebook"');
  });

  it("is not offered on a reply with no place in a Session (a reply still arriving, or the landing page sample)", () => {
    const html = renderToStaticMarkup(<OldSession lines={[{ role: "assistant", text: `Hi.\n\n${fence(WIDGET)}` }]} />);
    expect(html).not.toContain("Save to Notebook");
  });

  it("is offered on the explore Widget wherever it stands", () => {
    const page = <Conversation initial={[]} quiz={null} pending={null} review={noReview} explore={EXPLORE} />;
    // In the panel at a laptop width, in its card below it: the Widget is mounted once either way.
    expect(renderToStaticMarkup(page).match(/aria-label="Save this Widget to Notebook"/g)).toHaveLength(1);
    expect(renderToStaticMarkup(<NarrowScreen>{page}</NarrowScreen>).match(/aria-label="Save this Widget to Notebook"/g)).toHaveLength(1);
  });
});

describe("after Save to Notebook", () => {
  const noop = () => {};
  const saved = renderToStaticMarkup(<SaveToNotesView state={{ status: "saved", id: 4, topicId: "present-value" }} what="reply" onSave={noop} onUndo={noop} />);

  it('reads "Saved to Notebook ✓ · Undo · Open Notebook", with Open Notebook going to that Topic\'s Notebook row', () => {
    const text = saved.replace(/<[^>]+>/g, "").replace("Saved to notes", "");
    expect(text).toMatch(/Saved to Notebook ✓\s*·\s*Undo\s*·\s*Open Notebook/);
    expect(saved).toMatch(/<button[^>]*data-undo-save[^>]*>Undo<\/button>/);
    expect(saved).toContain('href="/notebook#note-present-value"');
  });

  it("offers no second Save while it is saved, so the same reply is not saved twice", () => {
    expect(saved).not.toContain("Save to Notebook</button>");
  });

  it("is the plain Save to Notebook button before a save and after Undo: a quiet tertiary with an outline bookmark", () => {
    const idle = renderToStaticMarkup(<SaveToNotesView state={{ status: "idle" }} what="Widget" onSave={noop} onUndo={noop} />);
    expect(idle).toMatch(/<button[^>]*aria-label="Save this Widget to Notebook"[^>]*>(<svg.*<\/svg>)?Save to Notebook<\/button>/);
    expect(idle).not.toContain("Undo");
    expect(idle).toMatch(/<button[^>]*data-affordance="button"[^>]*aria-label="Save this Widget to Notebook"/);
    // ADR 0013: a text button (no face, no edge, muted label), 28px, not an outlined secondary.
    expect(idle).toMatch(/class="[^"]*\bbtn\b[^"]*\bbtn-tertiary\b[^"]*\bbtn-xs\b/);
    expect(idle).not.toContain("btn-secondary");
    expect(idle).toMatch(/<svg[^>]*viewBox="0 0 24 24"[^>]*fill="none"/);
    expect(idle).not.toContain('fill="currentColor"');
  });

  it("settles to Save to Notebook with a filled bookmark, a small Saved badge (no pill), and Undo and Open Notebook as links", () => {
    const settled = renderToStaticMarkup(<SaveToNotesView state={{ status: "saved", id: 4, topicId: "pv", settled: true }} what="reply" onSave={noop} onUndo={noop} />);
    expect(settled).toContain('fill="currentColor"');
    const badge = settled.match(/<span[^>]*data-testid="saved-badge"[^>]*>/)?.[0] ?? "";
    expect(badge).toContain("rounded-md");
    expect(badge).toContain("text-[var(--success)]");
    expect(badge).not.toContain("rounded-full");
    expect(settled).toMatch(/data-testid="saved-badge"[^>]*><svg[^>]*aria-hidden="true"[^>]*>.*?<\/svg>Saved<\/span>/);
    expect(settled).toMatch(/<button[^>]*data-affordance="link"[^>]*data-undo-save[^>]*>Undo<\/button>/);
    expect(settled).toMatch(/<a(?=[^>]*data-affordance="link")(?=[^>]*href="\/notebook#note-pv")[^>]*>Open Notebook<\/a>/);
  });

  it("says Saved to Notebook ✓ in the success colour, with Undo and Open Notebook as links, never a second button", () => {
    expect(saved).toMatch(/<span[^>]*class="[^"]*text-\[var\(--success\)\][^"]*"[^>]*>Saved to Notebook ✓<\/span>/);
    expect(saved).toMatch(/<button[^>]*data-affordance="link"[^>]*data-undo-save[^>]*>Undo<\/button>/);
    expect(saved).not.toMatch(/btn-(?:secondary|primary)/);
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
