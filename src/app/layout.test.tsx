import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The root layout draws ClerkProvider only while Clerk runs (clerkOn, issue #33): in the test bed, in CI and on a deploy
// without Clerk keys nothing on the page loads or calls Clerk. Inside it, ClerkOn tells the sign-out button to end
// Clerk's session too.

vi.mock("next/font/google", () => ({ Inter: () => ({ variable: "font-text" }), Inter_Tight: () => ({ variable: "font-display" }) }));
vi.mock("@clerk/nextjs", () => ({
  ClerkProvider: ({ children, ...props }: { children: ReactNode }) => (
    <div data-clerk="provider" data-props={JSON.stringify(props)}>
      {children}
    </div>
  ),
}));
vi.mock("./sign-out", () => ({ ClerkOn: ({ children }: { children: ReactNode }) => <div data-clerk-on="">{children}</div> }));
vi.mock("./route-bar", () => ({ RouteBar: () => null }));
vi.mock("./site-analytics", () => ({ SiteAnalytics: () => null }));

const { default: RootLayout } = await import("./layout");
const { clerkAppearance } = await import("@/auth/clerk-appearance");
const { THEME_INIT_SCRIPT } = await import("./theme");
const render = () => renderToStaticMarkup(<RootLayout>{<p id="page">The page</p>}</RootLayout>);

beforeEach(() => {
  vi.stubEnv("E2E", "");
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_x");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_x");
});
afterEach(() => vi.unstubAllEnvs());

describe("the root layout", () => {
  it("with Clerk on, wraps the page in ClerkProvider (inside <body>) and ClerkOn, naming the sign-in pages", () => {
    const html = render();
    const provider = html.match(/<div data-clerk="provider" data-props="([^"]*)"><div data-clerk-on="">[\s\S]*<p id="page">/);
    expect(provider).not.toBeNull();
    expect(html.indexOf("<body")).toBeLessThan(html.indexOf('data-clerk="provider"'));
    const props = JSON.parse(provider![1].replaceAll("&quot;", '"')) as Record<string, unknown>;
    expect(props).toMatchObject({ signInUrl: "/sign-in", signUpUrl: "/sign-up", waitlistUrl: "/join" });
    // Its cards wear the site's look (issue #76; src/auth/clerk-appearance.test.ts pins it).
    expect(props.appearance).toEqual(JSON.parse(JSON.stringify(clerkAppearance)));
  });

  // ADR 0019: the theme is set before the first paint by a script at the top of <head>, before <body> draws anything.
  it("runs the theme script in <head>, and gives Clerk's card the page's colour tokens", () => {
    const html = render();
    const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
    expect(head).toContain(`<script>${THEME_INIT_SCRIPT}</script>`);
    expect(html.indexOf("</head>")).toBeLessThan(html.indexOf("<body"));
    const props = JSON.parse(html.match(/data-props="([^"]*)"/)![1].replaceAll("&quot;", '"')) as { appearance: { variables: Record<string, string> } };
    // Every colour is a token (clerkAppearance, #76): the radius is a length, and the shadow is none (ADR 0018).
    const colours = Object.entries(props.appearance.variables).filter(([name]) => name !== "borderRadius" && name !== "colorShadow");
    expect(props.appearance.variables.colorShadow).toBe("transparent");
    expect(colours.every(([, v]) => /^var\(--[\w-]+\)$/.test(v))).toBe(true);
    // --accent and --raised point at --blue and --paper (globals.css).
    expect(props.appearance.variables).toMatchObject({ colorPrimary: "var(--accent)", colorBackground: "var(--raised)", colorForeground: "var(--ink)" });
  });

  it("with Clerk off (the test bed, or a key missing), draws the page with no Clerk at all", () => {
    for (const off of [() => vi.stubEnv("E2E", "1"), () => vi.stubEnv("CLERK_SECRET_KEY", ""), () => vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", " ")]) {
      vi.stubEnv("E2E", "");
      vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_x");
      vi.stubEnv("CLERK_SECRET_KEY", "sk_test_x");
      off();
      const html = render();
      expect(html).toContain('<p id="page">The page</p>');
      expect(html).not.toContain("data-clerk");
    }
  });
});
