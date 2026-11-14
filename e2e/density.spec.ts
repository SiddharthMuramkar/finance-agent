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

// ADR 0013 moves A2's 15/24 to 16/26 (--text-chat, --lh-chat), with the reply capped at about 68 characters of Inter.
test("[A2] chat type is 16/26", async ({ page }, info) => {
  test.skip(info.project.name !== "mbp14", "measured at 1512×982");
  await study(page);
  expect((await measureLayout(page)).chatFontPx).toBe(16);
  const lh = await page
    .locator('[data-testid="assistant-message"] p:not([data-testid="tutor-label"])')
    .first()
    .evaluate((el) => getComputedStyle(el).lineHeight);
  expect(lh).toBe("26px");
});

test("[A2] header is slim", async ({ page }, info) => {
  test.skip(!["mbp14", "w1024"].includes(info.project.name), "measured at 1512 and 1024");
  await seed(page, "many-topics");
  for (const path of ["/study", "/course", "/settings"]) {
    await page.goto(path);
    // A cold compile can show the route skeleton (its own header) before the page: wait for it to go.
    await expect(page.getByTestId("route-skeleton")).toHaveCount(0);
    await expect(page.locator("header")).toHaveCount(1);
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
