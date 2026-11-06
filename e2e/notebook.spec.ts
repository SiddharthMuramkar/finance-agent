import { expect, test } from "@playwright/test";
import { seed } from "./support/app";

/** B2a (spec 2026-11-05): one Notebook for notes and past Sessions; the old addresses redirect to it. */

test.beforeEach(async ({ page }) => {
  await seed(page, "many-topics");
});

test("old addresses still work", async ({ page }) => {
  test.setTimeout(120_000); // the dev server compiles each page on first visit
  for (const from of ["/sessions", "/notes"]) {
    const hop = await page.request.get(from, { maxRedirects: 0 });
    expect(hop.status(), `${from} first hop`).toBe(308);
    expect(new URL(hop.headers()["location"] ?? "", "http://x").pathname).toBe("/notebook");
  }
  await page.goto("/sessions");
  await expect(page).toHaveURL(/\/notebook$/);
  await expect(page.getByRole("heading", { level: 1, name: "Notebook" })).toBeVisible();

  const row = page.locator("[data-notebook-row]").first();
  const topicId = await row.getAttribute("data-notebook-row");
  await page.goto(`/notes#note-${topicId}`);
  await expect(page).toHaveURL(new RegExp(`/notebook#note-${topicId}$`));

  const read = page.locator("[data-notebook-row]").getByRole("link", { name: "Read" }).first();
  await expect(read).toBeVisible();
  await read.click();
  await expect(page).toHaveURL(/\/sessions\/\d+$/);
  await expect(page.getByTestId("old-session")).toBeVisible();
  await expect(page.getByRole("link", { name: "← Notebook" })).toBeVisible();
});

test("notebook is wide", async ({ page }, info) => {
  test.skip(info.project.name !== "mbp14", "measured at 1512×982");
  await page.goto("/notebook?all=1");
  const tops = await page.locator("[data-notebook-row]").evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  expect(tops.filter((t) => t === tops[0]).length, "rows in the first line").toBeGreaterThanOrEqual(3);
  const gutters = await page.evaluate(() => {
    const r = document.querySelector('[data-testid="reading-column"]')!.getBoundingClientRect();
    return { left: r.left, right: document.documentElement.clientWidth - r.right };
  });
  expect(gutters.left).toBeLessThanOrEqual(32);
  expect(gutters.right).toBeLessThanOrEqual(32);
});
