import { expect, test, type Page } from "@playwright/test";
import { seed } from "./support/app";
import { measureLayout } from "./support/measure";

/**
 * Today's numbers, measured (spec 2026-11-05 §2.1, T-00 test 8). Green on main until A1 lands: it fails loudly if the
 * layout drifts before then. A1 replaces these expectations with its own targets (e2e/targets.spec.ts).
 */

/** The widths of the workspace frame's two columns, in px. */
const columns = (page: Page) =>
  page.locator('[data-testid="workspace-frame"] > *').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width)));

const near = (actual: number | null, expected: number) => expect(actual).toBeGreaterThanOrEqual(expected - 2) && expect(actual).toBeLessThanOrEqual(expected + 2);

test.describe("today's numbers, measured", () => {
  test("side gutters and columns at mbp14 on /study and /course", async ({ page }, info) => {
    test.skip(info.project.name !== "mbp14", "measured at 1512×982");
    await seed(page, "story");
    await page.goto("/study");
    await expect(page.getByTestId("workspace-frame")).toBeVisible();
    const study = await measureLayout(page);
    near(study.gutterLeft, 204);
    near(study.gutterRight, 204);
    const [chat, panel] = await columns(page);
    near(chat, 536);
    near(panel, 536);

    await page.goto("/course");
    await expect(page.getByTestId("reading-column")).toBeVisible();
    const course = await measureLayout(page);
    const column = await page.getByTestId("reading-column").evaluate((el) => el.getBoundingClientRect().width);
    near(column, 672);
    near(course.gutterLeft, 420);
    near(course.gutterRight, 420);
  });

  test("side gutters at w1280 on /study and /course", async ({ page }, info) => {
    test.skip(info.project.name !== "w1280", "measured at 1280×800");
    await seed(page, "story");
    await page.goto("/study");
    await expect(page.getByTestId("workspace-frame")).toBeVisible();
    const study = await measureLayout(page);
    near(study.gutterLeft, 88);
    near(study.gutterRight, 88);

    await page.goto("/course");
    await expect(page.getByTestId("reading-column")).toBeVisible();
    const course = await measureLayout(page);
    near(course.gutterLeft, 304);
    near(course.gutterRight, 304);
  });
});
