import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { say, seed, settled } from "./support/app";
import { measureLayout } from "./support/measure";

// E5 (§6.2 metrics) and A6: the latest reply's Widget fills the big stage, and the Learner can flick back through
// this Session's Widgets in a row of text tabs. Checked at 1512×982 (mbp14) and 1280×800 (w1280). Four scripted
// replies give four Widgets: the seed's Concept reply carries the card preset code opens at that step
// ("One move, two ways", course/topics/num-percent-bps.yaml), then one stage script per reply. Each stage script opens a
// different recipe (B6, ADR 0008: the same slider recipe at new numbers would take its tab in place), so four tabs.

const STAGE_PROJECTS = ["mbp14", "w1280"];
const TITLES = ["One move, two ways", "A deposit rate from 6% to 6.5%", "A loan rate from 9% to 8.75%", "A bond yield from 7% to 7.1%"];

/** The concept-widget seed plus three stage replies: four Widgets, the newest showing. */
async function fourWidgets(page: Page) {
  await seed(page, "concept-widget");
  await page.goto("/study");
  await expect(page.getByTestId("topic-bar")).toBeVisible();
  await settled(page);
  await say(page, "stage-reply-2", "Show me on a deposit rate.");
  await say(page, "stage-reply-3", "And when a rate falls?");
  await say(page, "stage-reply-4", "What about a really small move?");
}

test("Widget panel width, tabs and reduced motion: the stage fills the panel and tabs flick back", async ({ page }, testInfo) => {
  test.skip(!STAGE_PROJECTS.includes(testInfo.project.name), "the stage is measured at 1512×982 and 1280×800");
  await fourWidgets(page);

  // The Widget card fills the panel, and the panel is at least 52% of the viewport (the 45 / 55 default split, C2a).
  const layout = await measureLayout(page);
  expect(layout.panelWidthPct, "Widget panel width at 1512/1280, 52 % or more").toBeGreaterThanOrEqual(52);
  expect(layout.horizontalScroll, "no page-level horizontal scroll").toBe(false);
  const fill = await page.evaluate(() => {
    const pane = document.querySelector('[data-testid="widget-pane"]')!;
    const card = document.querySelector('[data-testid="widget-card"]')!;
    return card.getBoundingClientRect().width / pane.clientWidth;
  });
  expect(fill, "Widget card ≥ 0.9 × the panel's inner width").toBeGreaterThanOrEqual(0.9);

  // Four scripted replies, four text tabs; the latest is current; reduced motion stills everything.
  const tabs = page.getByTestId("filmstrip-thumb");
  await expect(tabs).toHaveCount(4);
  await expect(tabs.nth(3)).toHaveAttribute("aria-current", "true");
  await expect.poll(() => page.evaluate(() => document.getAnimations().length), { message: "no animation under reduced motion" }).toBe(0);
  // A6: each tab is one line, 28 to 32 px tall, and holds one 16×16 kind Icon.
  for (let i = 0; i < 4; i++) {
    const tab = await tabs.nth(i).evaluate((el) => ({
      height: el.getBoundingClientRect().height,
      icons: [...el.querySelectorAll("svg")].map((svg) => [svg.getBoundingClientRect().width, svg.getBoundingClientRect().height]),
    }));
    expect(tab.height, `tab ${i + 1} height`).toBeGreaterThanOrEqual(28);
    expect(tab.height, `tab ${i + 1} height`).toBeLessThanOrEqual(32);
    expect(tab.icons, `tab ${i + 1} holds one 16×16 Icon`).toEqual([[16, 16]]);
  }

  // A click on tab 1 shows its Widget; Back to latest returns to the newest.
  await tabs.nth(0).click();
  await expect(page.getByTestId("pager-position")).toContainText(TITLES[0]);
  await expect(page.getByTestId("widget-card")).toContainText(TITLES[0]);
  await page.getByTestId("back-to-latest").click();
  await expect(page.getByTestId("pager-position")).toContainText(TITLES[3]);
  await expect(page.getByTestId("widget-card")).toContainText(TITLES[3]);

  // F2-PM-1: ← moves focus without selecting, so the focused tab and the current one must look different.
  // Focus is the 2px --ring outline; the current tab has a 2px accent bar along its bottom (its ::after) and no outline.
  await tabs.nth(3).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(tabs.nth(2)).toBeFocused();
  await expect(tabs.nth(3)).toHaveAttribute("aria-current", "true");
  const look = (i: number) =>
    tabs.nth(i).evaluate((el) => {
      const s = getComputedStyle(el);
      const bar = getComputedStyle(el, "::after");
      return { outline: s.outlineStyle, shadow: s.boxShadow, bar: bar.backgroundColor, barHeight: bar.height };
    });
  const focused = await look(2);
  const current = await look(3);
  expect(focused.outline, "the focused tab carries the focus outline").toBe("solid");
  expect(current.outline, "the current tab carries no outline when it lacks focus").toBe("none");
  expect(current.barHeight, "the current tab has a 2px bar").toBe("2px");
  expect(current.bar, "the current tab's bar is the accent").toBe("rgb(31, 63, 174)");
  expect(focused.bar, "a tab that is only focused has no bar").toBe("rgba(0, 0, 0, 0)");
  expect(focused.shadow, "no shadow on the focused tab").toBe("none");
  expect(current.shadow, "no shadow on the current tab").toBe("none");
});

// A6: the Widget card and the Check card are white frames, and a switch plays no pulse and no rise, even when the
// Learner's computer allows motion. 1512×982, Light and Dark.
const FRAME_PROJECTS = ["mbp14", "mbp14-dark"];
const FRAME = {
  light: { bg: "rgb(255, 255, 255)", rule: "rgb(226, 229, 234)" },
  dark: { bg: "rgb(15, 15, 15)", rule: "rgb(31, 31, 31)" },
} as const;

/** A card's face, edge, corner and shadow. */
const frameOf = (page: Page, id: string) =>
  page.getByTestId(id).evaluate((el) => {
    const s = getComputedStyle(el);
    return { bg: s.backgroundColor, rule: s.borderTopColor, radius: parseFloat(s.borderTopLeftRadius), shadow: s.boxShadow };
  });

async function shot(page: Page, info: TestInfo, name: string) {
  if (process.env.SHOTS !== "A6") return;
  const dir = join("docs", "specs", "img", "2026-11-11");
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `A6-${name}-${info.project.name.endsWith("-dark") ? "dark" : "light"}.png`) });
}

test.describe("[A6] the Widget card is a white frame and a switch does not animate", () => {
  test.use({ reducedMotion: "no-preference" });

  test("four Widgets: the card is white, and pressing tab 1 runs no animation", async ({ page }, info) => {
    test.skip(!FRAME_PROJECTS.includes(info.project.name), "1512×982, Light and Dark");
    const theme = info.project.name.endsWith("-dark") ? "dark" : "light";
    await fourWidgets(page);
    const frame = await frameOf(page, "widget-card");
    expect(frame.bg, "the card's face is --frame").toBe(FRAME[theme].bg);
    expect(frame.rule, "the card's edge is --rule").toBe(FRAME[theme].rule);
    expect(frame.radius, "corners of 12 px at most").toBeLessThanOrEqual(12);
    expect(frame.shadow, "no shadow").toBe("none");
    await shot(page, info, "panel");

    await page.getByTestId("filmstrip-thumb").nth(0).click();
    await expect(page.getByTestId("pager-position")).toContainText(TITLES[0]);
    expect(await page.getByTestId("widget-card").evaluate((el) => el.getAnimations().length), "the card itself does not animate").toBe(0);
    await expect(page.locator('[data-testid="widget-pulse"]')).toHaveCount(0);
    const names = await page.evaluate(() => document.getAnimations().map((a) => (a as CSSAnimation).animationName ?? ""));
    expect(names.filter((n) => n === "ring-pulse" || n === "widget-stage-in"), "no ring pulse and no rise").toEqual([]);
  });

  test("an open quiz: the Check card is the same white frame", async ({ page }, info) => {
    test.skip(!FRAME_PROJECTS.includes(info.project.name), "1512×982, Light and Dark");
    const theme = info.project.name.endsWith("-dark") ? "dark" : "light";
    await seed(page, "quiz-open");
    await page.goto("/study");
    await expect(page.getByTestId("check-card")).toBeVisible();
    await settled(page);
    const frame = await frameOf(page, "check-card");
    expect(frame).toEqual({ bg: FRAME[theme].bg, rule: FRAME[theme].rule, radius: frame.radius, shadow: "none" });
    expect(frame.radius).toBeLessThanOrEqual(12);
    await shot(page, info, "check");
  });
});

// #528: the stage fills the panel's height too. A Story reply's scene card reaches the panel's bottom, and its cast
// grows past the 80 px floor, at 1512×982 (mbp14) and 1920×1080 (w1920), in Light and Dark.
const TALL_PROJECTS = ["mbp14", "mbp14-dark", "w1920", "w1920-dark"];

test("Widget panel height: a Story scene's card reaches the panel bottom and its cast grows", async ({ page }, testInfo) => {
  test.skip(!TALL_PROJECTS.includes(testInfo.project.name), "the stage height is measured at 1512×982 and 1920×1080");
  await seed(page, "story-scene");
  await page.goto("/study");
  await expect(page.getByTestId("topic-bar")).toBeVisible();
  await settled(page);
  await expect(page.getByTestId("widget-card").getByTestId("story-scene")).toBeVisible();

  const got = await page.evaluate(() => {
    const pane = document.querySelector('[data-testid="widget-pane"]')!;
    const card = document.querySelector('[data-testid="widget-card"]')!;
    // A1b: the cast are Icons (an svg with data-icon), not emoji images.
    const icon = card.querySelector('[data-testid="story-scene"] ul[aria-label="Cast"] svg[data-icon]');
    const top = pane.getBoundingClientRect().top;
    return { reach: (card.getBoundingClientRect().bottom - top) / pane.clientHeight, cast: icon?.getBoundingClientRect().height ?? null };
  });
  expect(got.reach, "Widget card bottom ≥ 0.9 × the panel's inner height").toBeGreaterThanOrEqual(0.9);
  expect(got.cast, "the cast Icon grows to 48 px in a panel 640 px tall").toBe(48);

  if (process.env.SHOTS === "A1b" && ["mbp14", "mbp14-dark"].includes(testInfo.project.name)) {
    const dir = join("docs", "specs", "img", "2026-11-11");
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: join(dir, `A1b-story-scene-${testInfo.project.name.endsWith("-dark") ? "dark" : "light"}.png`) });
  }
});
