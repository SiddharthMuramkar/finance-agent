import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

/** What reading the sign-in does: no account by default, or Clerk's error when the proxy never ran (issue #33). */
let account: () => Promise<{ name: string } | undefined> = async () => undefined;
vi.mock("./account", () => ({ currentAccount: () => account() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/nope" }));

const { default: NotFound } = await import("./not-found");

const render = async () => renderToStaticMarkup(await NotFound());
const asMember = () => {
  account = async () => ({ name: "Asha" });
};

afterEach(() => {
  account = async () => undefined;
});

// Issue #70: a Visitor on an unknown address gets the public site's 'page not found', in the site's own look.
describe("The Visitor's 'page not found'", () => {
  it("is drawn in the public site's chrome, with the site nav, its footer and Sign in, never the app's header", async () => {
    const html = await render();
    expect(html).toMatch(/<header[^>]*class="[^"]*v-nav/);
    expect(html).toContain('<footer class="v-footer"');
    expect(html).toMatch(/<a[^>]*href="\/sign-in"[^>]*>Sign in<\/a>/);
    expect(html).not.toMatch(/<nav[^>]*aria-label="Pages"/);
    expect(html).not.toContain('data-testid="account-menu-button"');
  });

  it("says the page was not found, in one focusable page h1, with a way back Home", async () => {
    const html = await render();
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toMatch(/<h1 class="page-h1[^"]*" tabindex="-1"[^>]*>Page not found<\/h1>/);
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>Back to Home<\/a>/);
  });

  it("never points a Visitor at the signed-in pages", async () => {
    const html = await render();
    expect(html).not.toMatch(/href="\/(study|course)"/);
    expect(html).not.toMatch(/Back to your Topic/);
  });

  it("is the Visitor's page when reading the sign-in throws (a 404 the proxy's matcher skipped, issue #33)", async () => {
    account = async () => {
      throw new Error("auth() was called but Clerk can't detect usage of clerkMiddleware()");
    };
    const html = await render();
    expect(html).toMatch(/>Page not found<\/h1>/);
    expect(html).not.toContain('data-testid="account-menu-button"');
  });
});

describe("The Member's not-found page", () => {
  it("shows the app's menu, the account menu, a short message and both ways back", async () => {
    asMember();
    const html = await render();
    expect(html).toMatch(/<nav[^>]*aria-label="Pages"/);
    expect(html).toContain("Value It");
    expect(html).toContain('data-testid="account-menu-button"');
    expect(html).toMatch(/<h2[^>]*>This page isn&#x27;t here<\/h2>/);
    expect(html).toMatch(/<a[^>]*href="\/course"[^>]*>Course Map<\/a>/);
    expect(html).toMatch(/<a[^>]*href="\/study"[^>]*>Back to your Topic<\/a>/);
    expect(html).not.toMatch(/<header[^>]*class="[^"]*v-nav/);
  });

  // Decision #17: one Light theme, so the header has no theme toggle.
  it("has no theme toggle", async () => {
    asMember();
    const html = await render();
    expect(html).not.toContain('data-testid="theme-toggle"');
    expect(html).not.toMatch(/Switch to (?:dark|light) theme/);
  });

  it("says Topic, never lesson or Continue", async () => {
    asMember();
    const html = await render();
    expect(html).not.toMatch(/lesson/i);
    expect(html).not.toMatch(/Continue/);
  });
});

describe("Both versions", () => {
  it("use only the design tokens for colour", async () => {
    const visitor = await render();
    asMember();
    for (const html of [visitor, await render()]) {
      expect(html).not.toMatch(/#[0-9a-f]{3,6}\b|rgb\(|(?:text|bg|border)-(?:red|blue|gray|slate|zinc|neutral)-\d/i);
    }
  });
});
