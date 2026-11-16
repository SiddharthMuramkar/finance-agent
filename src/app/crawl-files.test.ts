import { describe, expect, it } from "vitest";
import { PUBLIC_PAGES, SIGNED_IN_ROOTS } from "@/site/routes";
import robots from "./robots";
import sitemap from "./sitemap";

// Issue #70: robots.txt and sitemap.xml are real files (Next.js's file conventions), so a crawler reads rules and the
// public pages instead of being sent to the sign-in card (Lighthouse's "robots.txt is not valid").

const SITE = "https://www.value-it.xyz";

describe("robots.txt", () => {
  it("lets every crawler read the site, keeps it out of the signed-in pages and the API, and names the sitemap", () => {
    const { rules, sitemap: map } = robots();
    expect(rules).toEqual({ userAgent: "*", allow: "/", disallow: [...SIGNED_IN_ROOTS] });
    expect(map).toBe(`${SITE}/sitemap.xml`);
  });

  it("never disallows a public page", () => {
    const { rules } = robots();
    const disallow = (rules as { disallow: string[] }).disallow;
    for (const { path } of PUBLIC_PAGES) {
      expect(disallow.some((prefix) => path.startsWith(prefix)), path).toBe(false);
    }
  });
});

describe("sitemap.xml", () => {
  it("lists the public pages from the public-route list, at the site's address, Home first", () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toEqual(PUBLIC_PAGES.filter((p) => p.sitemap).map((p) => `${SITE}${p.path === "/" ? "" : p.path}`));
    expect(urls[0]).toBe(SITE);
    for (const path of ["/how-it-works", "/examples", "/examples/amazon-2000", "/about", "/join"]) expect(urls, path).toContain(`${SITE}${path}`);
  });

  it("lists no signed-in page, sign-in page or API route", () => {
    for (const url of sitemap().map((entry) => new URL(entry.url).pathname)) {
      expect(SIGNED_IN_ROOTS.some((root) => url === root || url.startsWith(`${root}/`)), url).toBe(false);
      expect(url, url).not.toMatch(/^\/sign-(in|up)/);
    }
  });
});
