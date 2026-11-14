import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("Home and the About page are never cached as pages", () => {
  // Each is one address for two pages keyed by the cookie: the About page's header knows who is signed in (spec 2026-11-12 G1).
  for (const source of ["/", "/about"]) {
    it(`${source} is private and no-store, so one address can serve two pages keyed by the cookie`, async () => {
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
    expect(noStore.map((r) => r.source)).toEqual(["/", "/about"]);
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
