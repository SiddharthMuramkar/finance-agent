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
  it("offers Sign in and Join the waitlist, to /join, on a public page", () => {
    const html = visitorNav("/about");
    expect(signIn(html)).not.toMatch(/aria-current/);
    expect(html.match(/data-join=""/g)).toHaveLength(1);
    expect(html).toMatch(/<a (?=[^>]*href="\/join")(?=[^>]*data-join="")[^>]*>Join the waitlist<\/a>/);
    expect(html).toContain("Join the waitlist");
  });

  it("marks Sign in as the page showing on /sign-in and Clerk's steps under it, with no Join the waitlist", () => {
    for (const path of ["/sign-in", "/sign-in/factor-one"]) {
      const html = visitorNav(path);
      expect(signIn(html), path).toMatch(/aria-current="page"/);
      expect(html, path).not.toContain("data-join");
      expect(html, path).not.toContain("Join the waitlist");
    }
  });

  it("offers Sign in but no Join the waitlist on the joining flow, /join and /sign-up", () => {
    for (const path of ["/join", "/sign-up", "/sign-up/verify-email-address"]) {
      const html = visitorNav(path);
      expect(signIn(html), path).not.toMatch(/aria-current/);
      expect(html, path).not.toContain("data-join");
      expect(html, path).not.toContain("Join the waitlist");
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

// Audit batch 2: the phone Menu sheet and the account menu are native popovers (popover="auto"), so the browser closes
// them on Esc or a press outside and draws them in the top layer. The sheet is always in the page, closed until Menu opens
// it (4.2: Home, the page links, Sign in for a visitor, the theme row), and Menu says Menu, collapsed, until it does.
const memberNav = (path: string) => {
  at.path = path;
  return renderToStaticMarkup(<SiteNav viewer={{ state: "member", name: "Asha Rao", button: { label: "Continue", href: "/study" } } as never} />);
};
const sheetOf = (html: string) => /<nav (?=[^>]*id="site-menu")[^>]*>.*?<\/nav>/.exec(html)?.[0] ?? "";
const linksIn = (html: string) => [...html.matchAll(/<a [^>]*>([^<]*)<\/a>/g)].map((m) => m[1]);

describe("the phone Menu sheet", () => {
  it("is a closed popover nav named Menu, opened by the Menu button's popovertarget", () => {
    const html = visitorNav("/about");
    expect(html).toMatch(/<button (?=[^>]*class="[^"]*\bv-menu-btn\b)(?=[^>]*popoverTarget="site-menu")(?=[^>]*aria-controls="site-menu")(?=[^>]*aria-expanded="false")[^>]*>Menu<\/button>/);
    expect(sheetOf(html)).toMatch(/^<nav (?=[^>]*aria-label="Menu")(?=[^>]*class="v-sheet")(?=[^>]*popover="auto")[^>]*>/);
    // Esc and a press outside are the browser's own (popover="auto"): the page adds no key or document listener.
    expect(html).not.toMatch(/<details|<summary/);
  });

  it("holds Home, the page links (the one showing marked) and Sign in for a visitor, then the theme row", () => {
    const sheet = sheetOf(visitorNav("/about"));
    expect(linksIn(sheet)).toEqual(["Home", "How it works", "Examples", "About", "Sign in"]);
    expect(sheet).toMatch(/<a aria-current="page"[^>]*href="\/about">About<\/a>/);
    expect(sheet).toMatch(/<button (?=[^>]*class="v-sheet-theme")(?=[^>]*data-testid="theme-switch")[^>]*>.*Dark theme/);
  });

  it("holds no Sign in for a member", () => {
    expect(linksIn(sheetOf(memberNav("/")))).toEqual(["Home", "How it works", "Examples", "About"]);
  });
});

describe("the account menu, for a member", () => {
  it("is an avatar button that opens a popover of links and Sign out, not a <details>", () => {
    const html = memberNav("/");
    const button = /<button (?=[^>]*class="v-account-btn")[^>]*>/.exec(html)?.[0] ?? "";
    expect(button).toMatch(/aria-label="Account menu"/);
    expect(button).toMatch(/data-affordance="icon"/);
    expect(button).toMatch(/aria-expanded="false"/);
    expect(button).not.toMatch(/aria-haspopup/);
    const id = /popoverTarget="([^"]+)"/.exec(button)?.[1];
    expect(id).toBeTruthy();
    expect(button).toContain(`aria-controls="${id}"`);
    const menu = new RegExp(`<div (?=[^>]*id="${id}")(?=[^>]*popover="auto")(?=[^>]*class="v-account-menu")[^>]*>.*?</div>`).exec(html)?.[0] ?? "";
    expect(menu).toContain('<p class="name">Asha Rao</p>');
    expect(linksIn(menu)).toEqual(["Course map", "Notebook", "Account settings"]);
    expect(menu).toMatch(/<button type="submit"[^>]*>Sign out<\/button>/);
    // A list of links in Tab order: no arrow-key menu roles.
    expect(menu).not.toMatch(/role="menu/);
    expect(html).not.toMatch(/<details|<summary/);
  });

  it("names its own anchor for the menu to hang from (site.css reads --v-account-anchor)", () => {
    expect(memberNav("/")).toMatch(/<div class="v-account" style="--v-account-anchor:--v-account[\w-]+">/);
  });
});
