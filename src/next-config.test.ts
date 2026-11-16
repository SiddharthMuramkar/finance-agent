import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import { NO_STORE_SOURCES } from "./site/routes";

// Decision #7: every public site page's nav and CTAs follow the viewer state (Signal spec 7.1), so one address serves
// several pages keyed by the cookie. The sources come from the one public-route list (issue #69); src/proxy.test.ts
// checks it against the gate.
const SITE = NO_STORE_SOURCES;

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
    expect(noStore.map((r) => r.source)).toEqual([...SITE]);
  });
});

describe("BotID (issue #33)", () => {
  it("withBotId routes the browser's challenge to Vercel's BotID service", async () => {
    const rewrites = await nextConfig.rewrites!();
    const list = Array.isArray(rewrites) ? rewrites : [...(rewrites.beforeFiles ?? []), ...(rewrites.afterFiles ?? [])];
    const botid = list.filter((r) => r.destination.startsWith("https://api.vercel.com/bot-protection/"));
    expect(botid.map((r) => r.destination)).toEqual([
      "https://api.vercel.com/bot-protection/v1/challenge",
      "https://api.vercel.com/bot-protection/v1/proxy/:path*",
    ]);
  });

  it("loosens framing only on BotID's own paths, after the site-wide rule", async () => {
    const rules = await nextConfig.headers!();
    const framed = rules.filter((r) => r.headers.some((h) => h.key === "X-Frame-Options"));
    expect(framed.map((r) => r.headers.find((h) => h.key === "X-Frame-Options")?.value)).toEqual(["DENY", "SAMEORIGIN"]);
    expect(framed.map((r) => r.headers.find((h) => h.key === "Content-Security-Policy")?.value)).toEqual([
      "frame-ancestors 'none'",
      "frame-ancestors 'self'",
    ]);
    expect(framed[1].source).toMatch(/^\/149e9513-01fa-4fb0-aad4-566afd725d1b\//);
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

  it("keeps browsers on HTTPS for two years, subdomains included (issue #33)", async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source === "/:path*");
    expect(all?.headers.find((h) => h.key === "Strict-Transport-Security")?.value).toBe("max-age=63072000; includeSubDomains");
  });

  it("turns off camera, microphone, location, payment, USB and interest tracking on every route (issue #33)", async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source === "/:path*");
    const policy = all?.headers.find((h) => h.key === "Permissions-Policy")?.value ?? "";
    expect(policy.split(", ").sort()).toEqual(["browsing-topics=()", "camera=()", "geolocation=()", "interest-cohort=()", "microphone=()", "payment=()", "usb=()"]);
  });
});

describe("The old sign-in address (issue #33)", () => {
  it("/login answers 308 to /sign-in, so old links and bookmarks still reach the sign-in (Next.js keeps the query)", async () => {
    const rules = await nextConfig.redirects!();
    const login = rules.filter((r) => r.source.startsWith("/login"));
    expect(login).toEqual([{ source: "/login", destination: "/sign-in", permanent: true }]);
  });
});
