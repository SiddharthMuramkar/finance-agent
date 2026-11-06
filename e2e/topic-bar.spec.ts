import { expect, test } from "@playwright/test";
import { seed } from "./support/app";

/**
 * #313: the compact Topic bar. On the Percent Topic (four Checks) the bar is two rows, about 80 px tall (it was
 * 128 / 168 / 192 px when the strip wrapped), its strip stays on one line, and the current step is scrolled into
 * the strip's view. Measured at 1512×982 and 768×1024, so it runs once, in the mbp14 project.
 */
for (const viewport of [
  { width: 1512, height: 982 },
  { width: 768, height: 1024 },
]) {
  test(`[#313] the Topic bar stays compact at ${viewport.width}×${viewport.height}`, async ({ page }, info) => {
    test.skip(info.project.name !== "mbp14", "sizes its own viewport");
    await page.setViewportSize(viewport);
    await seed(page, "your-turn");
    await page.goto("/study");
    const bar = page.getByTestId("topic-bar");
    await expect(bar).toBeVisible();
    const strip = bar.locator('ol[aria-label="Steps in this Topic"]');
    const current = strip.locator('[aria-current="step"]');
    await expect(current).toHaveText("Your turn");
    await expect(strip.locator(":scope > li", { hasText: /^Check \d/ })).toHaveCount(4);
    const m = await bar.evaluate((nav) => {
      const ol = nav.querySelector<HTMLElement>('ol[aria-label="Steps in this Topic"]')!;
      const here = ol.querySelector<HTMLElement>('[aria-current="step"]')!;
      const o = ol.getBoundingClientRect();
      const h = here.getBoundingClientRect();
      return { bar: nav.getBoundingClientRect().height, strip: o.height, left: h.left - o.left, right: o.right - h.right };
    });
    expect(m.bar).toBeLessThanOrEqual(88);
    expect(m.strip).toBeLessThanOrEqual(32);
    // The current step sits inside the strip's visible box.
    expect(m.left).toBeGreaterThanOrEqual(0);
    expect(m.right).toBeGreaterThanOrEqual(0);
  });
}
