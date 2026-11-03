// Headless-browser check of the Study Workspace, run as the tools Learner (spec #119, "Owner tooling › Test tools").
//
// It signs in to a LOCAL server that runs against a Neon TEST BRANCH, always as the tools Learner (never the owner or
// the owner's test Learner), and starts that Learner over before each part: the old tools Learner is archived, never
// deleted, and the part begins from an empty one. It then covers what only a real browser shows:
//   1. Screenshots at a laptop and an upright iPad size, in light and dark, of the explore Widget, Guided Tasks
//      ticking, the live Formula Card, folded sources, Notes and Settings (seeded rows, no model call).
//   2. A reload, a switch of the panel's tabs and a second browser tab keep slider values and ticked Guided Tasks
//      (seeded rows, no model call).
//   3. With a quiz open, the last Tutor message and the message box stay on screen and the page doesn't grow past
//      the window (seeded rows, no model call).
//   4. The first-visit walk: sign-in → Welcome → Start this Topic → Next chips → quiz → passed, pressing only
//      named buttons. This part makes real Tutor turns on the local server (a few cents); --skip-walk leaves it out.
// The seeded parts write only the fresh tools Learner's rows, with inserts; nothing is renamed or deleted.
//
//   node scripts/browser-check.mjs <output-folder> [--skip-walk]
//
// Environment (the orchestrator sets these; this script never reads .env itself):
//   DATABASE_URL     the test branch's pooled connection string (the server needs the same one)
//   PASSCODES        the same passcode list the local server was started with; it must list a tools:<passcode> pair
//   BASE_URL         where the server listens (default http://localhost:3000)
//   PLAYWRIGHT_CORE  optional path to a playwright-core install when it is not in node_modules
//
// Exit code 0 only when every screenshot was taken and every assertion held; report.json in the folder lists each.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { Pool } from "@neondatabase/serverless";
import { parse } from "yaml";
import { signInAsToolsLearner, toolsPasscode } from "../src/dev/simulated-learner.ts";

const out = process.argv[2];
if (!out || out.startsWith("--")) {
  console.error("Usage: node scripts/browser-check.mjs <output-folder> [--skip-walk]");
  process.exit(2);
}
const skipWalk = process.argv.includes("--skip-walk");
const { DATABASE_URL } = process.env;
const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
if (!DATABASE_URL) {
  console.error("DATABASE_URL must be set (see the comment at the top of this file).");
  process.exit(2);
}
// Fails now, with the reason, when PASSCODES lists no tools pair: there is no fallback to another passcode.
const PASSCODE = toolsPasscode();
if (!/localhost|127\.0\.0\.1/.test(BASE)) {
  console.error(`Refusing to run against ${BASE}: this check writes test data, so it only runs against a local server.`);
  process.exit(2);
}
mkdirSync(out, { recursive: true });

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE ? resolve(process.env.PLAYWRIGHT_CORE) : "playwright-core");

const SIZES = { laptop: { width: 1440, height: 900 }, ipad: { width: 820, height: 1180 } };
const THEMES = ["light", "dark"];

// ---------- the tools Learner and its seeded rows ----------

/** Starts the tools Learner over (archive, never delete) and returns the fresh Learner's id and cookie value. */
async function freshToolsLearner() {
  const { cookie, learnerId } = await signInAsToolsLearner(BASE);
  return { learnerId, cookie: cookie.slice(cookie.indexOf("=") + 1) };
}

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

// The opener the page starts for an empty Session: a note code wrote, never drawn as a Learner bubble.
const OPENER = "Opener by code: the Learner has just opened this Topic, and this turn was started by the page; the Learner has written nothing yet.";

/** A long Tutor reply, so a seeded conversation is taller than the window. */
const LONG_REPLY = (n) =>
  `Part ${n}. ${"A percentage point is the plain difference between two rates; a percent change compares the move with the old rate. ".repeat(6)}`;

/**
 * Seeds the fresh tools Learner in one Topic at one step, with its live Session (the Tutor's `replies` after the
 * opener) shown in the Study Workspace. Inserts only: the Learner is empty after Start over.
 */
async function seedTopic(pool, learnerId, { topicId, step, status = "in_progress", revealShown = false, replies = [] }) {
  await pool.query(`insert into topic_progress (learner_id, topic_id, step, reveal_shown, status) values ($1, $2, $3, $4, $5)`, [learnerId, topicId, step, revealShown, status]);
  let sessionId = null;
  if (replies.length) {
    const { rows } = await pool.query(
      `insert into sessions (learner_id, instructions, tools, model, effort, fingerprint, topic_id, older)
       values ($1, 'browser check', '[]'::jsonb, 'claude-opus-5-5', 'high', $2, $3, false) returning id`,
      [learnerId, `browser-check-${Date.now()}`, topicId],
    );
    sessionId = rows[0].id;
    const lines = [["user", OPENER], ...replies.map((text) => ["assistant", text])];
    for (const [seq, [role, text]] of lines.entries()) {
      await pool.query(`insert into messages (session_id, seq, role, content) values ($1, $2, $3, $4::jsonb)`, [sessionId, seq + 1, role, JSON.stringify([{ type: "text", text }])]);
    }
  }
  await pool.query(`insert into learner_state (id, learner_id, current_topic_id, shown_session_id) values ($1, $1, $2, $3)`, [learnerId, topicId, sessionId]);
}

/** Starts the tools Learner over and seeds it: one of "explore", "quiz" or "passed". */
async function seeded(kind) {
  const learner = await freshToolsLearner();
  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    if (kind === "explore") await seedTopic(pool, learner.learnerId, { topicId: "present-value", step: "explore", replies: [REPLY] });
    if (kind === "quiz") {
      const replies = [1, 2, 3, 4, 5].map(LONG_REPLY);
      replies.push("Your Check is open on the right: answer the three questions there, and we'll go over them together.");
      await seedTopic(pool, learner.learnerId, { topicId: "num-percent-bps", step: "check", replies });
    }
    if (kind === "passed") {
      await seedTopic(pool, learner.learnerId, { topicId: "present-value", step: "principle", status: "passed", revealShown: true });
      await pool.query(
        `insert into insight_attempts (learner_id, topic_id, reported, released, words, tool_call_id) values ($1, 'present-value', 'found', 'found', $2, $3)`,
        [learner.learnerId, "A high rate shrinks later payments, so cash now can beat more later.", `browser-check-${Date.now()}`],
      );
    }
  } finally {
    await pool.end();
  }
  return learner;
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

/** A browser context signed in as the given tools Learner (its cookie), with the theme set. */
async function openContext(browser, learner, size = "laptop", theme = "light") {
  const context = await browser.newContext({ viewport: SIZES[size], deviceScaleFactor: 1 });
  const { hostname } = new URL(BASE);
  await context.addCookies([
    { name: "theme", value: theme, domain: hostname, path: "/" },
    { name: "fa_access", value: learner.cookie, domain: hostname, path: "/", httpOnly: true },
  ]);
  const page = await context.newPage();
  return { context, page };
}

async function shot(page, name) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: false });
}

async function studyShots(browser, learner, size, theme) {
  const tag = `${size}-${theme}`;
  const { context, page } = await openContext(browser, learner, size, theme);
  try {
    await page.goto(`${BASE}/study`, { waitUntil: "networkidle" });
    const explore = size === "laptop" ? '[data-testid="widget-card"]' : '[data-testid="explore-card"]';

    await step(`${tag}: explore Widget`, async () => {
      if (size === "laptop") await page.locator('[data-testid="explore-chip"]').click();
      await page.locator(`${explore} input[type=range]`).first().waitFor({ state: "visible", timeout: 15_000 });
      await shot(page, `${tag}-1-explore-widget`);
    });

    await step(`${tag}: Guided Tasks ticking`, async () => {
      const tasks = page.locator(`${explore} [data-testid="guided-tasks"]`);
      await tasks.waitFor({ state: "visible", timeout: 15_000 });
      const count = await tasks.locator("li").count();
      if (count < 2) throw new Error(`expected several Guided Tasks, found ${count}`);
      // The present value Topic's tasks are: rate 0%, then 2%, then 8%, then the rate near the cash option.
      let n = 0;
      for (const rate of [0, 2, 8, 3.25]) {
        await setSlider(page, explore, rate);
        n += 1;
        await shot(page, `${tag}-3-guided-tasks-${n}-rate-${String(rate).replace(".", "_")}`);
      }
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

/** The explore Widget's slider value and ticked Guided Tasks, as the laptop's panel draws them. */
async function exploreState(page) {
  const chip = page.locator('[data-testid="explore-chip"]');
  await chip.waitFor({ state: "visible", timeout: 15_000 });
  await chip.click();
  const slider = page.locator('[data-testid="widget-card"] input[type=range]').first();
  await slider.waitFor({ state: "visible", timeout: 15_000 });
  const ticked = await page.locator('[data-testid="widget-card"] [data-testid="guided-tasks"] li[data-state="done"]').count();
  return { value: await slider.inputValue(), ticked };
}

/** Part 8 #6 of the fix file: a reload and a tab switch keep slider values and ticked Guided Tasks. */
async function keptAfterReloadAndTabSwitch(browser, learner) {
  const { context, page } = await openContext(browser, learner);
  try {
    let moved;
    await step("kept: slider values and ticks before the reload", async () => {
      await page.goto(`${BASE}/study`, { waitUntil: "networkidle" });
      await exploreState(page);
      for (const rate of [0, 2]) await setSlider(page, '[data-testid="widget-card"]', rate);
      // The Widget's state is posted a moment after the last move.
      await page.waitForTimeout(1_500);
      moved = await exploreState(page);
      if (moved.value !== "2") throw new Error(`the slider shows ${moved.value} after it was set to 2`);
      if (moved.ticked < 2) throw new Error(`expected the 0% and 2% Guided Tasks ticked, saw ${moved.ticked}`);
      await shot(page, "kept-1-before-reload");
    });
    if (!moved) return;
    const same = async (label) => {
      const now = await exploreState(page);
      if (now.value !== moved.value || now.ticked < moved.ticked) throw new Error(`${label}: slider ${now.value} with ${now.ticked} ticked, expected ${moved.value} with ${moved.ticked}`);
    };
    await step("kept: after a reload", async () => {
      await page.reload({ waitUntil: "networkidle" });
      await same("after a reload");
      await shot(page, "kept-2-after-reload");
    });
    await step("kept: after switching the panel's tabs", async () => {
      await page.locator('[role=group][aria-label="Widgets in this Session"] button:not([data-testid="explore-chip"])').first().click();
      await page.locator('[data-testid="widget-card"] [data-testid="formula-card"]').first().waitFor({ state: "visible", timeout: 15_000 });
      await same("after switching the panel's tabs");
    });
    await step("kept: in a second browser tab, and back in the first", async () => {
      const second = await context.newPage();
      await second.goto(`${BASE}/study`, { waitUntil: "networkidle" });
      const there = await exploreState(second);
      if (there.value !== moved.value || there.ticked < moved.ticked) throw new Error(`the second tab shows slider ${there.value} with ${there.ticked} ticked`);
      await shot(second, "kept-3-second-tab");
      await page.bringToFront();
      await same("back in the first tab");
    });
  } finally {
    await context.close();
  }
}

/**
 * Part 8 #3 of the fix file: with a quiz open, the last Tutor message and the message box are on screen, and the
 * page itself doesn't grow past the window (the conversation scrolls inside its column instead).
 */
async function assertQuizLayout(page) {
  const quiz = page.locator('[data-testid="quiz"]');
  await quiz.waitFor({ state: "visible", timeout: 15_000 });
  const box = page.getByRole("textbox", { name: "Message" });
  await box.waitFor({ state: "visible", timeout: 15_000 });
  const last = page.locator('[data-testid="assistant-message"]').last();
  await last.waitFor({ state: "visible", timeout: 15_000 });
  const { innerHeight, scrollHeight } = await page.evaluate(() => ({ innerHeight: window.innerHeight, scrollHeight: document.documentElement.scrollHeight }));
  if (scrollHeight > innerHeight + 1) throw new Error(`the page grew to ${scrollHeight}px in a ${innerHeight}px window`);
  const boxAt = await box.boundingBox();
  if (!boxAt || boxAt.y < 0 || boxAt.y + boxAt.height > innerHeight + 1) throw new Error("the message box is not on screen");
  const lastAt = await last.boundingBox();
  if (!lastAt || lastAt.y + lastAt.height <= 0 || lastAt.y >= innerHeight) throw new Error("the last Tutor message is not on screen");
  // On screen also means not hidden behind the scrolled conversation column.
  const inColumn = await last.evaluate((el) => {
    const column = el.closest('[data-testid="thread-viewport"]');
    if (!column) return true;
    const a = el.getBoundingClientRect();
    const b = column.getBoundingClientRect();
    return a.bottom > b.top && a.top < b.bottom;
  });
  if (!inColumn) throw new Error("the last Tutor message is scrolled out of the conversation column");
}

async function quizLayout(browser, learner) {
  const { context, page } = await openContext(browser, learner);
  try {
    await step("quiz open: last Tutor message and message box on screen, page no taller than the window", async () => {
      await page.goto(`${BASE}/study`, { waitUntil: "networkidle" });
      await assertQuizLayout(page);
      await shot(page, "quiz-open-layout");
    });
  } finally {
    await context.close();
  }
}

async function noteShots(browser, learner, size, theme) {
  const tag = `${size}-${theme}`;
  const { context, page } = await openContext(browser, learner, size, theme);
  try {
    await step(`${tag}: Notes`, async () => {
      await page.goto(`${BASE}/notes`, { waitUntil: "networkidle" });
      await page.getByText("A high rate shrinks later payments", { exact: false }).first().waitFor({ timeout: 15_000 });
      await shot(page, `${tag}-6-notes`);
    });
    await step(`${tag}: Settings`, async () => {
      await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
      await page.locator("form").first().waitFor({ timeout: 10_000 });
      await shot(page, `${tag}-7-settings`);
    });
  } finally {
    await context.close();
  }
}

// ---------- the first-visit walk ----------

const squash = (text) => String(text ?? "").replace(/\s+/g, " ").trim();

/** The Topic file's own quiz questions, each with its choice texts and the right one's text. */
function keyedQuestions(topicId) {
  const topic = parse(readFileSync(join(process.cwd(), "course", "topics", `${topicId}.yaml`), "utf8"));
  return (topic.questions ?? []).map((q) => ({ choices: q.choices.map((c) => squash(c.text)), answer: squash(q.choices.find((c) => c.id === q.answer)?.text) }));
}

/** Waits for what the Learner can press next: the quiz, the Check tab, a Next chip, or Just tell me. */
async function nextPress(page, timeoutMs = 240_000) {
  const quiz = page.locator('[data-testid="quiz"]');
  const result = page.locator('[data-testid="quiz-result"]');
  const checkTab = page.locator('[data-testid="check-tab"]');
  const next = page.getByRole("button", { name: /^Next: .* →$/ });
  const tellMe = page.getByRole("button", { name: "Just tell me →" });
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await result.isVisible()) return { kind: "result" };
    if (await quiz.isVisible()) return { kind: "quiz" };
    if (await next.first().isVisible()) return { kind: "next", button: next.first() };
    if (await tellMe.isVisible()) return { kind: "next", button: tellMe };
    if ((await checkTab.isVisible()) && !(await quiz.isVisible())) return { kind: "tab", button: checkTab };
    await page.waitForTimeout(1_000);
  }
  throw new Error("nothing to press appeared: no Next chip, no Just tell me and no quiz");
}

/** Picks each question's right answer by its name, from the Topic file's answer key, and submits. */
async function answerQuiz(page, topicId) {
  const keyed = keyedQuestions(topicId);
  const quiz = page.locator('[data-testid="quiz"]');
  const sets = quiz.locator("fieldset");
  for (let i = 0; i < (await sets.count()); i++) {
    const set = sets.nth(i);
    const shown = (await set.locator("label").allInnerTexts()).map(squash);
    const question = keyed.find((q) => q.choices.length === shown.length && q.choices.every((c) => shown.includes(c)));
    if (!question) throw new Error(`question ${i + 1} is not one of the Topic file's own questions, so its answer is unknown`);
    await set.getByRole("radio", { name: question.answer, exact: true }).check();
  }
  await page.getByRole("button", { name: "Submit answers" }).click();
}

/** Part 1's "Done when": sign-in → Welcome → Start this Topic → Next chips → quiz → passed, pressing only named buttons. */
async function firstVisitWalk(browser) {
  // Start over first, so the walk begins from an empty tools Learner; the browser then signs in by itself.
  await freshToolsLearner();
  const context = await browser.newContext({ viewport: SIZES.laptop, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    let topicId;
    await step("walk: sign-in opens the Welcome", async () => {
      await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
      await page.getByLabel("Passcode", { exact: true }).fill(PASSCODE);
      await page.getByRole("button", { name: "Enter", exact: true }).click();
      await page.waitForURL(/\/welcome/, { timeout: 30_000 });
      await page.getByText("How a Topic works").waitFor({ timeout: 10_000 });
      await shot(page, "walk-1-welcome");
    });
    await step("walk: Skip, then Start this Topic", async () => {
      await page.getByRole("link", { name: "Skip", exact: true }).click();
      const start = page.getByRole("button", { name: "Start this Topic", exact: true });
      await start.waitFor({ timeout: 10_000 });
      topicId = await page.locator("[data-first-topic]").getAttribute("data-first-topic");
      await start.click();
      await page.waitForURL(/\/study/, { timeout: 30_000 });
      await shot(page, "walk-2-study");
    });
    if (!topicId) return;
    await step("walk: Next chips up to the quiz, then the quiz passed", async () => {
      let presses = 0;
      for (;;) {
        const press = await nextPress(page);
        if (press.kind === "result") {
          const verdict = squash(await page.locator('[data-testid="quiz-result"] p').first().innerText());
          await shot(page, "walk-4-quiz-result");
          if (!/Passed\./.test(verdict)) throw new Error(`the quiz was not passed: ${verdict}`);
          return;
        }
        if (press.kind === "quiz") {
          await assertQuizLayout(page);
          await shot(page, "walk-3-quiz-open");
          await answerQuiz(page, topicId);
          await page.locator('[data-testid="quiz-result"]').waitFor({ timeout: 30_000 });
          continue;
        }
        if (++presses > 12) throw new Error("twelve presses without reaching the quiz");
        const name = squash(await press.button.innerText());
        await press.button.click();
        console.log(`      pressed ${name}`);
        if (press.kind === "next") await press.button.waitFor({ state: "hidden", timeout: 30_000 }).catch(() => {});
      }
    });
  } finally {
    await context.close();
  }
}

// ---------- the run ----------

const browser = await chromium.launch();
try {
  // Widget state is saved per Session, so each size and theme gets its own fresh Learner and starts from the defaults.
  for (const size of Object.keys(SIZES)) for (const theme of THEMES) await studyShots(browser, await seeded("explore"), size, theme);
  await keptAfterReloadAndTabSwitch(browser, await seeded("explore"));
  await quizLayout(browser, await seeded("quiz"));
  const passed = await seeded("passed");
  for (const size of Object.keys(SIZES)) for (const theme of THEMES) await noteShots(browser, passed, size, theme);
  if (skipWalk) console.log("skip  the first-visit walk (--skip-walk)");
  else await firstVisitWalk(browser);
} finally {
  await browser.close();
}
writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2));
const failed = report.filter((r) => !r.ok);
console.log(`${report.length - failed.length} ok, ${failed.length} failed. Screenshots and report.json are in ${out}`);
process.exit(failed.length ? 1 : 0);
