import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ThemeId } from "./theme";

let theme: ThemeId = "light";
vi.mock("./theme-cookie", () => ({ readTheme: async () => theme }));
/** What reading the sign-in does: no account by default, or Clerk's error when the proxy never ran (issue #33). */
let account: () => Promise<{ name: string } | undefined> = async () => undefined;
vi.mock("./account", () => ({ currentAccount: () => account() }));

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

  it("keeps the remembered theme in its toggle", async () => {
    theme = "dark";
    expect(await render()).toContain('aria-label="Switch to light theme"');
    theme = "light";
    expect(await render()).toContain('aria-label="Switch to dark theme"');
  });

  it("says Topic, never lesson or Continue", async () => {
    const html = await render();
    expect(html).not.toMatch(/lesson/i);
    expect(html).not.toMatch(/Continue/);
  });

  it("still draws, with no account menu, when reading the sign-in throws (a 404 the proxy's matcher skipped, issue #33)", async () => {
    account = async () => {
      throw new Error("auth() was called but Clerk can't detect usage of clerkMiddleware()");
    };
    const html = await render();
    expect(html).toMatch(/<h2[^>]*>This page isn&#x27;t here<\/h2>/);
    expect(html).not.toContain('data-testid="account-menu-button"');
    account = async () => ({ name: "Asha" });
    expect(await render()).toContain('data-testid="account-menu-button"');
    account = async () => undefined;
  });

  it("uses only the design tokens for colour", async () => {
    const html = await render();
    expect(html).not.toMatch(/#[0-9a-f]{3,6}\b|rgb\(|(?:text|bg|border)-(?:red|blue|gray|slate|zinc|neutral)-\d/i);
  });
});
