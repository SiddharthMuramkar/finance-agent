import { expect, test, type Page } from "@playwright/test";
import { seed } from "./support/app";
import { measureLayout } from "./support/measure";

/** A2: the app is compact (spec 2026-11-05, ticket A2, §6.2). Expected numbers are the spec's. */

async function study(page: Page) {
  await seed(page, "story");
  await page.goto("/study");
  await expect(page.getByTestId("workspace-frame")).toBeVisible();
  await expect(page.getByTestId("assistant-message").first()).toBeVisible();
}

test("[A2] chat type is 15/24", async ({ page }, info) => {
  test.skip(info.project.name !== "mbp14", "measured at 1512×982");
  await study(page);
  expect((await measureLayout(page)).chatFontPx).toBe(15);
  const lh = await page
    .locator('[data-testid="assistant-message"] p:not([data-testid="tutor-label"])')
    .first()
    .evaluate((el) => getComputedStyle(el).lineHeight);
  expect(lh).toBe("24px");
});

test("[A2] header is slim", async ({ page }, info) => {
  test.skip(!["mbp14", "w1024"].includes(info.project.name), "measured at 1512 and 1024");
  await seed(page, "many-topics");
  for (const path of ["/study", "/course", "/settings"]) {
    await page.goto(path);
    await expect(page.locator("header")).toBeVisible();
    const m = await measureLayout(page);
    expect(m.headerHeight, path).toBeLessThanOrEqual(56);
  }
});

test("[A2] chat has room", async ({ page }, info) => {
  test.skip(info.project.name !== "mbp14", "measured at 1512×982");
  await study(page);
  const h = await page.getByTestId("thread-viewport").evaluate((el) => el.getBoundingClientRect().height);
  expect(h).toBeGreaterThanOrEqual(638);
});
