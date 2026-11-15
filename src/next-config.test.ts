import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

// Decision #7: every public site page's nav and CTAs follow the viewer state (Signal spec 7.1), so one address serves
// several pages keyed by the cookie.
const SITE = ["/", "/how-it-works", "/examples", "/examples/:slug", "/about"];

describe("The public site's pages are never cached as pages", () => {
  for (const source of SITE) {
    it(`${source} is private and no-store, so one address can serve several pages keyed by the cookie`, async () => {
      const rules = await nextConfig.headers!();
      const value = rules
        .filter((r) => r.source === source)
        .flatMap((r) => r.headers)
        .find((h) => h.key === "Cache-Control")?.value;
      expect(value).toMatch(/private/);
      expect(value).toMatch(/no-store/);
      expect(value).not.toMatch(/public|s-maxage/);
    });
  }

  it("they are the only private, no-store addresses", async () => {
    const rules = await nextConfig.headers!();
    const noStore = rules.filter((r) => r.headers.some((h) => h.key === "Cache-Control" && /no-store/.test(h.value)));
    expect(noStore.map((r) => r.source)).toEqual(SITE);
  });
});

describe("Security headers", () => {
  it("sends anti-framing, nosniff and referrer headers on every route", async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source === "/:path*");
    const headers = Object.fromEntries((all?.headers ?? []).map((h) => [h.key, h.value]));
    expect(headers["Content-Security-Policy"]).toBe("frame-ancestors 'none'");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });
});
