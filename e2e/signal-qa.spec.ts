import { expect, test, type Locator, type Page } from "@playwright/test";
import { EXAMPLES, examplePath } from "../src/site/examples";
import { SITE_PAGES } from "../src/site/routes";
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

/** Every site page, the five case pages included: the one public-route list (issue #69). */
const SITE_ROUTES = SITE_PAGES;

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

/** #116: the jackpot and rates Examples are dated Indian Moments in rupees, and the ending names each Source with its link. */
test("[#116] the jackpot and rates Examples show a dated Indian Moment with linked Sources", async ({ page }, info) => {
  test.skip(!["mbp14", "p390"].includes(info.project.name), "1512 and a phone");
  for (const { slug, date, figure, host, asOf } of [
    { slug: "kerala-bumper-2024", date: "9 October 2024.", figure: "₹25 crore", host: "www.thehindu.com", asOf: "As of 9 Oct 2024." },
    { slug: "rbi-repo-cut-2025", date: "6 June 2025.", figure: "5.5%", host: "www.rbi.org.in", asOf: "As of 6 Jun 2025." },
  ]) {
    await page.goto(examplePath(slug));
    await siteReady(page);
    await expect(page.locator("main")).toContainText(date);
    await expect(page.locator("main")).toContainText(figure);
    await page.getByRole("button", { name: "Skip to the ending" }).click();
    const reveal = page.getByTestId("case-reveal");
    await expect(reveal).toContainText(asOf);
    const link = reveal.locator(`a[href^="https://${host}/"]`);
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute("rel", /noopener/);
  }
});

/** #75: every Example's ending links each Source it names, and the Amazon Example names one model: the tested engine. */
test("[#75] every Example links each named Source, and Amazon says its widget runs the tested valuation engine", async ({ page }, info) => {
  test.skip(info.project.name !== "mbp14", "the links are the same at every size");
  for (const example of EXAMPLES) {
    await page.goto(examplePath(example.slug));
    await siteReady(page);
    await page.getByRole("button", { name: "Skip to the ending" }).click();
    const reveal = page.getByTestId("case-reveal");
    for (const source of example.sources) {
      if ("note" in source) await expect(reveal).toContainText(source.note);
      else await expect(reveal.getByRole("link", { name: source.label, exact: true }), `${example.slug}: ${source.label}`).toHaveAttribute("href", source.url);
    }
    if (example.slug === "amazon-2000") {
      await expect(reveal).toContainText("tested valuation engine");
      await expect(page.locator("main")).not.toContainText("prototype");
    }
  }
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

/** What the #74 phone audit found on one page, measured in the browser: each entry is a fault, so none should be left. */
async function phoneFaults(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const faults: string[] = [];
    const shown = (el: Element) => {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none" && !el.closest("[aria-hidden='true'], [hidden], .sr-only, .v-sr");
    };
    if (document.documentElement.scrollWidth > document.documentElement.clientWidth) faults.push("sideways scroll");
    // The closing steps: no rule before a step that starts a line.
    document.querySelectorAll(".v-join-steps li + li").forEach((li) => {
      const rule = getComputedStyle(li, "::before");
      const prev = li.previousElementSibling!.getBoundingClientRect();
      if (rule.display !== "none" && rule.content !== "none" && li.getBoundingClientRect().top > prev.top + 2) faults.push("a stray rule starts a closing-steps line");
    });
    // The closing bars: never drawn under the CTA like an empty chart.
    // (They are decorative, so aria-hidden: test the box, not the reading.)
    document.querySelectorAll(".v-bars").forEach((bars) => bars.getBoundingClientRect().height > 0 && faults.push("pale closing bars"));
    // A facts grid with a cell left empty.
    document.querySelectorAll(".v-facts").forEach((grid) => {
      const columns = getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length;
      if (shown(grid) && grid.children.length % columns !== 0) faults.push(`a facts grid of ${grid.children.length} in ${columns} columns`);
    });
    // "Go deeper" on one line.
    document.querySelectorAll(".sig-tag").forEach((tag) => {
      if (shown(tag) && tag.getBoundingClientRect().height > 1.6 * parseFloat(getComputedStyle(tag).lineHeight)) faults.push(`"${tag.textContent}" wraps`);
    });
    // Headings never skip a level.
    let level = 0;
    document.querySelectorAll("main h1, main h2, main h3, main h4, main h5, main h6").forEach((h) => {
      if (!shown(h)) return;
      const n = Number(h.tagName[1]);
      if (level && n > level + 1) faults.push(`h${n} "${h.textContent?.trim()}" after h${level}`);
      level = n;
    });
    // Text contrast (WCAG AA): every shown text against the first solid background behind it.
    const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const backdrop = (el: Element | null): number[] => {
      for (let node = el; node; node = node.parentElement) {
        const c = rgb(getComputedStyle(node).backgroundColor);
        if (c.length >= 3 && (c[3] ?? 1) > 0.5) return c;
      }
      return [255, 255, 255];
    };
    document.querySelectorAll("main *, header *, footer *").forEach((el) => {
      if (el instanceof SVGElement || !shown(el)) return;
      if (![...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim())) return;
      if (el.closest("[disabled], [aria-disabled='true']")) return;
      const style = getComputedStyle(el);
      const fg = rgb(style.color);
      const bg = backdrop(el);
      const alpha = fg[3] ?? 1;
      const mixed = fg.slice(0, 3).map((v, i) => v * alpha + bg[i] * (1 - alpha));
      const [a, b] = [lum(mixed), lum(bg)].sort((x, y) => y - x);
      const ratio = (a + 0.05) / (b + 0.05);
      const size = parseFloat(style.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5)) faults.push(`contrast ${ratio.toFixed(2)} on "${el.textContent?.trim().slice(0, 40)}"`);
    });
    return faults;
  });
}

// #74: the phone polish the audit found (the closing steps' stray rule, the pale bars, an empty facts cell, "Go deeper"
// wrapping, faded text, a skipped heading level) stays fixed at 360 and 390 px on every public page.
test("[#74] no layout fault from the phone audit at 360 and 390 px, and no text below AA contrast", async ({ page }, info) => {
  test.skip(info.project.name !== "mbp14", "both phone sizes are set here");
  test.setTimeout(240_000);
  await page.route(/va\.vercel-scripts\.com/, (route) => route.abort());
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 800 });
    for (const path of SITE_ROUTES) {
      await page.goto(path);
      await siteReady(page);
      await page.waitForLoadState("networkidle");
      expect(await phoneFaults(page), `${path} at ${width} px`).toEqual([]);
    }
  }
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
