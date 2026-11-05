import { expect, test, type Page } from "@playwright/test";
import { seed } from "./support/app";
import { measureLayout } from "./support/measure";

/**
 * The page frame's numbers, measured (spec 2026-11-05 §2.1, T-00 test 8; rewritten by A1). The gutter is
 * clamp(12px, 1.6vw, 32px): 24.2 px at 1512 and 20.5 px at 1280. The columns are 2fr / 3fr inside it.
 */

/** The widths of the workspace frame's two columns, in px. */
const columns = (page: Page) =>
  page.locator('[data-testid="workspace-frame"] > *').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width)));

/** Within 2 px of the spec's figure. */
function near(actual: number | null | undefined, expected: number) {
  expect(actual).toBeGreaterThanOrEqual(expected - 2);
  expect(actual).toBeLessThanOrEqual(expected + 2);
}

test.describe("the page frame's numbers, measured", () => {
  test("side gutters and columns at mbp14 on /study and /course", async ({ page }, info) => {
    test.skip(info.project.name !== "mbp14", "measured at 1512×982");
    await seed(page, "story");
    await page.goto("/study");
    await expect(page.getByTestId("workspace-frame")).toBeVisible();
    const study = await measureLayout(page);
    near(study.gutterLeft, 24);
    near(study.gutterRight, 24);
    const [chat, panel] = await columns(page);
    near(chat, 576);
    near(panel, 864);

    await page.goto("/course");
    await expect(page.getByTestId("reading-column")).toBeVisible();
    const course = await measureLayout(page);
    const column = await page.getByTestId("reading-column").evaluate((el) => el.getBoundingClientRect().width);
    expect(column).toBeGreaterThanOrEqual(1448);
    near(course.gutterLeft, 24);
    near(course.gutterRight, 24);
  });

  test("side gutters at w1280 on /study and /course", async ({ page }, info) => {
    test.skip(info.project.name !== "w1280", "measured at 1280×800");
    await seed(page, "story");
    await page.goto("/study");
    await expect(page.getByTestId("workspace-frame")).toBeVisible();
    const study = await measureLayout(page);
    near(study.gutterLeft, 20);
    near(study.gutterRight, 20);

    await page.goto("/course");
    await expect(page.getByTestId("reading-column")).toBeVisible();
    const course = await measureLayout(page);
    near(course.gutterLeft, 20);
    near(course.gutterRight, 20);
  });
});
