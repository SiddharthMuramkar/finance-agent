import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

const { default: NotFound } = await import("./not-found");

const render = async () => renderToStaticMarkup(await NotFound());

describe("Branded not-found page", () => {
  it("shows the site menu, a short message and both ways back", async () => {
    const html = await render();
    expect(html).toMatch(/<nav[^>]*aria-label="Pages"/);
    expect(html).toContain("Value It");
    expect(html).toMatch(/<h2[^>]*>[^<]+<\/h2>/);
    expect(html).toMatch(/<a[^>]*href="\/course"[^>]*>Course Map<\/a>/);
    expect(html).toMatch(/<a[^>]*href="\/study"[^>]*>Back to your Topic<\/a>/);
  });

  // Decision #17: one Light theme, so the header has no theme toggle.
  it("has no theme toggle", async () => {
    const html = await render();
    expect(html).not.toContain('data-testid="theme-toggle"');
    expect(html).not.toMatch(/Switch to (?:dark|light) theme/);
  });

  it("says Topic, never lesson or Continue", async () => {
    const html = await render();
    expect(html).not.toMatch(/lesson/i);
    expect(html).not.toMatch(/Continue/);
  });

  it("uses only the design tokens for colour", async () => {
    const html = await render();
    expect(html).not.toMatch(/#[0-9a-f]{3,6}\b|rgb\(|(?:text|bg|border)-(?:red|blue|gray|slate|zinc|neutral)-\d/i);
  });
});
