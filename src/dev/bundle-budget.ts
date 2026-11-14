/**
 * Home's first-view budget (spec 2026-11-12 E8, "Done when"): no more than 350 KB of compressed script before the first
 * interaction, and a largest contentful paint within 2.5 seconds on a mid-range phone on 4G. scripts/check-bundle.mjs
 * measures a production build in Chromium; the sums, the verdicts and the printed table live here so they are tested
 * (bundle-budget.test.ts). No imports and only erasable TypeScript, so Node runs this file straight from the script.
 */

/** E8's 350 KB, counted as DevTools counts kB: 1,000 bytes each. */
export const BUDGET_BYTES = 350_000;

/** E8's largest contentful paint target on a mid-range phone on 4G. */
export const LCP_TARGET_MS = 2_500;

/**
 * A mid-range phone on 4G, as Lighthouse's mobile preset throttles it in DevTools: 150 ms round trips (562.5 ms of
 * request latency, 3.75 times the round trip), 1.6 Mbps down and 750 kbps up, each times 0.9, and a CPU four times slower.
 */
export const MOBILE_4G = { latencyMs: 562.5, downloadKbps: 1_474.56, uploadKbps: 675, cpuSlowdown: 4 } as const;

export type NetworkProfile = { latencyMs: number; downloadKbps: number; uploadKbps: number };

/** The profile as Chrome DevTools Protocol's Network.emulateNetworkConditions takes it: latency in ms, throughput in bytes a second. */
export function cdpNetwork(profile: NetworkProfile) {
  return { offline: false, latency: profile.latencyMs, downloadThroughput: (profile.downloadKbps * 1024) / 8, uploadThroughput: (profile.uploadKbps * 1024) / 8 };
}

/**
 * One response the page received. `bodyBytes` is the body as it crossed the wire (compressed when `encoding` says so),
 * `headerBytes` the response headers. `source` says how it was counted: "network" for what the browser fetched, "manifest"
 * for a chunk the build lists for a component that did not draw (fetched by the script, not by the page). `contentType`
 * is the response's Content-Type, when known.
 */
export type ResponseRow = { url: string; status: number; resourceType: string; encoding: string; bodyBytes: number; headerBytes: number; source?: "network" | "manifest"; contentType?: string };

/**
 * A script request answered with something that is not JavaScript: still counted (the browser fetched it before the first
 * interaction), and named in the table. On `next start` the analytics script's address (/_vercel/insights/script.js, served
 * only on Vercel) reaches the sign-in proxy and comes back as the login page's HTML.
 */
export const notJavaScript = (r: ResponseRow) => !!r.contentType && !/javascript|ecmascript/i.test(r.contentType);

export type ScriptTotals = { rows: ResponseRow[]; compressed: number; transfer: number };

/** The script responses that count: resource type script and a 2xx status. Compressed is the bodies; transfer adds the headers. */
export function scriptTotals(rows: ResponseRow[]): ScriptTotals {
  const scripts = rows.filter((r) => r.resourceType === "script" && r.status >= 200 && r.status < 300);
  const compressed = scripts.reduce((sum, r) => sum + r.bodyBytes, 0);
  const transfer = scripts.reduce((sum, r) => sum + r.bodyBytes + r.headerBytes, 0);
  return { rows: scripts, compressed, transfer };
}

/** Within the budget at or under 350,000 bytes; `over` is how far past it (negative while under). */
export function verdict(compressed: number) {
  return { pass: compressed <= BUDGET_BYTES, over: compressed - BUDGET_BYTES };
}

/** Within 2.5 s, or not; null when no paint was recorded. */
export function lcpVerdict(ms: number | null) {
  return ms === null ? null : { pass: ms <= LCP_TARGET_MS, over: ms - LCP_TARGET_MS };
}

/** What drew on one load of Home: the hero's Explorable and section 2's Value levers (scripts/check-bundle.mjs reads it). */
export type Drew = { hero: boolean; levers: boolean };

/**
 * The phone pass's verdict on E8's 2.5 s. E8 is about Home as it ships, with the hero's Explorable drawn. Without
 * DATABASE_URL the hero has no Case Data and shows its placeholder, so the paint was measured on a page that is not E8's:
 * then the line says INCOMPLETE, with the figure, never a bare "within". `drew` holds one entry for each measured run.
 */
export function lcpReport(ms: number | null, drew: readonly Drew[]): string {
  const v = lcpVerdict(ms);
  if (ms === null || v === null) return `median LCP not measured against E8's ${LCP_TARGET_MS} ms: no verdict`;
  const figure = `median LCP ${Math.round(ms)} ms against E8's ${LCP_TARGET_MS} ms`;
  const reading = v.pass ? "within" : `over by ${Math.round(v.over)} ms`;
  const placeholder = drew.filter((d) => !d.hero).length;
  if (!drew.length || placeholder) {
    const runs = drew.length ? `in ${placeholder} of ${drew.length} runs` : "(not recorded)";
    return `${figure}: INCOMPLETE, ${reading} but measured with the hero placeholder, not E8's page (the hero's Explorable did not draw ${runs}; run the build and this check with DATABASE_URL on a Neon test branch)`;
  }
  return `${figure}: ${reading}`;
}

/** One chunk the script fetched itself because the build lists it for a component that did not draw. */
export type Fetched = { path: string; status: number; encoding: string; contentType: string; bodyBytes: number; headerBytes: number };

/**
 * The rows for chunks fetched from the build manifest, marked "manifest". `scriptTotals` counts only 2xx answers, so a
 * chunk that answered anything else would drop out of the total unseen: it makes the measurement incomplete (never a
 * pass), and a note names it.
 */
export function manifestRows(base: string, fetched: readonly Fetched[]): { rows: ResponseRow[]; complete: boolean; notes: string[] } {
  const rows = fetched.map(
    (f): ResponseRow => ({ url: `${base}${f.path}`, status: f.status, resourceType: "script", encoding: f.encoding, contentType: f.contentType, bodyBytes: f.bodyBytes, headerBytes: f.headerBytes, source: "manifest" }),
  );
  const notes = fetched.filter((f) => f.status < 200 || f.status >= 300).map((f) => `INCOMPLETE: ${f.path} answered ${f.status}, so it could not be counted.`);
  return { rows, complete: notes.length === 0, notes };
}

/** The middle value (the lower middle of an even count), or null for none. */
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/** Bytes as kB with one decimal, 1,000 bytes to the kB. */
export const kb = (bytes: number) => `${(bytes / 1000).toFixed(1)} kB`;

/** The path of a URL, for a narrower table. */
function pathOf(url: string) {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

/** The counted scripts as a plain-text table, largest first, then the total, the transfer size and the budget line. */
export function table(rows: ResponseRow[]): string {
  const totals = scriptTotals(rows);
  const sorted = [...totals.rows].sort((a, b) => b.bodyBytes - a.bodyBytes);
  const head = ["script", "status", "encoding", "compressed", "transfer", "counted from"];
  const body = sorted.map((r) => [pathOf(r.url), String(r.status), r.encoding || "none", kb(r.bodyBytes), kb(r.bodyBytes + r.headerBytes), `${r.source ?? "network"}${notJavaScript(r) ? `, not JS (${r.contentType!.split(";")[0]})` : ""}`]);
  const v = verdict(totals.compressed);
  const foot = [
    [`${sorted.length} scripts`, "", "", kb(totals.compressed), kb(totals.transfer), ""],
    ["budget (E8)", "", "", kb(BUDGET_BYTES), "", v.pass ? `within, ${kb(-v.over)} to spare` : `OVER by ${kb(v.over)}`],
  ];
  const all = [head, ...body, ...foot];
  const widths = head.map((_, i) => Math.max(...all.map((row) => row[i].length)));
  const line = (row: string[]) => row.map((cell, i) => (i >= 3 && i <= 4 ? cell.padStart(widths[i]) : cell.padEnd(widths[i]))).join("  ").trimEnd();
  const rule = widths.map((w) => "-".repeat(w)).join("  ");
  return [line(head), rule, ...body.map(line), rule, ...foot.map(line)].join("\n");
}
