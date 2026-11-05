import { expect, test, type Page } from "@playwright/test";
import { say, seed, type Script } from "./support/app";
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
  test.fail(true, "[A1] full-screen workspace");
  await study(page);
  const m = await measureLayout(page);
  expect(m.gutterLeft).toBeLessThanOrEqual(32);
  expect(m.gutterRight).toBeLessThanOrEqual(32);
});

test("[A1] side gutter at 1512×982 on /course is 32 px or less each side", async ({ page }) => {
  test.fail(true, "[A1] full-screen reading pages");
  await seed(page, "many-topics");
  await page.goto("/course");
  await expect(page.getByTestId("reading-column")).toBeVisible();
  const m = await measureLayout(page);
  expect(m.gutterLeft).toBeLessThanOrEqual(32);
  expect(m.gutterRight).toBeLessThanOrEqual(32);
});

test("[A1] Widget panel width at 1512 is 55 % of the viewport or more", async ({ page }) => {
  test.fail(true, "[A1] the Widget panel is the star");
  await study(page, "concept-widget");
  expect((await measureLayout(page)).panelWidthPct).toBeGreaterThanOrEqual(55);
});

test("[A2] header height is 56 px or less and the chat body font is 15 px", async ({ page }) => {
  // The header alone already measures 36 px today, so the font (A2's other metric, §1.1 row 9) keeps this target red.
  test.fail(true, "[A2] denser workspace");
  await study(page);
  const m = await measureLayout(page);
  expect(m.headerHeight).toBeLessThanOrEqual(56);
  expect(m.chatFontPx).toBe(15);
});

test("[A3b] interactive elements without a signifier and non-interactive elements with cursor:pointer are 0", async ({ page }) => {
  test.fail(true, "[A3b] buttons look like buttons");
  await study(page, "concept-widget");
  const audit = await auditAffordances(page);
  expect(audit.interactiveWithoutSignifier).toEqual([]);
  expect(audit.pointerOnStatic).toEqual([]);
});

test("[A5] the header has a gear with the name Settings and no Settings text link", async ({ page }) => {
  test.fail(true, "[A5] Settings is a gear icon");
  await study(page);
  const header = page.locator("header");
  await expect(header.getByRole("button", { name: "Settings", exact: true }).or(header.getByRole("link", { name: "Settings", exact: true }).filter({ has: page.locator("svg") }))).toHaveCount(1);
  await expect(header.getByRole("link", { name: "Settings", exact: true }).filter({ hasText: "Settings" })).toHaveCount(0);
});

test("[B1] old page redirects: GET /progress answers 308 to /course", async ({ page }) => {
  test.fail(true, "[B1] Course Map shows progress");
  await seed(page, "many-topics");
  const response = await page.request.get("/progress", { maxRedirects: 0 });
  expect(response.status()).toBe(308);
  expect(new URL(response.headers()["location"] ?? "", "http://x").pathname).toBe("/course");
});

test("[B2a] /notebook renders", async ({ page }) => {
  test.fail(true, "[B2a] Notebook");
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

test("[E4a] Widget on 100 % of replies (scripted): 4 of 4", async ({ page }) => {
  test.fail(true, "[E4a] a Widget with every reply");
  await study(page);
  const scripts: Script[] = ["story-reply", "concept-reply-widget", "plain-reply", "quiz-open"];
  let withWidget = 0;
  for (const name of scripts) {
    const before = await page.getByTestId("widget-chip").count();
    await say(page, name, `A message for ${name}.`);
    if ((await page.getByTestId("widget-chip").count()) > before) withWidget++;
  }
  expect(withWidget).toBe(scripts.length);
});
