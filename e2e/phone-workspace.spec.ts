import { expect, test, type Page } from "@playwright/test";
import { replyLanded, say, script, seed } from "./support/app";
import { measureLayout } from "./support/measure";

/**
 * The Study Workspace on a phone (spec #68, #82): below 768 px the conversation fills the screen, and a Widget's chip in
 * the conversation slides the Widget up full screen at the device's width. Back (the browser's, or the sheet's own button)
 * returns to the same place in the conversation: the thread is never unmounted, so its scroll and the Widget's state
 * survive. Runs on the phone projects (p360, p390) only; the laptop and tablet layouts are other specs'.
 */

test.use({ hasTouch: true });

test.beforeEach(async ({}, info) => {
  test.skip(!["p360", "p390"].includes(info.project.name), "the phone projects (#82)");
});

/** A Story Session whose opener showed the rate-move Widget, and two more replies under it so the thread scrolls. */
async function studyWithWidget(page: Page) {
  await seed(page, "story");
  await script(page, "concept-reply-widget");
  await page.goto("/study");
  await expect(page.getByTestId("workspace-frame")).toBeVisible();
  await replyLanded(page);
  await say(page, "plain-reply", "Say it another way.");
  await say(page, "story-reply", "And then?");
}

const viewport = (page: Page) => page.getByTestId("thread-viewport");
const scrollTop = (page: Page) => viewport(page).evaluate((el) => Math.round(el.scrollTop));
const sheet = (page: Page) => page.getByTestId("panel-column");

/** Scrolls the conversation so the Widget's chip sits in the middle of the screen, away from the top and the bottom. */
async function chipInMiddle(page: Page) {
  const chip = page.getByTestId("widget-chip").first();
  await chip.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const place = await scrollTop(page);
  const max = await viewport(page).evaluate((el) => el.scrollHeight - el.clientHeight);
  expect(place, "the thread scrolls, and the chip is not at its very top").toBeGreaterThan(0);
  expect(place, "nor at its very bottom").toBeLessThan(max);
  return { chip, place };
}

/** Drags a slider's thumb sideways by touch (touchstart, moves, touchend), as a finger does. */
async function dragByTouch(page: Page, slider: ReturnType<Page["getByRole"]>, dx: number) {
  const box = (await slider.boundingBox())!;
  const value = Number(await slider.inputValue());
  const min = Number((await slider.getAttribute("min")) ?? 0);
  const max = Number((await slider.getAttribute("max")) ?? 100);
  // The thumb's centre for the slider's value now.
  const x = box.x + ((value - min) / (max - min)) * box.width;
  const y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", px: number) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: px, y }] });
  await touch("touchStart", x);
  for (let step = 1; step <= 8; step++) await touch("touchMove", x + (dx * step) / 8);
  await touch("touchEnd", x + dx);
  await cdp.detach();
}

test("[#82] the conversation fills the phone's screen, with nothing sideways", async ({ page }) => {
  await studyWithWidget(page);
  const width = page.viewportSize()!.width;
  await expect(page.getByText("needs a bigger screen")).toHaveCount(0);
  const chat = (await page.getByTestId("chat-column").boundingBox())!;
  expect(chat.x, "the conversation starts inside the screen").toBeGreaterThanOrEqual(0);
  expect(chat.x + chat.width, "and ends inside it").toBeLessThanOrEqual(width);
  expect(chat.width, "and takes nearly all of it").toBeGreaterThan(width * 0.85);
  // The Widget sheet waits below the screen until a chip opens it.
  await expect(sheet(page)).toBeHidden();
  expect((await measureLayout(page)).horizontalScroll, "no sideways scroll").toBe(false);
});

test("[#82] a chip opens its Widget full screen; moved by touch; the browser's Back returns to the same place", async ({ page }) => {
  await studyWithWidget(page);
  const width = page.viewportSize()!.width;
  const { chip, place } = await chipInMiddle(page);
  await chip.tap();
  await expect(sheet(page)).toBeVisible();
  const box = (await sheet(page).boundingBox())!;
  expect(box.x, "the sheet starts at the screen's left edge").toBe(0);
  expect(box.width, "and is the device's width").toBe(width);
  // The Widget is never cut off: its card ends inside the screen, and nothing in the sheet scrolls sideways.
  const card = (await page.getByTestId("widget-card").boundingBox())!;
  expect(card.x).toBeGreaterThanOrEqual(0);
  expect(card.x + card.width).toBeLessThanOrEqual(width);
  expect(await page.getByTestId("widget-pane").evaluate((el) => el.scrollWidth <= el.clientWidth + 1), "the Widget fits its sheet").toBe(true);
  expect((await measureLayout(page)).horizontalScroll, "no sideways scroll").toBe(false);

  const slider = page.getByTestId("widget-card").getByRole("slider").first();
  const before = await slider.inputValue();
  await dragByTouch(page, slider, 60);
  const moved = await slider.inputValue();
  expect(moved, "the touch moved the slider").not.toBe(before);

  await page.goBack();
  await expect(sheet(page)).toBeHidden();
  await expect(page).toHaveURL(/\/study$/);
  expect(await scrollTop(page), "Back returns to the same place in the conversation").toBe(place);

  // The sheet only slid away: the Widget is still there under the screen, at the value the touch left it.
  // (Hidden from the accessibility tree while away, so found by its element, not its role.)
  await expect(page.getByTestId("widget-card").locator('input[type="range"]').first()).toHaveValue(moved);
});

test("[#82] the sheet's own Back button returns to the same place, and leaves no Back step behind", async ({ page }) => {
  await studyWithWidget(page);
  const { chip, place } = await chipInMiddle(page);
  await chip.tap();
  await expect(sheet(page)).toBeVisible();
  await page.getByRole("button", { name: "Back to the conversation" }).tap();
  await expect(sheet(page)).toBeHidden();
  expect(await scrollTop(page), "the same place in the conversation").toBe(place);
  await expect(page).toHaveURL(/\/study$/);
  // The sheet's Back step went with it: the entry now is the page's own, not the open sheet's.
  expect(await page.evaluate(() => (history.state as { panelOpen?: boolean } | null)?.panelOpen ?? false)).toBe(false);
  await expect(page.getByTestId("chat-column")).toBeVisible();
});

test("[#82] the open sheet is a modal dialog: focus moves in, the conversation is out of reach, Escape closes it and focus returns to the chip", async ({ page }) => {
  await studyWithWidget(page);
  const { chip, place } = await chipInMiddle(page);
  await chip.tap();
  const dialog = page.getByRole("dialog", { name: "Widget sheet" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to the conversation" })).toBeFocused();
  // The conversation under the sheet is inert: out of the tab order and the accessibility tree.
  expect(await page.getByTestId("chat-column").evaluate((el) => !!el.closest("[inert]"))).toBe(true);
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')), "Tab stays in the sheet").toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(sheet(page)).toBeHidden();
  await expect(chip).toBeFocused();
  expect(await scrollTop(page), "the same place in the conversation").toBe(place);
  expect(await page.getByTestId("chat-column").evaluate((el) => !!el.closest("[inert]"))).toBe(false);
  await expect(page).toHaveURL(/\/study$/);
  expect(await page.evaluate(() => (history.state as { panelOpen?: boolean } | null)?.panelOpen ?? false), "no Back step left").toBe(false);
});

test("[#83] a passed Topic still on screen: its due spaced Review opens in the sheet from the conversation (G05)", async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page, "topic-complete-review-due");
  await page.goto("/study");
  await expect(page.getByTestId("workspace-frame")).toBeVisible();
  await expect(page.getByTestId("topic-passed")).toBeVisible();
  await expect(sheet(page)).toBeHidden();
  const entry = page.locator('[data-testid="sheet-entry"][data-view="review"]');
  await expect(entry).toContainText(/Spaced review · \d+ due/);
  // A tap before the page hydrates does nothing yet: tap again until the sheet is up.
  await expect(async () => {
    await entry.tap();
    await expect(sheet(page)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.getByTestId("review")).toBeVisible();
  await page.getByRole("button", { name: "Back to the conversation" }).tap();
  await expect(sheet(page)).toBeHidden();
});
