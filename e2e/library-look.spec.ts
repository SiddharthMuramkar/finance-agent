import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

/** A5: provenance is a thin edge, steps are not royal blue, and the slider fills with the accent. */

const PROJECTS = ["mbp14", "mbp14-dark"];
const SHOTS_DIR = join("docs", "specs", "img", "2026-11-11");

/** Light and Dark values of the family edges (globals.css `--src-line` and `--you-line`). */
const EDGE = {
  sourced: { light: "rgb(255, 194, 51)", dark: "rgb(232, 190, 92)" },
  assumption: { light: "rgb(18, 184, 134)", dark: "rgb(102, 205, 170)" },
} as const;

/** Each `[data-kind=kind]` mark under `within`: its face, and its left edge's width and colour. */
async function marks(page: Page, within: string, kind: keyof typeof EDGE) {
  const found = page.locator(`${within} [data-kind="${kind}"]`);
  await expect(found.first()).toBeVisible();
  return found.evaluateAll((els) =>
    els.map((el) => {
      const s = getComputedStyle(el);
      return { bg: s.backgroundColor, width: s.borderLeftWidth, colour: s.borderLeftColor };
    }),
  );
}

async function shot(page: Page, info: TestInfo, name: string) {
  if (process.env.SHOTS !== "A5") return;
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: join(SHOTS_DIR, `A5-${name}-${info.project.name.endsWith("-dark") ? "dark" : "light"}.png`) });
}

test.describe("[A5] provenance is a 2px edge on no fill", () => {
  test("a sourced history figure", async ({ page }, info) => {
    test.skip(!PROJECTS.includes(info.project.name), "1512, Light and Dark");
    const theme = info.project.name.endsWith("-dark") ? "dark" : "light";
    await page.goto(`/dev/widgets?fixture=01-sensex-milestones&width=860${theme === "dark" ? "&theme=dark" : ""}`);
    const card = page.getByTestId("widget-card");
    const missing = card.getByText("No sourced data is available for sensex-1992");
    await expect(card.locator('[data-kind="sourced"]').first().or(missing)).toBeVisible();
    await shot(page, info, "history");
    // The harness reads Case Data from UX_CASE_DATA_DIR, which is never in git: without it there is no figure to measure.
    test.skip(await missing.isVisible(), "no Case Data for sensex-1992 on this machine (UX_CASE_DATA_DIR)");
    const found = await marks(page, '[data-testid="widget-card"]', "sourced");
    expect(found.length).toBeGreaterThan(0);
    for (const look of found) expect(look).toEqual({ bg: "rgba(0, 0, 0, 0)", width: "2px", colour: EDGE.sourced[theme] });
  });

  // The spec checked Home's live annuity Widget. Since #609 (the owner's design E) Home's hero is an Explorable drawn by
  // code, with no Library parts, so the same Present value lottery annuity is checked where it is still a Widget.
  test("the Learner's assumption, on Present value's lottery annuity", async ({ page }, info) => {
    test.skip(!PROJECTS.includes(info.project.name), "1512, Light and Dark");
    const theme = info.project.name.endsWith("-dark") ? "dark" : "light";
    await page.goto(`/dev/widgets?fixture=06-lottery-breakeven&width=860${theme === "dark" ? "&theme=dark" : ""}`);
    const found = await marks(page, '[data-testid="widget-card"]', "assumption");
    expect(found.length).toBeGreaterThan(0);
    for (const look of found) expect(look).toEqual({ bg: "rgba(0, 0, 0, 0)", width: "2px", colour: EDGE.assumption[theme] });
    await shot(page, info, "annuity");
  });
});

test("[A5] the kit's Steps mark no step in royal blue", async ({ page }, info) => {
  test.skip(!PROJECTS.includes(info.project.name), "1512, Light and Dark");
  const dark = info.project.name.endsWith("-dark");
  await page.goto(`/dev/widgets?fixture=02-gold-bad-times-chain&width=860${dark ? "&theme=dark" : ""}`);
  // The step's title (Steps take the model's "1. " off it), exactly once, then the kit's list that holds it. Both are
  // counted first, so a selector that misses or matches twice fails here instead of checking nothing.
  const title = page.getByTestId("widget-card").getByText("Bad times arrive", { exact: true });
  await expect(title).toHaveCount(1);
  await expect(title).toBeVisible();
  const list = title.locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' openui-steps ')][1]");
  await expect(list).toHaveCount(1);
  const look = await list.evaluate((root) => {
    const banned = new Set(["rgb(31, 63, 174)", "rgb(106, 161, 255)"]);
    const painted = [root, ...root.querySelectorAll("*")]
      .filter((el) => {
        const s = getComputedStyle(el);
        // An edge paints only when it has a width and a style; its colour otherwise just follows the text.
        const edges = (["Top", "Right", "Bottom", "Left"] as const).filter(
          (side) => s[`border${side}Width`] !== "0px" && s[`border${side}Style`] !== "none",
        );
        return banned.has(s.backgroundColor) || edges.some((side) => banned.has(s[`border${side}Color`]));
      })
      .map((el) => `${el.tagName.toLowerCase()}.${el.getAttribute("class") ?? ""}`);
    return { markers: root.querySelectorAll(".openui-step-number-inner").length, painted };
  });
  // The fixture's chain has four steps, each with its number marker: the probe read the real list.
  expect(look.markers).toBe(4);
  expect(look.painted).toEqual([]);
});

test("[A5] the Slider is a royal-blue control", async ({ page }, info) => {
  test.skip(!PROJECTS.includes(info.project.name), "1512, Light and Dark");
  const dark = info.project.name.endsWith("-dark");
  await page.goto(`/dev/widgets?fixture=07-sip-1000-month&width=860${dark ? "&theme=dark" : ""}`);
  const range = page.locator('input[type="range"]').first();
  await expect(range).toBeVisible();
  const image = await range.evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(image).toContain(dark ? "106, 161, 255" : "31, 63, 174");
  const thumb = await page.evaluate(() => {
    const rules = [...document.styleSheets].flatMap((sheet) => {
      try { return [...sheet.cssRules]; } catch { return []; }
    });
    const text = rules.map((rule) => rule.cssText).join("\n");
    const webkit = text.match(/range-you[^}]*::-webkit-slider-thumb\s*\{[^}]*\}/)?.[0] ?? "";
    return webkit;
  });
  // Spec 2026-11-12 B5: the thumb is 44px each way to press, drawn as a 16px accent dot with a paper ring inside it.
  expect(thumb).toContain("width: 44px");
  expect(thumb).toContain("height: 44px");
  expect(thumb).toContain("var(--accent-fill) 7px");
  expect(thumb).toContain("var(--paper)");
  expect(thumb).not.toContain("--you");
});
