import { expect, test } from "@playwright/test";
import { say, seed, settled } from "./support/app";
import { measureLayout } from "./support/measure";

// E5 (§6.2 metrics): the latest reply's Widget fills the big stage, and the Learner can flick back through
// this Session's Widgets in the filmstrip. Checked at 1512×982 (mbp14) and 1280×800 (w1280). Four scripted
// replies give four Widgets: the seed's Concept reply carries the card preset code opens at that step
// ("One move, two ways", course/topics/num-percent-bps.yaml), then one stage script per reply.

const STAGE_PROJECTS = ["mbp14", "w1280"];
const TITLES = ["One move, two ways", "A deposit rate from 6% to 6.5%", "A loan rate from 9% to 8.75%", "A bond yield from 7% to 7.1%"];

test("Widget panel width, filmstrip and reduced motion: the stage fills the panel and thumbnails flick back", async ({ page }, testInfo) => {
  test.skip(!STAGE_PROJECTS.includes(testInfo.project.name), "the stage is measured at 1512×982 and 1280×800");
  await seed(page, "concept-widget");
  await page.goto("/study");
  await expect(page.getByTestId("topic-bar")).toBeVisible();
  await settled(page);

  await say(page, "stage-reply-2", "Show me on a deposit rate.");
  await say(page, "stage-reply-3", "And when a rate falls?");
  await say(page, "stage-reply-4", "What about a really small move?");

  // The Widget card fills the panel, and the panel is at least 55% of the viewport.
  const layout = await measureLayout(page);
  expect(layout.panelWidthPct, "Widget panel width at 1512/1280").toBeGreaterThanOrEqual(55);
  expect(layout.horizontalScroll, "no page-level horizontal scroll").toBe(false);
  const fill = await page.evaluate(() => {
    const pane = document.querySelector('[data-testid="widget-pane"]')!;
    const card = document.querySelector('[data-testid="widget-card"]')!;
    return card.getBoundingClientRect().width / pane.clientWidth;
  });
  expect(fill, "Widget card ≥ 0.9 × the panel's inner width").toBeGreaterThanOrEqual(0.9);

  // Four scripted replies, four thumbnails; the latest is current; reduced motion stills the stage entrance.
  const thumbs = page.getByTestId("filmstrip-thumb");
  await expect(thumbs).toHaveCount(4);
  await expect(thumbs.nth(3)).toHaveAttribute("aria-current", "true");
  await expect.poll(() => page.evaluate(() => document.getAnimations().length), { message: "no animation under reduced motion" }).toBe(0);

  // A click on thumbnail 1 shows its Widget; Back to latest returns to the newest.
  await thumbs.nth(0).click();
  await expect(page.getByTestId("pager-position")).toContainText(TITLES[0]);
  await expect(page.getByTestId("widget-card")).toContainText(TITLES[0]);
  await page.getByTestId("back-to-latest").click();
  await expect(page.getByTestId("pager-position")).toContainText(TITLES[3]);
  await expect(page.getByTestId("widget-card")).toContainText(TITLES[3]);

  // F2-PM-1: ← moves focus without selecting, so the focused thumbnail and the showing one must look different.
  // Focus is the 2px --ring outline; the showing thumbnail is the brand-tint face with a brand rim, and no outline.
  await thumbs.nth(3).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(thumbs.nth(2)).toBeFocused();
  await expect(thumbs.nth(3)).toHaveAttribute("aria-current", "true");
  const look = (i: number) =>
    thumbs.nth(i).evaluate((el) => {
      const s = getComputedStyle(el);
      return { outline: s.outlineStyle, face: s.backgroundColor, rim: s.borderTopColor };
    });
  const focused = await look(2);
  const showing = await look(3);
  expect(focused.outline, "the focused thumbnail carries the focus outline").toBe("solid");
  expect(showing.outline, "the showing thumbnail carries no outline when it lacks focus").toBe("none");
  expect(showing.face, "the showing thumbnail has its own face").not.toBe(focused.face);
  expect(showing.rim, "the showing thumbnail has its own rim").not.toBe(focused.rim);
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
    const img = card.querySelector('[data-testid="story-scene"] ul[aria-label="Cast"] img')!;
    const top = pane.getBoundingClientRect().top;
    return { reach: (card.getBoundingClientRect().bottom - top) / pane.clientHeight, cast: img.getBoundingClientRect().height };
  });
  expect(got.reach, "Widget card bottom ≥ 0.9 × the panel's inner height").toBeGreaterThanOrEqual(0.9);
  expect(got.cast, "the cast grows past the 80 px floor, to 112 px in a panel 640 px tall").toBe(112);
});
