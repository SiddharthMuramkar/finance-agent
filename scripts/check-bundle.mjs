// Home's first-view budget on a production build (spec 2026-11-12 E8, "Done when"): no more than 350 KB of compressed
// script before the first interaction, and a largest contentful paint within 2.5 s on a mid-range phone on 4G.
//
//   npx next build
//   node scripts/check-bundle.mjs [--port 3399] [--runs 3]
//
// It starts `next start` on the build in .next (never the test bed: E2E, E2E_DB and E2E_TUTOR are removed from its env),
// opens Home signed out in Chromium (Playwright's, or CHROME_PATH's on a cloud VM), and:
//   1. Desktop, 1280 x 800, no throttling, cold cache: records every script response from the first request until the
//      page has been quiet for 2 s, with no mouse, key or scroll, and sums their compressed (encoded body) and transfer
//      (body plus headers) sizes. Fails above 350,000 bytes (E8's 350 KB, 1,000 bytes to the kB).
//   2. If the hero's Explorable or section 2's Value levers did not draw (Home reads the hero's Case Data from the
//      database, so without DATABASE_URL the hero shows its placeholder), the chunks the build lists for those components
//      (.next/server/app/page_client-reference-manifest.js) that the page did not already load are fetched from the same
//      server, gzip-encoded as the page would get them, and added, marked "manifest". If the manifest cannot be read, or
//      a chunk it lists does not answer 2xx, the result is INCOMPLETE, never a pass.
//   3. Best effort, never failing: a phone (412 x 823 at 1.75x, touch) on Lighthouse's mobile 4G profile with the CPU
//      slowed 4 times through the DevTools protocol, three cold loads; prints each largest contentful paint, the element
//      it painted and what drew, the median, and that pass's script total. When the hero's Explorable did not draw, the
//      paint was measured on its placeholder, not on E8's page: the median line then says INCOMPLETE, never "within".
//
// Exit 0 within the budget, 1 over it, 2 when the measurement is incomplete or the server would not start. The server
// is always stopped. Not part of CI (E8 asks for it before merge, on a production build). docs/architecture.md, "The
// bundle check", says how to read it.
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, readFileSync } from "node:fs";
import http from "node:http";
import { join, resolve } from "node:path";
import vm from "node:vm";
import { chromium } from "@playwright/test";
import { BUDGET_BYTES, MOBILE_4G, cdpNetwork, kb, lcpReport, manifestRows, median, scriptTotals, table, verdict } from "../src/dev/bundle-budget.ts";
import { chromeExecutable } from "../src/dev/e2e-browser.ts";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const DIST = join(ROOT, ".next");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = Number(process.argv[i + 1]);
  if (!Number.isInteger(value) || value <= 0) {
    console.error(`--${name} takes a whole number`);
    process.exit(2);
  }
  return value;
}
const PORT = arg("port", 3399);
const RUNS = arg("runs", 3);
const BASE = `http://localhost:${PORT}`;
const LOG = join(DIST, "check-bundle-server.log");

if (!existsSync(join(DIST, "BUILD_ID"))) {
  console.error("No production build in .next: run `npx next build` first.");
  process.exit(2);
}

// ---- the server -------------------------------------------------------------------------------------------------

const env = { ...process.env, NODE_ENV: "production", PORT: String(PORT) };
for (const key of ["E2E", "E2E_DB", "E2E_TUTOR"]) delete env[key];
const log = createWriteStream(LOG);
// Its own process group, so stopping it stops whatever it started and nothing else.
const server = spawn(join(ROOT, "node_modules/.bin/next"), ["start", "-p", String(PORT)], { cwd: ROOT, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
server.stdout.pipe(log);
server.stderr.pipe(log);
let serverExited = false;
server.on("exit", () => (serverExited = true));

function stopServer() {
  if (serverExited) return;
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    // Already gone.
  }
}
process.on("exit", stopServer);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(2));

/** GET `path` from the server with raw node:http: status, the encoded body's length and the header bytes, never decompressed. */
function rawGet(path, headers = {}) {
  return new Promise((done, fail) => {
    const request = http.get(`${BASE}${path}`, { headers }, (response) => {
      let bytes = 0;
      response.on("data", (chunk) => (bytes += chunk.length));
      response.on("end", () => {
        // The status line and each header line as they crossed the wire ("Name: value\r\n": two more bytes after the
        // name and after the value), then the blank line.
        const head = `HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n`.length + response.rawHeaders.reduce((sum, h) => sum + h.length + 2, 0) + 2;
        done({ status: response.statusCode ?? 0, encoding: response.headers["content-encoding"] ?? "", contentType: response.headers["content-type"] ?? "", bodyBytes: bytes, headerBytes: head });
      });
      response.on("error", fail);
    });
    request.on("error", fail);
    request.setTimeout(30_000, () => request.destroy(new Error(`GET ${path} timed out`)));
  });
}

async function waitForServer() {
  const until = Date.now() + 90_000;
  while (Date.now() < until) {
    if (serverExited) break;
    try {
      if ((await rawGet("/")).status === 200) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`next start did not answer GET / with 200 within 90 s (its output: ${LOG})`);
}

// ---- the browser ------------------------------------------------------------------------------------------------

/** Records every response of the page from now on; `rows()` resolves each one's sizes once it has finished. */
function recordResponses(page) {
  const pending = [];
  page.on("response", (response) => {
    const request = response.request();
    pending.push(
      (async () => {
        const sizes = await request.sizes().catch(() => null);
        const headers = await response.allHeaders().catch(() => ({}));
        return {
          url: response.url(),
          status: response.status(),
          resourceType: request.resourceType(),
          encoding: headers["content-encoding"] ?? "",
          contentType: headers["content-type"] ?? "",
          bodyBytes: sizes?.responseBodySize ?? 0,
          headerBytes: sizes?.responseHeadersSize ?? 0,
          source: "network",
        };
      })(),
    );
  });
  return { rows: () => Promise.all(pending), count: () => pending.length };
}

/**
 * What drew on Home (the Signal site, src/app/(site)/page.tsx): the hero's Tutor demo widget, the levers story's widget,
 * and no other widget (the questions list draws only static pictures).
 */
async function whatDrew(page) {
  return page.evaluate(() => ({
    hero: !!document.querySelector('[data-site-section="hero"] input[type="range"]'),
    levers: !!document.querySelector('[data-site-section="levers"] input[type="range"]'),
    leversWired: !!document.querySelector('[data-site-section="levers"]'),
    showcaseWidgets: document.querySelectorAll('[data-testid="showcase-widget"]').length,
  }));
}

/** Waits until the page has had no request in flight for `quietMs`, as Lighthouse's network-quiet window does. */
async function quiet(page, quietMs, timeout) {
  await page.waitForLoadState("networkidle", { timeout });
  await page.waitForTimeout(quietMs);
}

/** The build's client chunks for Home's components that draw without the general Widget renderer. */
function manifestChunks() {
  const file = join(DIST, "server/app/(site)/page_client-reference-manifest.js");
  if (!existsSync(file)) return { error: `${file} is missing` };
  const sandbox = { globalThis: {} };
  sandbox.globalThis = sandbox;
  try {
    vm.runInNewContext(readFileSync(file, "utf8"), sandbox, { timeout: 2_000 });
  } catch (error) {
    return { error: `${file} could not be read: ${error.message}` };
  }
  const page = sandbox.__RSC_MANIFEST?.["/(site)/page"];
  if (!page?.clientModules) return { error: `${file} has no clientModules for /(site)/page` };
  const want = { hero: /src\/components\/signal\/JackpotWidget\.tsx/, levers: /src\/components\/signal\/LeversWidget\.tsx/ };
  const found = { hero: new Set(), levers: new Set() };
  for (const [key, entry] of Object.entries(page.clientModules)) {
    for (const [part, pattern] of Object.entries(want)) if (pattern.test(key)) for (const chunk of entry.chunks ?? []) found[part].add(chunk);
  }
  if (!found.hero.size) return { error: `${file} lists no client module for src/components/signal/JackpotWidget.tsx` };
  return { hero: [...found.hero], levers: [...found.levers] };
}

/** Adds the manifest's chunks for the parts that did not draw and the page did not already load. */
async function addUndrawn(rows, drew, notes) {
  const missing = [];
  if (!drew.hero) missing.push("hero");
  if (drew.leversWired && !drew.levers) missing.push("levers");
  if (!missing.length) return { rows, complete: true };
  const chunks = manifestChunks();
  if (chunks.error) {
    notes.push(`INCOMPLETE: ${missing.join(" and ")} did not draw, and ${chunks.error}.`);
    return { rows, complete: false };
  }
  const loaded = new Set(rows.map((r) => new URL(r.url).pathname));
  const added = [];
  for (const part of missing) {
    const list = chunks[part];
    if (part === "levers" && !list.length) {
      notes.push("INCOMPLETE: section 2 did not draw and the build lists no client module for its Value levers.");
      return { rows, complete: false };
    }
    const extra = list.filter((path) => !loaded.has(path));
    notes.push(`${part === "hero" ? "The hero's Explorable" : "Section 2's Value levers"} did not draw (no Case Data without DATABASE_URL, or nothing to draw); the build lists ${list.length} chunk(s) for it, ${list.length - extra.length} already loaded by the page, ${extra.length} added from the manifest.`);
    for (const path of extra) {
      added.push({ path, ...(await rawGet(path, { "accept-encoding": "gzip" })) });
      loaded.add(path);
    }
  }
  // A chunk that answered anything but 2xx would drop out of the total unseen: INCOMPLETE, never a pass.
  const fetched = manifestRows(BASE, added);
  notes.push(...fetched.notes);
  return { rows: [...rows, ...fetched.rows], complete: fetched.complete };
}

async function desktopPass(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const record = recordResponses(page);
  await page.goto(`${BASE}/`, { waitUntil: "load" });
  await quiet(page, 2_000, 60_000);
  const drew = await whatDrew(page);
  const rows = await record.rows();
  await context.close();
  return { rows, drew };
}

/** One cold phone load on 4G with a 4x slower CPU: the largest contentful paint, its element, FCP, what drew and the scripts. */
async function phoneRun(browser) {
  const context = await browser.newContext({ viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const keep = (window.__paints = { lcp: [], fcp: null });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const el = e.element;
        const what = el ? `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.dataset?.testid ? `[data-testid=${el.dataset.testid}]` : ""} "${(el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60)}"` : "(removed)";
        keep.lcp.push({ time: e.startTime, size: e.size, what });
      }
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (e.name === "first-contentful-paint") keep.fcp = e.startTime;
    }).observe({ type: "paint", buffered: true });
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", cdpNetwork(MOBILE_4G));
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: MOBILE_4G.cpuSlowdown });
  const record = recordResponses(page);
  await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 180_000 });
  await quiet(page, 3_000, 180_000);
  const paints = await page.evaluate(() => window.__paints);
  const drew = await whatDrew(page);
  const rows = await record.rows();
  await context.close();
  const last = paints.lcp.at(-1) ?? null;
  return { lcp: last ? last.time : null, what: last?.what ?? "(none recorded)", fcp: paints.fcp, drew, rows };
}

// ---- the run ----------------------------------------------------------------------------------------------------

const notes = [];
let exit = 0;
try {
  await waitForServer();
  const executablePath = chromeExecutable(process.env, chromium.executablePath(), existsSync);
  const browser = await chromium.launch({ ...(executablePath && { executablePath }) });
  try {
    const desktop = await desktopPass(browser);
    const filled = await addUndrawn(desktop.rows, desktop.drew, notes);
    const totals = scriptTotals(filled.rows);
    console.log(`\nHome, signed out, desktop 1280 x 800, cold, no throttling, before any interaction (${BASE}/):\n`);
    console.log(table(filled.rows));
    console.log(`\nDrew: hero Explorable ${desktop.drew.hero ? "yes" : "no"}; section 2 ${desktop.drew.leversWired ? (desktop.drew.levers ? "Value levers yes" : "Value levers no") : "still a placeholder slot"}; Showcase Widgets ${desktop.drew.showcaseWidgets} (E8: none before section 4 nears the screen).`);
    for (const note of notes) console.log(note);
    const v = verdict(totals.compressed);
    if (!filled.complete) exit = 2;
    else if (!v.pass) exit = 1;

    console.log(`\nLargest contentful paint, best effort: phone 412 x 823 at 1.75x, 4G (${MOBILE_4G.latencyMs} ms latency, ${MOBILE_4G.downloadKbps} kbps down, ${MOBILE_4G.uploadKbps} up), CPU ${MOBILE_4G.cpuSlowdown}x slower, ${RUNS} cold loads:\n`);
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      try {
        const run = await phoneRun(browser);
        runs.push(run);
        console.log(`  run ${i + 1}: LCP ${run.lcp === null ? "none" : `${Math.round(run.lcp)} ms`}, FCP ${run.fcp === null ? "none" : `${Math.round(run.fcp)} ms`}, element ${run.what}, drew hero Explorable ${run.drew.hero ? "yes" : "no (placeholder)"} and section 2 ${run.drew.levers ? "yes" : "no"}, scripts ${kb(scriptTotals(run.rows).compressed)}`);
      } catch (error) {
        console.log(`  run ${i + 1}: failed (${error.message.split("\n")[0]})`);
      }
    }
    const measured = runs.filter((r) => r.lcp !== null);
    const mid = median(measured.map((r) => r.lcp));
    const lcpLine = lcpReport(mid, measured.map((r) => r.drew));
    console.log(`\n  ${lcpLine} (lab figure, printed only; the real phone stays a post-deploy check).`);
    if (runs.length) console.log(`  phone pass scripts: ${kb(scriptTotals(runs[0].rows).compressed)} compressed in ${scriptTotals(runs[0].rows).rows.length} files (first run).`);

    console.log(`\nResult: ${exit === 2 ? "INCOMPLETE" : v.pass ? "PASS" : "FAIL"}: ${kb(totals.compressed)} of compressed script (${kb(totals.transfer)} transferred) against ${kb(BUDGET_BYTES)}. Server log: ${LOG}`);
    if (lcpLine.includes("INCOMPLETE")) console.log("E8's 2.5 s LCP is not shown by this run: the hero's Explorable did not draw. Build and run with DATABASE_URL on a Neon test branch.");
  } finally {
    await browser.close();
  }
} catch (error) {
  console.error(`check-bundle: ${error.message}`);
  exit = 2;
} finally {
  stopServer();
}
process.exit(exit);
