import { expect, test, type Page } from "@playwright/test";

// E2a: the five story parts, drawn from their /dev/widgets fixtures. Layout at two widths, controls that read as
// buttons, and motion that stops under reduced motion and plays otherwise.

const FIXTURES = ["story-scene", "lingo-card", "timeline-strip", "two-paths", "money-jar"];
const WIDTHS = [560, 860];

async function open(page: Page, fixture: string, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/dev/widgets?fixture=${fixture}`);
  await expect(page.getByTestId("widget-card")).toBeVisible();
}

for (const fixture of FIXTURES) {
  for (const width of WIDTHS) {
    test(`${fixture} at ${width}px: no overflow, buttons are big enough and show a pointer`, async ({ page }) => {
      await open(page, fixture, width);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, "horizontal overflow").toBeLessThanOrEqual(0);
      const buttons = page.getByTestId("widget-card").getByRole("button");
      const count = await buttons.count();
      for (let i = 0; i < count; i++) {
        const button = buttons.nth(i);
        if (!(await button.isVisible()) || !(await button.isEnabled())) continue;
        const box = await button.boundingBox();
        expect(box!.height, `button ${i} height`).toBeGreaterThanOrEqual(28);
        expect(box!.width, `button ${i} width`).toBeGreaterThanOrEqual(28);
        expect(await button.evaluate((el) => getComputedStyle(el).cursor), `button ${i} cursor`).toBe("pointer");
      }
    });
  }

  test(`${fixture}: with reduced motion nothing is animating after a click`, async ({ page }) => {
    await open(page, fixture, 860);
    const first = page.getByTestId("widget-card").locator("button:enabled").first();
    if (await first.count()) await first.click();
    await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
  });
}

test.describe("motion allowed", () => {
  test.use({ reducedMotion: "no-preference" });

  test("StoryScene plays an animation when it mounts", async ({ page }) => {
    await page.setViewportSize({ width: 860, height: 900 });
    await page.goto("/dev/widgets?fixture=story-scene");
    await expect(page.getByTestId("widget-card")).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBeGreaterThanOrEqual(1);
  });
});
