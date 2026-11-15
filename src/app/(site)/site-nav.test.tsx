import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The site nav for a visitor (Signal spec 4.2), by the page showing. Its right side is "Sign in" and the primary "Join
// early access", except on the sign-in page itself: there Sign in is the page showing, and the page's own button (Google
// or Enter) is its one primary (5: one primary per screen), so the nav adds no Join that would only lead back to it.

const at = vi.hoisted(() => ({ path: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => at.path }));

const { SiteNav } = await import("./site-nav");

const visitorNav = (path: string) => {
  at.path = path;
  return renderToStaticMarkup(<SiteNav viewer={{ state: "visitor" }} />);
};
const signIn = (html: string) => /<a [^>]*href="\/login"[^>]*>Sign in<\/a>/.exec(html)?.[0];

describe("the site nav, for a visitor", () => {
  it("offers Sign in and Join early access on a public page", () => {
    const html = visitorNav("/about");
    expect(signIn(html)).not.toMatch(/aria-current/);
    expect(html.match(/data-join=""/g)).toHaveLength(1);
    expect(html).toContain("Join early access");
  });

  it("marks Sign in as the page showing on the sign-in page, with no Join early access", () => {
    const html = visitorNav("/login");
    expect(signIn(html)).toMatch(/aria-current="page"/);
    expect(html).not.toContain("data-join");
    expect(html).not.toContain("Join early access");
  });
});
