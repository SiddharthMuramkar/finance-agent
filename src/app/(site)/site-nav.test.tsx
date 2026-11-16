import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The site nav for a visitor (Signal spec 4.2), by the page showing. Its right side is "Sign in" and the primary "Join
// early access", except on the sign-in pages (issue #33), where the page's own form is its one primary (5: one primary
// per screen): on /sign-in Sign in is the page showing, and on the joining flow (/join, /sign-up) the nav adds no Join
// that would only lead back to the same task.

const at = vi.hoisted(() => ({ path: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => at.path }));

const { SiteNav } = await import("./site-nav");

const visitorNav = (path: string) => {
  at.path = path;
  return renderToStaticMarkup(<SiteNav viewer={{ state: "visitor" }} />);
};
const signIn = (html: string) => /<a [^>]*href="\/sign-in"[^>]*>Sign in<\/a>/.exec(html)?.[0];

describe("the site nav, for a visitor", () => {
  it("offers Sign in and Join early access, to /join, on a public page", () => {
    const html = visitorNav("/about");
    expect(signIn(html)).not.toMatch(/aria-current/);
    expect(html.match(/data-join=""/g)).toHaveLength(1);
    expect(html).toMatch(/<a (?=[^>]*href="\/join")(?=[^>]*data-join="")[^>]*>Join early access<\/a>/);
    expect(html).toContain("Join early access");
  });

  it("marks Sign in as the page showing on /sign-in and Clerk's steps under it, with no Join early access", () => {
    for (const path of ["/sign-in", "/sign-in/factor-one"]) {
      const html = visitorNav(path);
      expect(signIn(html), path).toMatch(/aria-current="page"/);
      expect(html, path).not.toContain("data-join");
      expect(html, path).not.toContain("Join early access");
    }
  });

  it("offers Sign in but no Join early access on the joining flow, /join and /sign-up", () => {
    for (const path of ["/join", "/sign-up", "/sign-up/verify-email-address"]) {
      const html = visitorNav(path);
      expect(signIn(html), path).not.toMatch(/aria-current/);
      expect(html, path).not.toContain("data-join");
      expect(html, path).not.toContain("Join early access");
    }
  });
});

// ADR 0019: a sun/moon switch in the nav flips the theme. Both icons are drawn so CSS shows the right one before
// hydration; the server names it for Light (the page's default before the head script runs).
describe("the theme switch", () => {
  it("sits in the nav for a visitor and a member", () => {
    at.path = "/";
    for (const html of [visitorNav("/"), renderToStaticMarkup(<SiteNav viewer={{ state: "member", name: "Asha", button: { label: "Continue", href: "/study" } } as never} />)]) {
      expect(html).toMatch(/<button (?=[^>]*data-testid="theme-switch")(?=[^>]*aria-label="Switch to dark theme")[^>]*>/);
      expect(html).toContain('data-testid="theme-icon-moon"');
      expect(html).toContain('data-testid="theme-icon-sun"');
    }
  });
});
