import { describe, expect, it } from "vitest";
import { BUDGET_BYTES, LCP_TARGET_MS, MOBILE_4G, cdpNetwork, lcpReport, lcpVerdict, manifestRows, median, notJavaScript, scriptTotals, table, verdict, type ResponseRow } from "./bundle-budget";

// Spec 2026-11-12 E8: "no more than 350 KB of compressed script before the first interaction, and a largest contentful
// paint within 2.5 seconds on a mid-range phone on 4G".

const row = (over: Partial<ResponseRow>): ResponseRow => ({ url: "http://localhost:3399/_next/static/chunks/a.js", status: 200, resourceType: "script", encoding: "gzip", bodyBytes: 1000, headerBytes: 300, ...over });

describe("the E8 budget", () => {
  it("is 350 KB of compressed script, 1,000 bytes to the kB, and 2.5 s of largest contentful paint", () => {
    expect(BUDGET_BYTES).toBe(350_000);
    expect(LCP_TARGET_MS).toBe(2_500);
  });

  it("passes at exactly 350,000 bytes and fails one byte over", () => {
    expect(verdict(350_000)).toEqual({ pass: true, over: 0 });
    expect(verdict(350_001)).toEqual({ pass: false, over: 1 });
  });

  it("holds a paint of 2,400 ms within 2.5 s and one of 2,600 ms over it, and gives no verdict without a paint", () => {
    expect(lcpVerdict(2_400)?.pass).toBe(true);
    expect(lcpVerdict(2_600)).toEqual({ pass: false, over: 100 });
    expect(lcpVerdict(null)).toBeNull();
  });
});

describe("scriptTotals", () => {
  it("counts only scripts that loaded: a stylesheet, a font and a 404 script are left out", () => {
    const totals = scriptTotals([
      row({ bodyBytes: 120_000 }),
      row({ url: "http://localhost:3399/_next/static/chunks/b.js", bodyBytes: 80_000, headerBytes: 250 }),
      row({ url: "http://localhost:3399/_next/static/css/c.css", resourceType: "stylesheet", bodyBytes: 30_000 }),
      row({ url: "http://localhost:3399/_next/static/media/f.woff2", resourceType: "font", bodyBytes: 40_000 }),
      row({ url: "http://localhost:3399/_next/static/chunks/gone.js", status: 404, bodyBytes: 5_000 }),
    ]);
    expect(totals.rows).toHaveLength(2);
    expect(totals.compressed).toBe(200_000);
    expect(totals.transfer).toBe(200_550);
    expect(totals.transfer).toBeGreaterThanOrEqual(totals.compressed);
  });

  it("counts a chunk added from the build manifest like one the page fetched", () => {
    expect(scriptTotals([row({ bodyBytes: 10 }), row({ bodyBytes: 20, source: "manifest" })]).compressed).toBe(30);
  });
});

describe("the 4G profile", () => {
  it("is Lighthouse's mobile preset: 562.5 ms of latency, 1,474.56 kbps down, 675 up, a CPU 4 times slower", () => {
    expect(MOBILE_4G).toEqual({ latencyMs: 562.5, downloadKbps: 1_474.56, uploadKbps: 675, cpuSlowdown: 4 });
  });

  it("turns kbps into the bytes a second the DevTools protocol takes", () => {
    const cdp = cdpNetwork(MOBILE_4G);
    expect(cdp.downloadThroughput).toBeCloseTo(188_743.68, 2);
    expect(cdp.uploadThroughput).toBeCloseTo(86_400, 2);
    expect(cdp.latency).toBe(562.5);
    expect(cdp.offline).toBe(false);
  });
});

// E8: "a largest contentful paint within 2.5 seconds", on Home as it ships, whose hero is the Explorable.
describe("lcpReport", () => {
  const drawn = { hero: true, levers: true };
  const placeholder = { hero: false, levers: true };

  it("says within or over only when the hero's Explorable drew on every run", () => {
    expect(lcpReport(2_072, [drawn, drawn, drawn])).toBe("median LCP 2072 ms against E8's 2500 ms: within");
    expect(lcpReport(2_600, [drawn, drawn, drawn])).toBe("median LCP 2600 ms against E8's 2500 ms: over by 100 ms");
  });

  it("says INCOMPLETE, never a bare within, when the hero showed its placeholder", () => {
    const line = lcpReport(2_072, [placeholder, placeholder, placeholder]);
    expect(line).toMatch(/^median LCP 2072 ms against E8's 2500 ms: INCOMPLETE, within but measured with the hero placeholder, not E8's page/);
    expect(line).toContain("did not draw in 3 of 3 runs");
    expect(line).toContain("DATABASE_URL");
    expect(line).not.toMatch(/: within$/);
    expect(lcpReport(2_072, [drawn, placeholder, drawn])).toContain("INCOMPLETE");
    expect(lcpReport(2_700, [placeholder])).toContain("INCOMPLETE, over by 200 ms but measured with the hero placeholder");
  });

  it("says INCOMPLETE when what drew was not recorded, and gives no verdict without a paint", () => {
    expect(lcpReport(2_072, [])).toContain("INCOMPLETE");
    expect(lcpReport(null, [drawn])).toBe("median LCP not measured against E8's 2500 ms: no verdict");
  });
});

// The script's own rule: a measurement it cannot complete is INCOMPLETE, never a pass.
describe("manifestRows", () => {
  const got = (path: string, status: number) => ({ path, status, encoding: "gzip", contentType: "application/javascript", bodyBytes: 4_000, headerBytes: 300 });

  it("counts chunks that answered 2xx, marked manifest, and the measurement stays complete", () => {
    const out = manifestRows("http://localhost:3399", [got("/_next/static/chunks/hero.js", 200)]);
    expect(out.complete).toBe(true);
    expect(out.notes).toEqual([]);
    expect(out.rows).toEqual([
      { url: "http://localhost:3399/_next/static/chunks/hero.js", status: 200, resourceType: "script", encoding: "gzip", contentType: "application/javascript", bodyBytes: 4_000, headerBytes: 300, source: "manifest" },
    ]);
    expect(scriptTotals(out.rows).compressed).toBe(4_000);
  });

  it("is INCOMPLETE, naming the chunk, when one answered 404 or 500, since the total would leave it out", () => {
    const out = manifestRows("http://localhost:3399", [got("/_next/static/chunks/a.js", 200), got("/_next/static/chunks/gone.js", 404), got("/_next/static/chunks/broken.js", 500)]);
    expect(out.complete).toBe(false);
    expect(out.notes).toEqual([
      "INCOMPLETE: /_next/static/chunks/gone.js answered 404, so it could not be counted.",
      "INCOMPLETE: /_next/static/chunks/broken.js answered 500, so it could not be counted.",
    ]);
    expect(scriptTotals(out.rows).rows).toHaveLength(1);
  });
});

describe("median", () => {
  it("takes the middle of three cold runs, and the lower middle of an even count", () => {
    expect(median([2_900, 1_800, 2_100])).toBe(2_100);
    expect(median([4, 1, 3, 2])).toBe(2);
    expect(median([])).toBeNull();
  });
});

describe("table", () => {
  it("lists the counted scripts largest first, then the total and the budget line", () => {
    const text = table([row({ bodyBytes: 1_000 }), row({ url: "http://localhost:3399/_next/static/chunks/big.js", bodyBytes: 300_000 }), row({ resourceType: "stylesheet", url: "http://x/c.css" })]);
    const lines = text.split("\n");
    expect(lines[0]).toMatch(/^script\s+status\s+encoding\s+compressed\s+transfer\s+counted from$/);
    expect(lines[2]).toContain("/_next/static/chunks/big.js");
    expect(lines[3]).toContain("/_next/static/chunks/a.js");
    expect(text).not.toContain("c.css");
    expect(text).toContain("2 scripts");
    expect(text).toContain("301.0 kB");
    expect(text).toMatch(/budget \(E8\)\s+350\.0 kB\s+within, 49\.0 kB to spare/);
  });

  it("still counts a script request answered with HTML, and names it", () => {
    // On next start the analytics script's address reaches the sign-in proxy and returns the login page.
    const html = row({ url: "http://localhost:3399/login?next=%2F_vercel%2Finsights%2Fscript.js", bodyBytes: 6_200, contentType: "text/html; charset=utf-8" });
    expect(notJavaScript(html)).toBe(true);
    expect(notJavaScript(row({ contentType: "application/javascript; charset=UTF-8" }))).toBe(false);
    expect(notJavaScript(row({}))).toBe(false);
    expect(scriptTotals([html]).compressed).toBe(6_200);
    expect(table([html])).toContain("network, not JS (text/html)");
  });

  it("says OVER, and by how much, past the budget", () => {
    expect(table([row({ bodyBytes: 360_500 })])).toContain("OVER by 10.5 kB");
  });
});
