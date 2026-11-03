// Headless-browser check of the insight-led workspace (spec #57, ticket #74).
//
// It signs in to a LOCAL server that runs against a Neon TEST BRANCH, seeds that branch with a Learner at the
// explore step, and takes screenshots at a laptop and an upright iPad size, in light and dark, of: the explore
// Widget, Guided Tasks ticking, the live Formula Card, folded sources, Notes and the profile form.
// It makes no model call. Never point it at production: it writes progress, a Session and an Insight attempt.
//
//   node scripts/browser-check.mjs <output-folder>
//
// Environment (the orchestrator sets these; this script never reads .env itself):
//   DATABASE_URL     the test branch's pooled connection string (the server needs the same one)
//   PASSCODE         the passcode the local server was started with
//   BASE_URL         where the server listens (default http://localhost:3000)
//   PLAYWRIGHT_CORE  optional path to a playwright-core install when it is not in node_modules
//
// Exit code 0 only when every screenshot was taken and every assertion held; report.json in the folder lists each.
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { Pool } from "@neondatabase/serverless";

const out = process.argv[2];
if (!out) {
  console.error("Usage: node scripts/browser-check.mjs <output-folder>");
  process.exit(2);
}
const { DATABASE_URL, PASSCODE } = process.env;
const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
if (!DATABASE_URL || !PASSCODE) {
  console.error("DATABASE_URL and PASSCODE must be set (see the comment at the top of this file).");
  process.exit(2);
}
if (!/localhost|127\.0\.0\.1/.test(BASE)) {
  console.error(`Refusing to run against ${BASE}: this check writes test data, so it only runs against a local server.`);
  process.exit(2);
}
mkdirSync(out, { recursive: true });

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE ? resolve(process.env.PLAYWRIGHT_CORE) : "playwright-core");

const SIZES = { laptop: { width: 1440, height: 900 }, ipad: { width: 820, height: 1180 } };
const THEMES = ["light", "dark"];

// ---------- seeding ----------

const WIDGET = [
  'root = Widget("What a payment is worth today", [rate, card])',
  "$rate = 5",
  'rate = Slider("rate", "Discount rate", 0, 10, 0.5, $rate, "percent")',
  'card = FormulaCard("present-value", {ratePercent: $rate}, {}, {amount: 1000, years: 5})',
].join("\n");

const REPLY = [
  "Here is the idea in one card. Drag the rate and watch what a payment in five years is worth today.",
  "",
  "```openui-lang",
  WIDGET,
  "```",
  "",
  "A larger rate shrinks a far-off payment more.",
  "",
  "```sources",
  JSON.stringify([
    { n: 1, title: "Principles of Finance 2e (OpenStax), the time value of money", href: "/passages/1", credit: "OpenStax, CC BY 4.0" },
    { n: null, title: "Case Data: the Mega Millions cash option", href: "/passages/1", credit: null },
  ]),
  "```",
].join("\n");

async function seed(passed) {
  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    await pool.query("delete from insight_attempts where topic_id = 'present-value'");
    await pool.query("delete from topic_progress where topic_id = 'present-value'");
    await pool.query("delete from learner_profile");
    await pool.query(
      `insert into topic_progress (learner_id, topic_id, step, reveal_shown, status) values (1, 'present-value', $1, $2, $3)`,
      passed ? ["principle", true, "passed"] : ["explore", false, "in_progress"],
    );
    await pool.query(
      `insert into learner_state (id, learner_id, current_topic_id) values (1, 1, 'present-value')
       on conflict (id) do update set current_topic_id = excluded.current_topic_id, entered_by_jump = false`,
    );
    if (passed) {
      await pool.query(
        `insert into insight_attempts (learner_id, topic_id, reported, released, words, tool_call_id) values (1, 'present-value', 'found', 'found', $1, $2)`,
        ["A high rate shrinks later payments, so cash now can beat more later.", `browser-check-${Date.now()}`],
      );
      return;
    }
    const { rows } = await pool.query(
      `insert into sessions (learner_id, instructions, tools, model, effort, fingerprint) values (1, 'browser check', '[]'::jsonb, 'claude-opus-5-5', 'high', $1) returning id`,
      [`browser-check-${Date.now()}`],
    );
    const id = rows[0].id;
    const lines = [
      // The opener the page starts for an empty Session: a note code wrote, never drawn as a Learner bubble.
      ["user", [{ type: "text", text: "Opener by code: the Learner has just opened this Topic, and this turn was started by the page; the Learner has written nothing yet." }]],
      ["assistant", [{ type: "text", text: REPLY }]],
    ];
    for (const [seq, [role, content]] of lines.entries()) {
      await pool.query(`insert into messages (session_id, seq, role, content) values ($1, $2, $3, $4::jsonb)`, [id, seq + 1, role, JSON.stringify(content)]);
    }
  } finally {
    await pool.end();
  }
}

// ---------- browsing ----------

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

/** Sets the first visible range input inside `scope` to `value`, the way a drag would (React listens to input events). */
async function setSlider(page, scope, value) {
  const slider = page.locator(`${scope} input[type=range]:visible`).first();
  await slider.waitFor({ state: "visible", timeout: 15_000 });
  await slider.evaluate((el, v) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(el, String(v));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function openContext(browser, size, theme) {
  const context = await browser.newContext({ viewport: SIZES[size], deviceScaleFactor: 1 });
  const url = new URL(BASE);
  await context.addCookies([{ name: "theme", value: theme, domain: url.hostname, path: "/" }]);
  // The login route sets the access cookie; the context's own request client shares its cookie jar with the pages.
  const login = await context.request.post(`${BASE}/api/login`, { form: { passcode: PASSCODE }, maxRedirects: 0 });
  if (login.status() !== 303 || (login.headers().location ?? "").includes("wrong")) throw new Error(`sign-in failed (status ${login.status()}); check PASSCODE`);
  const page = await context.newPage();
  return { context, page };
}

async function shot(page, name) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: false });
}

async function studyShots(browser, size, theme) {
  const tag = `${size}-${theme}`;
  const { context, page } = await openContext(browser, size, theme);
  try {
    await page.goto(`${BASE}/study`, { waitUntil: "networkidle" });
    const explore = size === "laptop" ? '[data-testid="widget-card"]' : '[data-testid="explore-card"]';

    await step(`${tag}: explore Widget`, async () => {
      if (size === "laptop") await page.locator('[data-testid="explore-chip"]').click();
      await page.locator(`${explore} input[type=range]`).first().waitFor({ state: "visible", timeout: 15_000 });
      await shot(page, `${tag}-1-explore-widget`);
    });

    await step(`${tag}: profile form card`, async () => {
      // The first-visit offer shows because the seed left no profile and no dismissal.
      await page.locator("[data-profile-card]").waitFor({ state: "visible", timeout: 10_000 });
      await shot(page, `${tag}-2-profile-card`);
    });

    await step(`${tag}: Guided Tasks ticking`, async () => {
      const tasks = page.locator(`${explore} [data-testid="guided-tasks"]`);
      await tasks.waitFor({ state: "visible", timeout: 15_000 });
      const items = tasks.locator("li");
      const count = await items.count();
      if (count < 2) throw new Error(`expected several Guided Tasks, found ${count}`);
      // The present value Topic's tasks are: rate 0%, then 2%, then 8%, then the rate near the cash option.
      let n = 0;
      for (const rate of [0, 2, 8, 3.25]) {
        await setSlider(page, explore, rate);
        n += 1;
        await shot(page, `${tag}-3-guided-tasks-${n}-rate-${String(rate).replace(".", "_")}`);
      }
      // Rate 3.25 is the last position set: the first three tasks are done and the fourth (closest to the cash option) too.
      const done = await tasks.locator('li[data-state="done"]').count();
      if (done < 3) throw new Error(`expected at least 3 Guided Tasks ticked after the sliders moved, saw ${done}`);
    });

    await step(`${tag}: live Formula Card`, async () => {
      // The Session's Widget is the other chip in the panel; the explore Widget was showing. (On the iPad the
      // explore Widget is pinned in the conversation, so the panel's card is free for this one.)
      await page.locator('[role=group][aria-label="Widgets in this Session"] button:not([data-testid="explore-chip"])').first().click();
      const card = page.locator('[data-testid="widget-card"] [data-testid="formula-card"]').first();
      await card.scrollIntoViewIfNeeded();
      await card.waitFor({ state: "visible", timeout: 15_000 });
      const before = await card.locator('[data-testid="formula-output"]').allInnerTexts();
      await shot(page, `${tag}-4-formula-card-rate-5`);
      await setSlider(page, '[data-testid="widget-card"]', 9);
      await page.waitForTimeout(300);
      const after = await card.locator('[data-testid="formula-output"]').allInnerTexts();
      if (JSON.stringify(before) === JSON.stringify(after)) throw new Error("the Formula Card did not change when the rate slider moved");
      await shot(page, `${tag}-4-formula-card-rate-9`);
    });

    await step(`${tag}: folded sources`, async () => {
      const fold = page.locator('[data-testid="sources-fold"]').first();
      await fold.scrollIntoViewIfNeeded();
      await shot(page, `${tag}-5-sources-folded`);
      await fold.locator("summary").click();
      await shot(page, `${tag}-5-sources-open`);
    });
  } finally {
    await context.close();
  }
}

async function noteShots(browser, size, theme) {
  const tag = `${size}-${theme}`;
  const { context, page } = await openContext(browser, size, theme);
  try {
    await step(`${tag}: Notes`, async () => {
      await page.goto(`${BASE}/notes`, { waitUntil: "networkidle" });
      await page.getByText("A high rate shrinks later payments", { exact: false }).first().waitFor({ timeout: 15_000 });
      await shot(page, `${tag}-6-notes`);
    });
    await step(`${tag}: profile page`, async () => {
      await page.goto(`${BASE}/profile`, { waitUntil: "networkidle" });
      await page.locator("form").first().waitFor({ timeout: 10_000 });
      await shot(page, `${tag}-7-profile-form`);
    });
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch();
try {
  await seed(false);
  for (const size of Object.keys(SIZES)) for (const theme of THEMES) await studyShots(browser, size, theme);
  await seed(true);
  for (const size of Object.keys(SIZES)) for (const theme of THEMES) await noteShots(browser, size, theme);
} finally {
  await browser.close();
}
writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2));
const failed = report.filter((r) => !r.ok);
console.log(`${report.length - failed.length} ok, ${failed.length} failed. Screenshots and report.json are in ${out}`);
process.exit(failed.length ? 1 : 0);
