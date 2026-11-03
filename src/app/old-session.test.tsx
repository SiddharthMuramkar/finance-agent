import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { summariseRows } from "@/tutor/session-summary";
import { OldSession } from "./old-session";
import { SessionCard } from "./session-card";

const reply = [
  "## Why discount?",
  "",
  "A rupee today is **worth more** than a rupee next year:",
  "",
  "- you can invest it",
  "- prices rise",
  "",
  "```openui-lang",
  'root = Widget("PV", [])',
  "```",
  "",
  "Try the slider.",
].join("\n");

describe("an old Session page", () => {
  it("shows the Tutor's prose as formatted Markdown, not raw symbols", () => {
    const html = renderToStaticMarkup(<OldSession lines={[{ role: "user", text: "Why **discount**?" }, { role: "assistant", text: reply }]} />);
    expect(html).toMatch(/<h2[^>]*>Why discount\?<\/h2>/);
    expect(html).toMatch(/<strong[^>]*>worth more<\/strong>/);
    expect(html.match(/<li[^>]*>/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).not.toContain("**worth more**");
    expect(html).not.toContain("## Why");
  });

  it("puts a Widget chip where the Tutor put the Widget, the Widget itself in the panel, and never shows its code", () => {
    const html = renderToStaticMarkup(<OldSession lines={[{ role: "assistant", text: reply }]} />);
    const chip = html.indexOf("Widget 1 →");
    expect(chip).toBeGreaterThan(html.indexOf("prices rise"));
    expect(chip).toBeLessThan(html.indexOf("Try the slider."));
    expect(html).toContain('data-testid="widget-card"');
    expect(html).not.toContain("```");
    expect(html).not.toContain("openui-lang");
  });

  it("shows a Markdown table as a table", () => {
    const text = "Rates:\n\n| Year | Open |\n|---|---|\n| 1 | 50 |\n\nDone.";
    const html = renderToStaticMarkup(<OldSession lines={[{ role: "assistant", text }]} />);
    expect(html).toMatch(/<table/);
    expect(html).not.toContain("|---|");
  });

  it("shows each citation as a small numbered link to its passage and lists the reply's sources as links", () => {
    const text = "Present value discounts each payment[1](/passages/4?blocks=1-2).\n\nSources:\n\n1. [Present value](/passages/4)\n";
    const html = renderToStaticMarkup(<OldSession lines={[{ role: "assistant", text }]} />);
    expect(html).toMatch(/<sup[^>]*><a[^>]*href="\/passages\/4\?blocks=1-2"[^>]*>1<\/a><\/sup>/);
    expect(html).toMatch(/<a[^>]*href="\/passages\/4"[^>]*>Present value<\/a>/);
    expect(html).not.toContain("](/passages");
  });
});

describe("the read-only layout", () => {
  const html = renderToStaticMarkup(<OldSession lines={[{ role: "user", text: "Hi" }, { role: "assistant", text: reply }]} />);

  it("has the conversation and the Widget panel side by side, and a way back to the workspace", () => {
    expect(html).toContain('aria-label="Widget panel"');
    expect(html).toMatch(/<a[^>]*href="\/study"[^>]*>Back to the workspace<\/a>/);
  });

  it("has no composer, no Resume and nothing to send", () => {
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("Ask the Tutor");
    expect(html).not.toContain("Resume");
    expect(html).not.toContain(">Send<");
  });
});

describe("a Past Sessions card", () => {
  const card = renderToStaticMarkup(<SessionCard id={7} number={3} createdAt={new Date("2026-10-24T08:00:00Z")} topics={["Present value", "Annuities"]} widgets={2} />);

  it("shows the eyebrow, a title from the first Topic and date, a pill per Topic and the Widget count, and opens its Session", () => {
    expect(card).toContain("Session 3 · 24 OCT 2026");
    expect(card).toContain("Present value, 24 Oct 2026");
    expect(card).toContain("Annuities");
    expect(card).toContain("2 Widgets");
    expect(card).toContain('href="/sessions/7"');
  });

  it("falls back to the Session number when no Topic can be found", () => {
    const plain = renderToStaticMarkup(<SessionCard id={1} number={1} createdAt={new Date("2026-10-24T08:00:00Z")} topics={[]} widgets={1} />);
    expect(plain).toContain("Session 1, 24 Oct 2026");
    expect(plain).toContain("1 Widget<");
  });
});

describe("a Past Sessions card date", () => {
  it("always writes a three-letter month, including September", () => {
    const card = renderToStaticMarkup(<SessionCard id={2} number={3} createdAt={new Date("2026-09-05T08:00:00Z")} topics={[]} widgets={0} />);
    expect(card).toContain("Session 3 · 5 SEP 2026");
    expect(card).not.toContain("SEPT");
  });
});

describe("the old Session page on an iPad", () => {
  it("keeps the conversation and the Widget panel side by side from the narrowest width", () => {
    const html = renderToStaticMarkup(<OldSession lines={[{ role: "assistant", text: "Hi" }]} />);
    const grid = html.match(/<div[^>]*data-testid="old-session"[^>]*>/)![0];
    expect(grid).toMatch(/\bgrid-cols-2\b/);
    expect(grid).not.toMatch(/\bgrid-cols-1\b/);
  });
});

describe("working out a Session's Topics and Widgets from its messages", () => {
  it("reads Topic lines in order, once each, and counts Widgets net of corrections", () => {
    const ctx = (t: string) => `Course Navigator: where.\nTopic: ${t} (Foundations Stage).\nTeaching Step: concept.`;
    const fenced = '```openui-lang\nroot = Widget("x", [])\n```';
    const out = summariseRows([
      { role: "user", content: [{ type: "text", text: `Where the Learner stands:\n${ctx("Present value")}` }] },
      { role: "assistant", content: [{ type: "text", text: fenced }] },
      { role: "user", content: "Widget check by code: broken" },
      { role: "assistant", content: [{ type: "text", text: fenced }] },
      { role: "system", content: ctx("Annuities") },
      { role: "system", content: ctx("Present value") },
      { role: "assistant", content: [{ type: "text", text: fenced }] },
    ]);
    expect(out).toEqual({ topics: ["Present value", "Annuities"], widgets: 2 });
  });
});
