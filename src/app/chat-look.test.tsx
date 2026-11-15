import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CHECK_RESULT, STEP_DIVIDER } from "@/tutor/session-item-kinds";
import { Conversation } from "./conversation";
import { OldSession } from "./old-session";
import { SessionItemView } from "./session-item-view";
import type { Line } from "./thread";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

// The chat column's look: open 16/26 reading text, a quiet Save to Notebook that never leaves the page, a soft
// Learner bubble, one composer field, and status in the success colour with an icon. Behaviour is pinned elsewhere.

const css = readFileSync(join(__dirname, "globals.css"), "utf8");
const noReview = { question: null, dueCount: 0, done: 0, cap: 5 };
const first = { role: "assistant" as const, text: "Present value is **today's worth** of money paid later.", ref: { sessionId: 3, turnSeq: 0 } };
const second = { role: "assistant" as const, text: "Discounting is the reverse of compounding.", ref: { sessionId: 3, turnSeq: 1 } };
const lines: Line[] = [{ role: "user", text: "What is present value?" }, first, { role: "user", text: "And discounting?" }, second];

const conversation = (initial: Line[]) => renderToStaticMarkup(<Conversation initial={initial} quiz={null} pending={null} review={noReview} />);
const actions = (html: string) => [...html.matchAll(/<div([^>]*)data-reply-actions="([^"]*)"([^>]*)>/g)];

/** The body of the first rule in globals.css whose selector starts with `selector`, found by brace matching. */
function rule(selector: string, from = 0): string {
  const at = css.indexOf(selector, from);
  expect(at, `${selector} is in globals.css`).toBeGreaterThan(-1);
  const open = css.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error("unbalanced braces");
}

describe("Save to Notebook under the Tutor's replies", () => {
  it("is always shown under the newest saveable reply and revealed on hover or focus under older ones, in the workspace and in an old Session", () => {
    for (const html of [conversation(lines), renderToStaticMarkup(<OldSession lines={lines} />)]) {
      expect(actions(html).map((m) => m[2])).toEqual(["on-hover", "always"]);
      expect(html.match(/aria-label="Save this reply to Notebook"/g)).toHaveLength(2);
      // Hidden by opacity only (globals.css): never hidden, aria-hidden or taken out of the Tab order.
      for (const m of actions(html)) expect(m[1] + m[3]).not.toMatch(/\bhidden\b|aria-hidden|tabindex/);
    }
  });

  it("keeps the shown Save where it is while the next reply is still being written (no place in its Session yet)", () => {
    const html = conversation([...lines, { role: "user", text: "Show me." }, { role: "assistant", text: "Here is" }]);
    expect(actions(html).map((m) => m[2])).toEqual(["on-hover", "always"]);
  });

  it("fades an idle Save under an older reply by opacity, only where there is a hover, and never by display or visibility", () => {
    const media = css.indexOf("@media (hover: hover) {\n  .reply:not(:hover, :focus-within)");
    expect(media, "the on-hover rule sits inside @media (hover: hover)").toBeGreaterThan(-1);
    const body = rule("@media (hover: hover) {\n  .reply:not(:hover, :focus-within)");
    expect(body).toContain('[data-reply-actions="on-hover"]:has([data-save-state="idle"])');
    expect(body).toMatch(/opacity:\s*0/);
    expect(body).not.toMatch(/display:\s*none|visibility:\s*hidden|pointer-events/);
    expect(rule("[data-reply-actions] {")).toMatch(/transition:\s*opacity var\(--dur-ui\)/);
  });
});

describe("the messages", () => {
  const html = conversation(lines);

  it("draws a Tutor reply as plain 16/26 ink text in the centred reading block, under a small muted label", () => {
    const reply = html.match(/<div[^>]*data-testid="assistant-message"[^>]*>/)?.[0] ?? "";
    for (const cls of ["reply", "text-[length:var(--text-chat)]", "leading-[var(--lh-chat)]", "text-[var(--ink)]"]) expect(reply).toContain(cls);
    expect(reply).not.toMatch(/max-w-/);
    expect(reply).not.toMatch(/bg-|border/);
    const label = html.match(/<p[^>]*data-testid="tutor-label"[^>]*>/)?.[0] ?? "";
    expect(label).toContain("text-[var(--muted)]");
    expect(label).not.toMatch(/--brand|--accent/);
  });

  it("draws a Learner message as a soft grey bubble on the right, three quarters of the reading block at most, 12px corners, in the chat type", () => {
    const tag = html.match(/<div[^>]*class="[^"]*bg-\[var\(--bubble\)\][^"]*"[^>]*>/)?.[0] ?? "";
    const bubble = tag.match(/class="([^"]*)"/)?.[1] ?? "";
    expect(tag).toContain('data-testid="learner-message"');
    expect(bubble.split(" ")).not.toContain("max-w-[min(75%,34em)]");
    for (const cls of ["rounded-xl", "max-w-[75%]", "text-[length:var(--text-chat)]", "leading-[var(--lh-chat)]", "whitespace-pre-wrap"]) expect(bubble.split(" ")).toContain(cls);
    expect(bubble).not.toMatch(/rounded-(?:2xl|3xl|full)|shadow/);
  });

  it("leaves 24px between messages, in the workspace and on a read-only thread", () => {
    expect(html).toMatch(/<div class="flex flex-col gap-6">/);
    expect(renderToStaticMarkup(<OldSession lines={lines} />)).toContain("flex flex-col gap-6");
  });
});

// C1 (spec 2026-11-11): everything a Learner reads or types in the conversation shares one centred column.
describe("the reading block", () => {
  /** The element whose opening tag carries `data-testid="<id>"`, with everything inside it (nesting of its tag is matched). */
  function element(html: string, id: string): string {
    const at = html.search(new RegExp(`<(\\w+)[^>]*data-testid="${id}"`));
    expect(at, `${id} is on the page`).toBeGreaterThan(-1);
    const tag = html.slice(at).match(/^<(\w+)/)![1];
    const open = new RegExp(`<${tag}[\\s>]|</${tag}>`, "g");
    open.lastIndex = at;
    let depth = 0;
    for (let m = open.exec(html); m; m = open.exec(html)) {
      depth += m[0].startsWith("</") ? -1 : 1;
      if (depth === 0) return html.slice(at, open.lastIndex);
    }
    throw new Error(`${id} is not closed`);
  }
  const opening = (html: string, id: string) => html.match(new RegExp(`<\\w+[^>]*data-testid="${id}"[^>]*>`))?.[0] ?? "";
  const classOf = (tag: string) => (tag.match(/class="([^"]*)"/)?.[1] ?? "").split(" ");

  it("holds the conversation in one reading block, and the composer in a second with the same rule", () => {
    const html = conversation(lines);
    const block = element(html, "reading-block");
    expect(classOf(opening(html, "reading-block"))).toContain("reading-block");
    expect(block.match(/data-testid="assistant-message"/g)).toHaveLength(html.match(/data-testid="assistant-message"/g)!.length);
    expect(block.match(/data-testid="learner-message"/g)).toHaveLength(2);
    expect(block).toContain('data-testid="choices"');
    const composer = element(html, "composer-block");
    expect(classOf(opening(html, "composer-block"))).toContain("reading-block");
    expect(composer).toMatch(/<form[^>]*class="[^"]*\bfield-shell\b/);
    expect(classOf(opening(html, "choices"))).not.toContain("measure");
    expect(classOf(composer.match(/<form[^>]*>/)![0])).not.toContain("measure");
    expect(classOf(opening(html, "thread-viewport"))).toContain("[scrollbar-gutter:stable_both-edges]");
    expect(classOf(opening(html, "chat-column"))).toContain("@container/chat");
    const old = renderToStaticMarkup(<OldSession lines={lines} />);
    expect(element(old, "reading-block")).toContain('data-testid="assistant-message"');
  });

  it("is min(34em, 100cqw - 32px) wide and centred", () => {
    const body = rule("@utility reading-block {");
    expect(body).toContain("width: min(34em, 100cqw - 32px);");
    expect(body).toContain("margin-inline: auto;");
  });
});

describe("the reply's Markdown (.md)", () => {
  it("is 16/26 with ink headings and bold, accent underlined links, and hairline tables", () => {
    expect(rule(".md {")).toContain("line-height: var(--lh-chat);");
    const headings = rule(".md :is(h1, h2, h3, h4, strong)");
    expect(headings).toContain("color: var(--ink);");
    expect(headings).toContain("font-weight: 600;");
    const link = rule(".md a:not(:where(.genui *)) {");
    expect(link).toContain("color: var(--accent);");
    expect(link).toMatch(/text-decoration: underline/);
    expect(rule(".md :is(th, td)")).toContain("border-bottom: 1px solid var(--rule);");
    // No headings in the accent, no boxed cells: colour means "pressable" only.
    const block = css.slice(css.indexOf(".md {"), css.indexOf("[data-reply-actions] {"));
    expect(block).not.toMatch(/--brand\b|--you\b|--mint/);
    expect(block).not.toMatch(/\.md :is\(th, td\)[^{]*\{[^}]*\bborder:/);
  });

  it("leaves a Widget drawn inside a reply to its own look", () => {
    const block = css.slice(css.indexOf(".md {"), css.indexOf("[data-reply-actions] {"));
    const descendant = [...block.matchAll(/^\.md ([^{>]+)\{/gm)].map((m) => m[1].trim()).filter((s) => !s.startsWith("pre:has(.sources-fold)"));
    expect(descendant.length).toBeGreaterThan(10);
    for (const selector of descendant) expect(selector, selector).toContain(":not(:where(.genui *))");
  });
});

describe("the composer field (C7: the app's .field-shell, no composer CSS of its own)", () => {
  it("has 10px corners and, while the message box has focus, the accent edge with a 3px accent halo", () => {
    const html = conversation([first]);
    expect(html).toMatch(/<form[^>]*class="[^"]*\bfield-shell\b/);
    expect(html).toMatch(/<textarea[^>]*class="[^"]*\bfield-bare\b/);
    expect(rule("}\n  .field-shell {")).toContain("border-radius: 10px;");
    const focus = rule(".field:focus,");
    expect(css.slice(css.indexOf(".field:focus,"), css.indexOf("{", css.indexOf(".field:focus,")))).toContain(".field-shell:has(.field-bare:focus)");
    expect(focus).toContain("border-color: var(--accent);");
    expect(focus).toContain("box-shadow: 0 0 0 3px var(--accent-halo);");
    expect(css).not.toContain(".composer-field");
  });
});

describe("Session items in the chat", () => {
  it("draws a passed Check's card in the success colour with a check icon, never a Widget accent", () => {
    const html = renderToStaticMarkup(<SessionItemView item={{ kind: CHECK_RESULT, data: { check: 2, passed: true, label: "Check 2 — passed ✓" } }} />);
    // The shared ResultIcon (workspace-parts.tsx): the same tick the quiz, the review and a Quick try show.
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"[^>]*data-result="right"[^>]*class="[^"]*text-\[var\(--success\)\]/);
    expect(html).toContain('d="M13 4.5 6.5 11 3 7.5"');
    expect(html).toMatch(/<span class="text-\[var\(--success\)\]">Check 2 — passed ✓<\/span>/);
    expect(html).not.toMatch(/--you|--mint/);
  });

  it("draws a missed Check's card with an x icon in the danger colour, its words in ink", () => {
    const html = renderToStaticMarkup(<SessionItemView item={{ kind: CHECK_RESULT, data: { check: 2, passed: false, label: "Check 2 — not passed yet" } }} />);
    expect(html).toMatch(/<svg[^>]*data-result="wrong"[^>]*class="[^"]*text-\[var\(--danger\)\]/);
    expect(html).toContain('d="M12 4 4 12M4 4l8 8"');
    expect(html).toMatch(/<span>Check 2 — not passed yet<\/span>/);
  });

  it("draws a step divider as hairline rules either side of its label", () => {
    const html = renderToStaticMarkup(<SessionItemView item={{ kind: STEP_DIVIDER, data: { label: "Step 3 of 9 · Your turn", number: 3 } }} />);
    expect(html.match(/<span aria-hidden="true" class="h-px flex-1 bg-\[var\(--rule\)\]"><\/span>/g)).toHaveLength(2);
  });
});
