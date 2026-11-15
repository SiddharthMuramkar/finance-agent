import { expect, test, type Page } from "@playwright/test";
import { hydrated, replyLanded, say, script, seed, type Script } from "./support/app";
import { auditAffordances, measureLayout } from "./support/measure";

/**
 * The targets, red until their ticket (spec 2026-11-05 §6.2, T-00 test 9). Each is marked expected-to-fail, tagged with
 * its ticket id in square brackets; that ticket deletes its own marker lines in its PR and the targets must pass. A
 * target that passes while still marked is reported as a failure, so a fix that forgets to flip its line goes red.
 * Measured at mbp14 (1512×982) only.
 */

test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "mbp14", "the targets are measured at 1512×982");
});

async function study(page: Page, state: Parameters<typeof seed>[1] = "story") {
  await seed(page, state);
  await page.goto("/study");
  await expect(page.getByTestId("workspace-frame")).toBeVisible();
}

test("[A1] side gutter at 1512×982 on /study is 32 px or less each side", async ({ page }) => {
  await study(page);
  const m = await measureLayout(page);
  expect(m.gutterLeft).toBeLessThanOrEqual(32);
  expect(m.gutterRight).toBeLessThanOrEqual(32);
});

test("[A1] side gutter at 1512×982 on /course is 32 px or less each side", async ({ page }) => {
  await seed(page, "many-topics");
  await page.goto("/course");
  await expect(page.getByTestId("reading-column")).toBeVisible();
  const m = await measureLayout(page);
  expect(m.gutterLeft).toBeLessThanOrEqual(32);
  expect(m.gutterRight).toBeLessThanOrEqual(32);
});

test("[A1] Widget panel width at 1512 is 52 % of the viewport or more", async ({ page }) => {
  await study(page, "concept-widget");
  expect((await measureLayout(page)).panelWidthPct).toBeGreaterThanOrEqual(52);
});

test("[A2] header height is 56 px or less and the chat body font is 16 px", async ({ page }) => {
  await study(page);
  const m = await measureLayout(page);
  expect(m.headerHeight).toBeLessThanOrEqual(56);
  expect(m.chatFontPx).toBe(16);
});

test("[A3b] interactive elements without a signifier, non-interactive elements with cursor:pointer, and app controls that are not flat are 0", async ({ page }) => {
  await study(page, "concept-widget");
  await hydrated(page);
  const audit = await auditAffordances(page);
  expect(audit.interactiveWithoutSignifier).toEqual([]);
  expect(audit.pointerOnStatic).toEqual([]);
  // ADR 0018: anywhere, Widgets included, no control lifts on a shadow, moves or is rounder than 12px.
  expect(audit.notFlat).toEqual([]);
});

test("[A5] the header has a gear with the name Settings and no Settings text link", async ({ page }) => {
  await study(page);
  const header = page.locator("header");
  await expect(header.getByRole("button", { name: "Settings", exact: true }).or(header.getByRole("link", { name: "Settings", exact: true }).filter({ has: page.locator("svg") }))).toHaveCount(1);
  await expect(header.getByRole("link", { name: "Settings", exact: true }).filter({ hasText: "Settings" })).toHaveCount(0);
});

test("[B1] old page redirects: GET /progress answers 308 to /course", async ({ page }) => {
  await seed(page, "many-topics");
  const response = await page.request.get("/progress", { maxRedirects: 0 });
  expect(response.status()).toBe(308);
  expect(new URL(response.headers()["location"] ?? "", "http://x").pathname).toBe("/course");
});

test("[B2a] /notebook renders", async ({ page }) => {
  await seed(page, "many-topics");
  const response = await page.goto("/notebook");
  expect(response?.status()).toBe(200);
});

test("[D1a] typed-number inputs in the Learner UI: none on an open quiz", async ({ page }) => {
  await study(page, "quiz-open");
  await page.waitForLoadState("networkidle");
  await expect(page.locator('input[inputmode="decimal"]')).toHaveCount(0);
  // The OpenUI devtools overlay (dev server only) has a disabled "Chunk seed" number box; it is not the Learner's UI.
  await expect(page.locator('input[type="number"]:not([aria-label="Chunk seed"]), input[inputmode="numeric"]')).toHaveCount(0);
});

// B6 (ADR 0008) replaces E4a's "Widget on 100 % of replies": a reply changes the Widget only when a better one fits.
test("[B6] a Widget when it fits (scripted): the step's own Widget, a Lingo card when a word is asked, else the panel stays", async ({ page }) => {
  // The opener plays a Widget-free script and lands (with the story step's own scene) before anything is counted.
  await seed(page, "story");
  await script(page, "story-reply");
  await page.goto("/study");
  await replyLanded(page);
  const chips = () => page.getByTestId("widget-chip").count();
  // A Choice's words each time, so every reply is step-led (an own question's reply gets no Companion at all).
  const turns: { script: Script; words: string; adds: number }[] = [
    { script: "concept-reply-widget", words: "Show me.", adds: 1 }, // the reply shows its own Widget
    { script: "plain-reply", words: "What happened next?", adds: 0 }, // no Widget of its own, no word asked: the panel stays
    { script: "plain-reply", words: "What does 'basis point' mean?", adds: 1 }, // the word asked: its Lingo card
  ];
  for (const t of turns) {
    const before = await chips();
    await say(page, t.script, t.words);
    expect(await chips(), `${t.script} after "${t.words}"`).toBe(before + t.adds);
  }
});
