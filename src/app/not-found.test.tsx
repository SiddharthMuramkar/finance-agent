import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ThemeId } from "./theme";

let theme: ThemeId = "light";
vi.mock("./theme-cookie", () => ({ readTheme: async () => ({ mode: "single", theme }) }));

const { default: NotFound } = await import("./not-found");

const render = async () => renderToStaticMarkup(await NotFound());

describe("Branded not-found page", () => {
  it("shows the site menu, a short message and both ways back", async () => {
    const html = await render();
    expect(html).toMatch(/<nav[^>]*aria-label="Pages"/);
    expect(html).toContain("Finance Agent");
    expect(html).toMatch(/<h2[^>]*>[^<]+<\/h2>/);
    expect(html).toMatch(/<a[^>]*href="\/course"[^>]*>Course Map<\/a>/);
    expect(html).toMatch(/<a[^>]*href="\/study"[^>]*>Back to your Topic<\/a>/);
  });

  it("keeps the remembered theme in its menu", async () => {
    theme = "midnight";
    expect(await render()).toContain('aria-label="Theme: Midnight"');
    theme = "light";
    expect(await render()).toContain('aria-label="Theme: Light"');
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
