import { expect, test, type Locator, type Page } from "@playwright/test";
import { EXAMPLE_SLUGS, examplePath } from "../src/site/examples";
import { quietDevtools, siteReady } from "./support/app";

/**
 * The Signal spec's §13 QA rows that need the whole site in a browser, signed out: the case page's flow (rows 19 to 21),
 * every route at 1440 × 900 and 390 × 844 (row 24) and the keyboard only (row 26). The widgets' own numbers (rows 1 to
 * 18) are pinned in src/components/signal/*.test.tsx, and Home's rows in e2e/home.spec.ts.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async ({ page }) => {
  await quietDevtools(page);
});

const SITE_ROUTES = ["/", "/how-it-works", "/examples", ...EXAMPLE_SLUGS.map(examplePath), "/about"];

/** Presses Tab until `target` has the focus, at most `max` times; fails if it never does. */
async function tabTo(page: Page, target: Locator, max = 120) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error(`Tab never reached ${target}`);
}

test("[QA 19, 20, 21] the Amazon case: locked at step 2, a lever move opens the answer at step 3, the reveal ends it", async ({ page }, info) => {
  test.skip(!["mbp14", "p390"].includes(info.project.name), "1512 and a phone");
  await page.goto("/examples/amazon-2000");
  await siteReady(page);
  const progress = page.getByRole("list", { name: "Progress" }).locator("li");
  const current = page.getByRole("list", { name: "Progress" }).locator('li[aria-current="step"]');

  // 19: the Tutor's answer and the ending are locked, and the progress row is at step 2.
  await expect(current).toHaveCount(1);
  const step = () => progress.evaluateAll((items) => items.findIndex((li) => li.getAttribute("aria-current") === "step"));
  expect(await step()).toBe(1);
  await expect(page.locator(".answer")).toContainText("The Tutor explains after your call.");
  await expect(page.locator(".ending")).toContainText("Make your call first.");

  // 20: a lever move is the call: the answer appears, the ending is ready, step 3, and Go deeper opens with the bridge.
  const widget = page.getByTestId("case-widget");
  await widget.getByRole("slider", { name: "What it keeps" }).focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.locator(".answer .v-bubble.tutor")).toBeVisible();
  await expect(page.locator(".ending")).toContainText("Your call is in. Ready for what happened next?");
  await expect.poll(step).toBe(2);
  await expect(widget.locator('.sig-l2[data-open="true"]')).toBeVisible();

  // 21: the reveal shows what happened, with his $35.08, the $91.50 and the $14.88 low, and every step is done.
  await page.getByRole("button", { name: "Reveal what really happened" }).click();
  const reveal = page.getByTestId("case-reveal");
  await expect(reveal).toBeFocused();
  for (const figure of ["$35.08", "$91.50", "$14.88"]) await expect(reveal).toContainText(figure);
  await expect(current).toHaveCount(0);
  await expect(progress.locator(".n svg")).toHaveCount(4);
});

/** QA row 24: no console error and no sideways scroll on any route, at the two sizes the row names. */
test("[QA 24] every route at 1440 × 900 and 390 × 844 has no console error and no sideways scroll", async ({ page }, info) => {
  test.skip(info.project.name !== "mbp14", "both sizes are set here");
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${page.url()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`${page.url()}: ${error.message}`));
  // The analytics script is another site's and is never the page's own error.
  await page.route(/va\.vercel-scripts\.com/, (route) => route.abort());
  for (const size of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    for (const path of SITE_ROUTES) {
      await page.goto(path);
      await siteReady(page);
      await page.waitForLoadState("networkidle");
      const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(sideways, `${path} at ${size.width} scrolls sideways`).toBeLessThanOrEqual(0);
    }
  }
  expect(errors.filter((e) => !/Failed to load resource: net::ERR_FAILED/.test(e))).toEqual([]);
});

/**
 * QA row 26, keyboard only: every chip, slider, lever, preset, toggle and reveal can be reached with Tab and worked with
 * the keys. Each kind is tried once, on the page that has it.
 */
test("[QA 26] chips, sliders, levers, presets, toggles and reveals work from the keyboard", async ({ page }, info) => {
  test.skip(info.project.name !== "mbp14", "1512");
  test.setTimeout(120_000);

  // A chip and a slider (rates), and a reveal.
  await page.goto("/examples/rbi-repo-cut-2025");
  await siteReady(page);
  const rates = page.getByTestId("case-widget");
  const chip = rates.getByRole("button", { name: "Down 0.5%" });
  await tabTo(page, chip);
  await page.keyboard.press("Space");
  await expect(chip).toHaveClass(/is-careful/);
  const slider = rates.getByRole("slider", { name: "New rate" });
  await expect(slider).toBeEnabled();
  await tabTo(page, slider);
  const before = await slider.inputValue();
  await page.keyboard.press("ArrowLeft");
  await expect(slider).not.toHaveValue(before);
  const reveal = page.getByRole("button", { name: /^Reveal / });
  await tabTo(page, reveal);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("case-reveal")).toBeFocused();

  // A toggle (compounding's Split the growth), after the call.
  await page.goto("/examples/compounding-1000");
  await siteReady(page);
  const compound = page.getByTestId("case-widget");
  const more = compound.getByRole("button", { name: "No, more each year" });
  await tabTo(page, more);
  await page.keyboard.press("Enter");
  const split = compound.getByRole("button", { name: "Split the growth" });
  await tabTo(page, split);
  await page.keyboard.press("Space");
  await expect(compound.getByRole("button", { name: "Growth is split" })).toHaveAttribute("aria-pressed", "true");

  // A lever and a preset (Home's levers story).
  await page.goto("/");
  await siteReady(page);
  const story = page.locator('[data-site-section="levers"]');
  await story.locator('.v-step[data-step="5"]').scrollIntoViewIfNeeded();
  await expect(story.locator('.v-step[data-step="5"]')).toHaveClass(/\bactive\b/);
  const preset = story.getByRole("group", { name: "Try a story" }).getByRole("button").first();
  await tabTo(page, preset);
  await page.keyboard.press("Enter");
  const lever = story.getByRole("slider", { name: "How big it gets" });
  const value = story.locator('[data-widget="levers-story"] [data-value]');
  const shown = await value.textContent();
  await tabTo(page, lever);
  await page.keyboard.press("Home");
  await expect(value).not.toHaveText(shown!);
});
