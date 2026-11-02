import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OldSession } from "./old-session";

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

  it("keeps the widget in the place the Tutor put it, between the prose before and after, and never shows its code", () => {
    const html = renderToStaticMarkup(<OldSession lines={[{ role: "assistant", text: reply }]} />);
    const widget = html.indexOf('data-testid="inline-widget"');
    expect(widget).toBeGreaterThan(html.indexOf("prices rise"));
    expect(widget).toBeLessThan(html.indexOf("Try the slider."));
    expect(html).not.toContain("```");
    expect(html).not.toContain("openui-lang");
  });
});
