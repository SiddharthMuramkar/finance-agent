import { expect, test, type Page } from "@playwright/test";
import { say, seed } from "./support/app";
import { measureLayout } from "./support/measure";

/**
 * A1: the Study Workspace and every reading page use the whole window (spec 2026-11-05, ticket A1, §6.2). Each test
 * runs in the project whose viewport it names and is skipped in the others. Expected numbers are the spec's.
 */

async function study(page: Page) {
  await seed(page, "story");
  await page.goto("/study");
  await expect(page.getByTestId("workspace-frame")).toBeVisible();
}

test.describe("study fills the window", () => {
  test("[A1] study fills the window at 1512×982", async ({ page }, info) => {
    test.skip(info.project.name !== "mbp14", "measured at 1512×982");
    await study(page);
    const m = await measureLayout(page);
    expect(m.gutterLeft).toBeLessThanOrEqual(32);
    expect(m.gutterRight).toBeLessThanOrEqual(32);
    expect(m.chatWidthPct).toBeGreaterThanOrEqual(36);
    expect(m.chatWidthPct).toBeLessThanOrEqual(42);
    expect(m.panelWidthPct).toBeGreaterThanOrEqual(55);
    expect(m.horizontalScroll).toBe(false);
  });

  test("[A1] study at other laptops: 1280×800", async ({ page }, info) => {
    test.skip(info.project.name !== "w1280", "measured at 1280×800");
    await study(page);
    const m = await measureLayout(page);
    expect(m.gutterLeft).toBeLessThanOrEqual(24);
    expect(m.gutterRight).toBeLessThanOrEqual(24);
    expect(m.panelWidthPct).toBeGreaterThanOrEqual(55);
  });

  test("[A1] study at other laptops: 1920×1080", async ({ page }, info) => {
    test.skip(info.project.name !== "w1920", "measured at 1920×1080");
    await study(page);
    const m = await measureLayout(page);
    expect(m.gutterLeft).toBeLessThanOrEqual(32);
    expect(m.gutterRight).toBeLessThanOrEqual(32);
    expect(m.panelWidthPct).toBeGreaterThanOrEqual(55);
  });

  test("[A1] study at other laptops: 1024×768", async ({ page }, info) => {
    test.skip(info.project.name !== "w1024", "measured at 1024×768");
    await study(page);
    const m = await measureLayout(page);
    expect(m.gutterLeft).toBeLessThanOrEqual(17);
    expect(m.gutterRight).toBeLessThanOrEqual(17);
    expect(m.horizontalScroll).toBe(false);
    const chat = await page.getByTestId("chat-column").evaluate((el) => el.getBoundingClientRect().width);
    expect(chat).toBeGreaterThanOrEqual(360);
  });
});

test("[A1] reading pages fill the window", async ({ page }, info) => {
  test.skip(info.project.name !== "mbp14", "measured at 1512×982");
  await seed(page, "many-topics");
  for (const path of ["/course", "/notebook", "/settings"]) {
    await page.goto(path);
    await expect(page.getByTestId("reading-column"), path).toBeVisible();
    const width = await page.getByTestId("reading-column").evaluate((el) => el.getBoundingClientRect().width);
    expect(width, `${path} reading column`).toBeGreaterThanOrEqual(1448);
    const m = await measureLayout(page);
    expect(m.gutterLeft, `${path} left gutter`).toBeLessThanOrEqual(32);
    expect(m.gutterRight, `${path} right gutter`).toBeLessThanOrEqual(32);
  }
});

test("[A1] chat lines are readable", async ({ page }, info) => {
  const bands: Record<string, [number, number]> = { w1280: [60, 75], mbp14: [60, 75], w1920: [60, 75], w1024: [48, 80] };
  const band = bands[info.project.name];
  test.skip(!band, "measured at 1024, 1280, 1512 and 1920");
  await study(page);
  await say(page, "story-reply", "Tell me a story about rates.");
  // Pin a font with the same metrics on Mac (Arial) and on the CI image (Liberation Sans), so the count does not
  // depend on which system font each machine falls back to.
  await page.addStyleTag({ content: 'body, body * { font-family: Arial, "Liberation Sans", sans-serif !important; }' });
  await page.evaluate(() => document.fonts.ready);
  const m = await measureLayout(page);
  expect(m.charsPerLine).not.toBeNull();
  expect(m.charsPerLine).toBeGreaterThanOrEqual(band![0]);
  expect(m.charsPerLine).toBeLessThanOrEqual(band![1]);
});
