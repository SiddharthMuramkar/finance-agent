import { expect, test } from "@playwright/test";
import { seed } from "./support/app";
import { measureLayout } from "./support/measure";

/** The same gutters in the dark project (spec 2026-11-05, T-00 test 10): the site follows the computer's dark setting. */
test("side gutter at 1512×982 in the dark: the numbers of the baseline hold on /study", async ({ page }, info) => {
  test.skip(info.project.name !== "mbp14-dark", "the dark project only");
  await seed(page, "story");
  await page.goto("/study");
  await expect(page.getByTestId("workspace-frame")).toBeVisible();
  // The dark theme, as src/app/theme.ts sets it today: the `dark` class on <html>.
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  const m = await measureLayout(page);
  expect(m.gutterLeft).toBeGreaterThanOrEqual(202);
  expect(m.gutterLeft).toBeLessThanOrEqual(206);
  expect(m.gutterRight).toBeGreaterThanOrEqual(202);
  expect(m.gutterRight).toBeLessThanOrEqual(206);
});
