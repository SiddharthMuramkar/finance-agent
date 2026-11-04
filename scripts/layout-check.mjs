// Real-browser layout check of the Widgets and the Study Workspace (UX audit, REPORT.md §13). Not part of CI: it
// needs a running local server and Chromium, and it is expected to FAIL wherever the app still has an audit bug.
//
//   node scripts/layout-check.mjs <output-folder> [--harness-only] [--skip-live]
//
// Part 1, the Widget harness (/dev/widgets, no database): every fixture fits at 360, 480 and 560 px, the Sensex
// milestones are spaced by time, the y-axis ticks stay put while a slider moves, the SIP chart's top tick is at most
// 8 lakh, and the harness's controls look and measure as clickable.
// Part 2, /study as the tools Learner on a Neon TEST BRANCH (skipped with --harness-only): the page never scrolls,
// the markup has one announcer, every button is clickable-looking and gives press feedback, a nav click is
// acknowledged within 300 ms, the OpenUI tokens follow the app theme, a tap shows the pressed style on an iPad, and
// (a live Tutor turn, skipped with --skip-live) Stop ends a reply within a second and a reload keeps what was written.
//
// Environment:
//   BASE_URL         where the server listens (default http://localhost:3000); localhost only
//   DATABASE_URL     Part 2: the test branch's pooled connection string (the server needs the same one)
//   PASSCODES        Part 2: the passcode list the server was started with; it must list a tools:<passcode> pair
//   PLAYWRIGHT_CORE  path to a playwright-core install when it is not in node_modules, for example
//                    /Users/siddharth/Developer/skills/node_modules/playwright-core
//                    (Chromium comes from ~/Library/Caches/ms-playwright)
//
// Writes report.json and screenshots to the folder. Exit code 0 only when every check passed.
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const out = process.argv[2];
if (!out || out.startsWith("--")) {
  console.error("Usage: node scripts/layout-check.mjs <output-folder> [--harness-only] [--skip-live]");
  process.exit(2);
}
const harnessOnly = process.argv.includes("--harness-only");
const skipLive = process.argv.includes("--skip-live");
const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
if (!/localhost|127\.0\.0\.1/.test(BASE)) {
  console.error(`Refusing to run against ${BASE}: this check only runs against a local server.`);
  process.exit(2);
}
if (!harnessOnly && !process.env.DATABASE_URL) {
  console.error("Part 2 needs DATABASE_URL and PASSCODES (a Neon test branch); pass --harness-only to run Part 1 alone.");
  process.exit(2);
}
mkdirSync(out, { recursive: true });

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE ? resolve(process.env.PLAYWRIGHT_CORE) : "playwright-core");

const WIDTHS = [360, 480, 560];
const report = [];
const step = async (name, fn) => {
  try {
    await fn();
    report.push({ name, ok: true });
    console.log(`ok    ${name}`);
  } catch (e) {
    report.push({ name, ok: false, error: String(e?.message ?? e).split("\n")[0] });
    console.error(`FAIL  ${name}: ${String(e?.message ?? e).split("\n")[0]}`);
  }
};
const shot = async (page, name) => {
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: false });
};

// ---------- Part 1: the Widget harness ----------

const FIXTURE_ROOT = new URL("../src/widgets/fixtures/", import.meta.url);
const fixtures = ["audit", "parts"].flatMap((group) => {
  try {
    return readdirSync(new URL(`${group}/`, FIXTURE_ROOT))
      .filter((f) => f.endsWith(".openui"))
      .sort();
  } catch {
    return [];
  }
});

const harnessUrl = (fixture, width, extra = "") => `${BASE}/dev/widgets?fixture=${encodeURIComponent(fixture)}&width=${width}${extra}`;

/** Opens a fixture in the harness and waits for its card, its sliders and its Queries to settle. */
async function openFixture(page, fixture, width, extra = "") {
  await page.goto(harnessUrl(fixture, width, extra), { waitUntil: "networkidle" });
  await page.locator('[data-testid="widget-card"]').waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(600);
}

/** Sets a range input to `value` the way a drag would (React listens to input events). */
async function setRange(locator, value) {
  await locator.evaluate((el, v) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(el, String(v));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

/** A value such as "₹7.66 L", "₹8 lakh", "₹1.2 Cr", "₹800K" or "₹7,66,000", in rupees; NaN if it is not one. */
function rupees(text) {
  const m = /([\d,]*\.?\d+)\s*(crore|cr|lakh|lac|l|k|m)?\b/i.exec(text.replace(/₹/g, ""));
  if (!m) return NaN;
  const n = Number(m[1].replace(/,/g, ""));
  const unit = (m[2] ?? "").toLowerCase();
  return n * ({ crore: 1e7, cr: 1e7, lakh: 1e5, lac: 1e5, l: 1e5, k: 1e3, m: 1e6 }[unit] ?? 1);
}

/** A known pressable button: the .pressable class when the app has it, else the first enabled button in main. */
function pressableButton(page) {
  const pressable = page.locator("main button.pressable:not(:disabled)").filter({ visible: true });
  return pressable.or(page.locator("main button:not(:disabled)").filter({ visible: true })).first();
}

/** Polls the button's computed transform for up to 300 ms (Chrome delays :active on touch); true once it differs from rest. */
async function transformChanges(page, button, rest) {
  for (let waited = 0; waited <= 300; waited += 30) {
    const now = await button.evaluate((el) => getComputedStyle(el).transform);
    if (now !== rest) return true;
    await page.waitForTimeout(30);
  }
  return false;
}

/** What overflows the pane or its card: the pane's horizontal scroll, and any control whose right edge passes the card's. */
async function overflowOf(page) {
  return page.evaluate(() => {
    const pane = document.querySelector('[data-testid="widget-pane"]');
    const card = document.querySelector('[data-testid="widget-card"]');
    const cardRight = card.getBoundingClientRect().right;
    const controls = [...card.querySelectorAll("button, input, select, textarea, summary, [role=button], [role=slider], [role=tab]")]
      .filter((el) => el.getClientRects().length > 0)
      .filter((el) => el.getBoundingClientRect().right > cardRight + 0.5)
      .filter((el) => {
        // A control only clipped inside a horizontal scroll container that itself stays in the card is not overflow.
        for (let a = el.parentElement; a && a !== card; a = a.parentElement) {
          const ox = getComputedStyle(a).overflowX;
          if (ox === "auto" || ox === "scroll" || ox === "hidden") return a.getBoundingClientRect().right > cardRight + 0.5;
        }
        return true;
      })
      .map((el) => `${el.tagName.toLowerCase()}${el.getAttribute("aria-label") ? `[${el.getAttribute("aria-label")}]` : ""}`);
    return { paneOver: pane.scrollWidth - pane.clientWidth, controls };
  });
}

async function harnessChecks(browser) {
  const context = await browser.newContext({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    for (const fixture of fixtures) {
      for (const width of WIDTHS) {
        await step(`${fixture} fits a ${width}px panel`, async () => {
          await openFixture(page, fixture, width);
          await shot(page, `harness-${fixture.replace(/\.openui$/, "")}-${width}`);
          const { paneOver, controls } = await overflowOf(page);
          if (paneOver > 0) throw new Error(`the panel scrolls sideways by ${paneOver}px`);
          if (controls.length) throw new Error(`controls pass the card's right edge: ${controls.join(", ")}`);
        });
      }
    }

    await step("Sensex milestones are spaced by time (1979 to 1990 is at least 40 times Feb to Mar 1992)", async () => {
      await openFixture(page, "01-sensex-milestones.openui", 560);
      const xs = await page.locator('[data-testid="history-point"]').evaluateAll((els) => els.map((e) => Number(e.getAttribute("cx"))));
      if (xs.length < 5) throw new Error(`expected 5 points, found ${xs.length}`);
      const ratio = (xs[1] - xs[0]) / (xs[4] - xs[3]);
      if (!(ratio >= 40)) throw new Error(`the gap ratio is ${ratio.toFixed(1)}`);
    });

    await step("the y-axis ticks stay put while a slider moves (fixture 09, 100 to 50)", async () => {
      await openFixture(page, "09-diversification-umbrellas.openui", 560);
      const labels = () => page.locator('[data-testid="plot-y-label"]').allTextContents();
      const before = await labels();
      if (!before.length) throw new Error("no plot-y-label found");
      const slider = page.locator('[data-testid="widget-card"] input[type=range]:visible').first();
      await setRange(slider, 100);
      await page.waitForTimeout(300);
      const high = await labels();
      await setRange(slider, 50);
      await page.waitForTimeout(300);
      const low = await labels();
      if (JSON.stringify(high) !== JSON.stringify(low)) throw new Error(`ticks moved from ${high.join(" ")} to ${low.join(" ")}`);
    });

    await step("SIP's top tick is at most 8 lakh", async () => {
      await openFixture(page, "07-sip-1000-month.openui", 560);
      const labels = await page.locator('[data-testid="plot-y-label"]').allTextContents();
      if (!labels.length) throw new Error("no plot-y-label found");
      const top = Math.max(...labels.map(rupees).filter(Number.isFinite));
      if (!(top <= 800_000)) throw new Error(`the top tick is ${top} (labels: ${labels.join(" ")})`);
    });

    await step("harness controls have cursor:pointer and targets of at least 24px", async () => {
      const bad = [];
      for (const fixture of fixtures) {
        await openFixture(page, fixture, 480);
        bad.push(
          ...(await page.evaluate((name) => {
            const sel = 'button:not(:disabled), summary, [role=button], [role=tab], select';
            return [...document.querySelectorAll(`[data-testid="widget-card"] :is(${sel})`)]
              .filter((el) => el.getClientRects().length > 0)
              .flatMap((el) => {
                const r = el.getBoundingClientRect();
                const why = [];
                if (getComputedStyle(el).cursor !== "pointer") why.push("cursor");
                if (r.width < 24 || r.height < 24) why.push(`${Math.round(r.width)}x${Math.round(r.height)}`);
                return why.length ? [`${name}: ${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 24)}" (${why.join(", ")})`] : [];
              });
          }, fixture)),
        );
      }
      if (bad.length) throw new Error(`${bad.length} controls: ${bad.slice(0, 4).join("; ")}`);
    });
  } finally {
    await context.close();
  }
}

// ---------- Part 2: /study as the tools Learner ----------

const SIZES = { laptop: { width: 1440, height: 900 }, ipad: { width: 820, height: 1180 } };
const OPENER = "Opener by code: the Learner has just opened this Topic, and this turn was started by the page; the Learner has written nothing yet.";
const LONG_REPLY = (n) => `Part ${n}. ${"A percentage point is the plain difference between two rates; a percent change compares the move with the old rate. ".repeat(6)}`;

/** Starts the tools Learner over and seeds a Session of 32 Tutor replies at the Present value explore step. Inserts only. */
async function seededLongSession() {
  const { signInAsToolsLearner } = await import("../src/dev/simulated-learner.ts");
  const { Pool } = await import("@neondatabase/serverless");
  const { cookie, learnerId } = await signInAsToolsLearner(BASE);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const topicId = "present-value";
    await pool.query(`insert into topic_progress (learner_id, topic_id, step, reveal_shown, status) values ($1, $2, 'explore', false, 'in_progress')`, [learnerId, topicId]);
    const { rows } = await pool.query(
      `insert into sessions (learner_id, instructions, tools, model, effort, fingerprint, topic_id, older)
       values ($1, 'layout check', '[]'::jsonb, 'claude-opus-5-5', 'high', $2, $3, false) returning id`,
      [learnerId, `layout-check-${Date.now()}`, topicId],
    );
    const sessionId = rows[0].id;
    const lines = [["user", OPENER], ...Array.from({ length: 32 }, (_, i) => ["assistant", LONG_REPLY(i + 1)])];
    for (const [seq, [role, text]] of lines.entries()) {
      await pool.query(`insert into messages (session_id, seq, role, content) values ($1, $2, $3, $4::jsonb)`, [sessionId, seq + 1, role, JSON.stringify([{ type: "text", text }])]);
    }
    await pool.query(`insert into learner_state (id, learner_id, current_topic_id, shown_session_id) values ($1, $1, $2, $3)`, [learnerId, topicId, sessionId]);
  } finally {
    await pool.end();
  }
  return cookie.slice(cookie.indexOf("=") + 1);
}

async function studyContext(browser, cookie, { size = "laptop", scheme = "light", theme = "light", touch = false } = {}) {
  const viewport = SIZES[size];
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: scheme, hasTouch: touch });
  const { hostname } = new URL(BASE);
  await context.addCookies([
    { name: "theme", value: theme, domain: hostname, path: "/" },
    { name: "fa_access", value: cookie, domain: hostname, path: "/", httpOnly: true },
  ]);
  const page = await context.newPage();
  await page.goto(`${BASE}/study`, { waitUntil: "networkidle" });
  await page.locator('[data-testid="widget-pane"]').waitFor({ state: "visible", timeout: 30_000 });
  return { context, page };
}

const overflow = (page) => page.evaluate(() => document.scrollingElement.scrollHeight - window.innerHeight);
const scrollY = (page) => page.evaluate(() => window.scrollY);

async function assertNoDocumentScroll(page, label) {
  const over = await overflow(page);
  if (over > 1) throw new Error(`${label}: the document is ${over}px taller than the window`);
  const y = await scrollY(page);
  if (y !== 0) throw new Error(`${label}: the document scrolled to ${y}px`);
}

async function studyChecks(browser, cookie) {
  const { context, page } = await studyContext(browser, cookie);
  try {
    await step("scroll: the document does not overflow and sits at the top after load", async () => {
      await assertNoDocumentScroll(page, "after load");
      await shot(page, "study-loaded");
    });

    for (const [name, locator] of [
      ["header", page.locator("header").first()],
      ["Topic bar", page.getByTestId("topic-bar")],
      ["composer", page.getByRole("textbox", { name: "Message" })],
    ]) {
      await step(`scroll: a wheel over the ${name} does not scroll the document`, async () => {
        await locator.hover({ timeout: 5000 });
        await page.mouse.wheel(0, 2000);
        await page.waitForTimeout(150);
        await assertNoDocumentScroll(page, `wheel over the ${name}`);
      });
    }

    await step("scroll: a Send with a mocked /api/turn leaves the document alone, before and after streaming", async () => {
      await page.route("**/api/turn", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/x-ndjson",
          body: `${JSON.stringify({ type: "text", text: "Mocked reply." })}\n${JSON.stringify({ type: "done", stopReason: "end_turn", elapsedMs: 5 })}\n`,
        }),
      );
      const box = page.getByRole("textbox", { name: "Message" });
      await box.fill("test");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(100);
      await assertNoDocumentScroll(page, "just after Send");
      await page.waitForFunction(() => document.querySelector('[data-testid="turn-status"]')?.textContent?.trim() === "Reply ready", null, { timeout: 15_000 });
      await assertNoDocumentScroll(page, "after streaming ends");
      await page.unroute("**/api/turn");
    });

    await step("markup: no role=status in a Tutor message, exactly one app-announcer and one turn-status", async () => {
      const counts = await page.evaluate(() => ({
        inMessages: document.querySelectorAll('[data-testid="assistant-message"] [role="status"]').length,
        announcers: document.querySelectorAll('[data-testid="app-announcer"]').length,
        turnStatus: document.querySelectorAll('[data-testid="turn-status"]').length,
      }));
      if (counts.inMessages) throw new Error(`${counts.inMessages} role=status regions inside Tutor messages`);
      if (counts.announcers !== 1) throw new Error(`${counts.announcers} app-announcer elements, expected 1`);
      if (counts.turnStatus !== 1) throw new Error(`${counts.turnStatus} turn-status elements, expected 1`);
    });

    await step("buttons: every visible enabled button, [role=button] and summary has cursor:pointer", async () => {
      const bad = await page.evaluate(() =>
        [...document.querySelectorAll("button:not(:disabled), [role=button]:not([aria-disabled=true]), summary")]
          .filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).cursor !== "pointer")
          .map((el) => el.outerHTML.slice(0, 90)),
      );
      if (bad.length) throw new Error(`${bad.length} without a pointer cursor: ${bad.slice(0, 3).join(" | ")}`);
    });

    await step("buttons: chips are at least 28px tall", async () => {
      const bad = await page.evaluate(() =>
        [...document.querySelectorAll('[data-testid="widget-chip"], [data-testid="explore-chip"], [data-chip]')]
          .filter((el) => el.getClientRects().length > 0 && el.getBoundingClientRect().height < 28)
          .map((el) => `${Math.round(el.getBoundingClientRect().height)}px: ${(el.textContent ?? "").trim().slice(0, 24)}`),
      );
      if (bad.length) throw new Error(`${bad.length} chips under 28px: ${bad.slice(0, 3).join("; ")}`);
    });

    await step("buttons: a press changes the transform within 150ms", async () => {
      const button = pressableButton(page);
      const at = await button.boundingBox();
      if (!at) throw new Error("no visible button");
      const rest = await button.evaluate((el) => getComputedStyle(el).transform);
      await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
      await page.mouse.down();
      const changed = await transformChanges(page, button, rest);
      await page.mouse.move(0, 0);
      await page.mouse.up();
      if (!changed) throw new Error(`the transform stayed ${rest}`);
    });

    await step("nav: a nav click shows route-skeleton or data-link-pending within 300ms", async () => {
      await page.getByRole("link", { name: "Progress" }).first().click({ noWaitAfter: true });
      await page.locator('[data-testid="route-skeleton"], [data-link-pending="true"]').first().waitFor({ state: "attached", timeout: 300 });
    });
  } finally {
    await context.close();
  }

  await step("theme: with the OS dark and the app light, --openui-text-neutral-primary equals --ink", async () => {
    const { context: dark, page: p } = await studyContext(browser, cookie, { scheme: "dark", theme: "light" });
    try {
      const [ink, openui] = await p.evaluate(() => {
        const probe = (value) => {
          const el = document.createElement("span");
          el.style.color = value;
          document.body.append(el);
          const color = getComputedStyle(el).color;
          el.remove();
          return color;
        };
        return [probe("var(--ink)"), probe("var(--openui-text-neutral-primary)")];
      });
      if (ink !== openui) throw new Error(`--ink is ${ink} but --openui-text-neutral-primary is ${openui}`);
    } finally {
      await dark.close();
    }
  });

  await step("touch: under iPad emulation (820x1180) a tap shows the pressed style", async () => {
    const { context: ipad, page: p } = await studyContext(browser, cookie, { size: "ipad", touch: true });
    try {
      const button = pressableButton(p);
      const at = await button.boundingBox();
      if (!at) throw new Error("no visible button");
      const rest = await button.evaluate((el) => getComputedStyle(el).transform);
      const cdp = await ipad.newCDPSession(p);
      const point = { x: at.x + at.width / 2, y: at.y + at.height / 2 };
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
      const changed = await transformChanges(p, button, rest);
      // Slide off the button before lifting, so the tap does not click it.
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 1, y: 1 }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      if (!changed) throw new Error(`the transform stayed ${rest}`);
    } finally {
      await ipad.close();
    }
  });
}

/** A live Tutor turn: Stop mid-reply ends within a second, and a reload keeps the partial reply with its Stopped note. */
async function stopCheck(browser, cookie) {
  const { context, page } = await studyContext(browser, cookie);
  try {
    await step("stop: a Stop mid-reply ends within 1s, and a reload keeps the partial reply with its Stopped note", async () => {
      await page.getByRole("textbox", { name: "Message" }).fill("Explain present value in some detail, with an example.");
      await page.keyboard.press("Enter");
      await page.locator('[data-testid="assistant-message"]').last().getByText(/\S{3,}/).first().waitFor({ timeout: 60_000 });
      const stop = page.getByRole("button", { name: /^stop/i });
      await stop.click({ timeout: 10_000 });
      const stopped = Date.now();
      await stop.waitFor({ state: "hidden", timeout: 1000 });
      if (Date.now() - stopped > 1000) throw new Error("Stop took longer than a second");
      await page.reload({ waitUntil: "networkidle" });
      const last = page.locator('[data-testid="assistant-message"]').last();
      if (!(await last.innerText()).trim()) throw new Error("the partial reply is gone after a reload");
      await page.getByText(/stopped/i).first().waitFor({ timeout: 5000 });
    });
  } finally {
    await context.close();
  }
}

// ---------- the run ----------

const browser = await chromium.launch();
try {
  await harnessChecks(browser);
  if (harnessOnly) console.log("skip  Part 2, /study (--harness-only)");
  else {
    const cookie = await seededLongSession();
    await studyChecks(browser, cookie);
    if (skipLive) console.log("skip  the live Stop check (--skip-live)");
    else await stopCheck(browser, await seededLongSession());
  }
} finally {
  await browser.close();
}
writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2));
const failed = report.filter((r) => !r.ok);
console.log(`${report.length - failed.length} ok, ${failed.length} failed. Screenshots and report.json are in ${out}`);
process.exit(failed.length ? 1 : 0);
