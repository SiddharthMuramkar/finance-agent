import { expect, test } from "@playwright/test";
import { hydrated, seed } from "./support/app";

/** B1 (spec 2026-11-05): the Course Map shows progress, and the old Progress address redirects to it. */

test.beforeEach(async ({ page }) => {
  await seed(page, "many-topics");
});

test("old Progress link lands on the map", async ({ page }) => {
  const response = await page.request.get("/progress", { maxRedirects: 0 });
  expect(response.status()).toBe(308);
  expect(new URL(response.headers()["location"] ?? "", "http://x").pathname).toBe("/course");
  await page.goto("/progress");
  await expect(page).toHaveURL(/\/course$/);
  await expect(page.getByRole("heading", { level: 1, name: "Course Map" })).toBeVisible();
});

test("map is wide", async ({ page }, info) => {
  test.skip(info.project.name !== "mbp14", "measured at 1512×982");
  await page.goto("/course");
  const group = page.locator("details[data-subject][open]").first();
  await expect(group).toBeVisible();
  const cards = await group.locator("li[data-topic]").evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  const firstRow = cards.filter((top) => top === cards[0]);
  expect(firstRow.length, "Topic cards in the first row").toBeGreaterThanOrEqual(3);
  const gutters = await page.evaluate(() => {
    const r = document.querySelector('[data-testid="reading-column"]')!.getBoundingClientRect();
    return { left: r.left, right: document.documentElement.clientWidth - r.right };
  });
  expect(gutters.left).toBeLessThanOrEqual(32);
  expect(gutters.right).toBeLessThanOrEqual(32);
});

test("rows still open Topics", async ({ page }) => {
  test.setTimeout(120_000); // the dev server compiles /study and the Session page on first visit
  await page.goto("/course");
  await expect(page.locator("[data-progress-summary]")).toContainText("passed");
  await hydrated(page);

  await page.locator("details:not([open]) > summary").evaluateAll((els) => els.forEach((el) => (el.parentElement as HTMLDetailsElement).setAttribute("open", "")));

  // A not-started Topic with nothing to do first: its card chooses it and opens the Study Workspace on it.
  const card = page.locator('li[data-topic][data-status="not_started"]:not(:has([data-jump]))').first();
  await card.scrollIntoViewIfNeeded();
  const title = (await card.locator("[data-row-link]").innerText()).trim();
  await card.locator("[data-row-link]").click();
  await expect(page).toHaveURL(/\/study$/, { timeout: 60_000 });
  await expect(page.getByTestId("topic-bar")).toContainText(title);

  // A passed Topic opens its Session read-only.
  await page.goto("/course");
  const passed = page.locator('li[data-topic][data-status="passed"] [data-row-link]').first();
  await passed.click();
  await expect(page).toHaveURL(/\/sessions\/\d+$/, { timeout: 60_000 });
});
