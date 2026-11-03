import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("The main address (Home) is never cached as a page", () => {
  it("is private and no-store, so one address can serve two pages keyed by the cookie", async () => {
    const rules = await nextConfig.headers!();
    const value = rules
      .filter((r) => r.source === "/")
      .flatMap((r) => r.headers)
      .find((h) => h.key === "Cache-Control")?.value;
    expect(value).toMatch(/private/);
    expect(value).toMatch(/no-store/);
    expect(value).not.toMatch(/public|s-maxage/);
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
