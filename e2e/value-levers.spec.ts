import { expect, test, type Locator, type Page } from "@playwright/test";
import { hydrated } from "./support/app";

// Value levers and sliders a person can land on (spec 2026-11-12, B3 and B5, "Done when"), on the Widget harness, which
// draws the recipe's frozen fixture with the real renderer and needs no database or model call.

const ONE = "w1280";

const headline = (page: Page) => page.getByTestId("value-levers-headline");

/**
 * Opens a fixture on the Widget harness and waits until it has hydrated: a value filled into a slider before React is
 * listening is drawn but never reaches the Widget (the first test of a cold run saw revenue $60bn come back as $52).
 */
async function openFixture(page: Page, fixture: string) {
  await page.goto(`/dev/widgets?fixture=${fixture}`);
  await hydrated(page);
}
const tasks = (page: Page) => page.locator('[data-testid="guided-tasks"] li');

/**
 * Sets a slider as a person's drag would end, and waits until the Widget has taken it: a fill made before React hydrates
 * the page is lost, so it is tried again until the slider reads the value.
 */
async function setSlider(page: Page, name: string, value: string) {
  const slider = page.getByRole("slider", { name });
  await expect(async () => {
    await slider.fill(value);
    await expect(slider).toHaveValue(value, { timeout: 500 });
  }).toPass();
}

test("[B3] moving Value levers to revenue $60bn and margin 12.5% shows $84 and ticks the second task", async ({ page }, info) => {
  test.skip(info.project.name !== ONE, "one width is enough for the behaviour");
  await openFixture(page, "value-levers");
  await expect(headline(page)).toHaveText("This story is worth $35 a share");
  await setSlider(page, "Revenue in year 10", "60");
  await setSlider(page, "Operating margin once mature", "12.5");
  await expect(headline(page)).toHaveText("This story is worth $84 a share");
  await expect(tasks(page).nth(1)).toHaveAttribute("data-state", "done");
  await expect(tasks(page).nth(1)).toContainText("Find a story worth the $84 price");
  // The one key number is the accent, at 20px or more, and not underlined (F2).
  const key = headline(page).locator("[data-key-figure]");
  const look = await key.evaluate((el) => ({ size: parseFloat(getComputedStyle(el).fontSize), line: getComputedStyle(el).textDecorationLine }));
  expect(look.size).toBeGreaterThanOrEqual(20);
  expect(look.line).toBe("none");
});

test('[B3] with margin at 4% the headline reads "$0: lenders and option holders take everything"', async ({ page }, info) => {
  test.skip(info.project.name !== ONE, "one width is enough for the behaviour");
  await openFixture(page, "value-levers");
  await setSlider(page, "Operating margin once mature", "4");
  await expect(headline(page)).toHaveText("$0: lenders and option holders take everything");
});

/** Where on the screen a range input puts a value: the thumb's centre runs from half a thumb in from each end. */
async function pointFor(slider: Locator, value: number, min: number, max: number): Promise<{ x: number; y: number }> {
  const box = (await slider.boundingBox())!;
  const thumb = 44;
  return { x: box.x + thumb / 2 + ((value - min) / (max - min)) * (box.width - thumb), y: box.y + box.height / 2 };
}

test.describe("[B5] a slider rests on a task's value when dragged within 12 pixels of it", () => {
  test.use({ hasTouch: true });

  test("by mouse", async ({ page }, info) => {
    test.skip(info.project.name !== ONE, "one width is enough for the behaviour");
    await openFixture(page, "rate-move");
    const slider = page.getByRole("slider", { name: "New rate" });
    const from = await pointFor(slider, 5, 0, 20);
    const to = await pointFor(slider, 4, 0, 20);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    // 8 pixels short of 4%, on the side away from the opening 5%.
    await page.mouse.move(to.x - 8, to.y, { steps: 6 });
    await page.mouse.up();
    await expect(slider).toHaveAttribute("aria-valuetext", "4 percent");
    await expect(tasks(page).first()).toHaveAttribute("data-state", "done");
  });

  test("by touch", async ({ page }, info) => {
    test.skip(info.project.name !== ONE, "one width is enough for the behaviour");
    await openFixture(page, "rate-move");
    const slider = page.getByRole("slider", { name: "New rate" });
    const from = await pointFor(slider, 5, 0, 20);
    const to = await pointFor(slider, 4, 0, 20);
    // A finger on the thumb at 5%, dragged 2 pixels at a time to 8 pixels short of 4%, on the side away from 5%.
    await touchDrag(page, from, to.x - 8);
    await expect(slider).toHaveAttribute("aria-valuetext", "4 percent");
    await expect(tasks(page).first()).toHaveAttribute("data-state", "done");
    // A tap on its chip sets it too.
    await setSlider(page, "New rate", "10");
    await page.getByRole("group", { name: "Quick values for New rate" }).getByRole("button", { name: "4%" }).tap();
    await expect(slider).toHaveAttribute("aria-valuetext", "4 percent");
  });
});

/**
 * A real touch drag through the DevTools protocol (touchStart, touchMove every 2 pixels, touchEnd), so the browser moves
 * the range input as it does under a finger; Playwright's touchscreen only taps.
 */
async function touchDrag(page: Page, from: { x: number; y: number }, toX: number) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", x?: number) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: x === undefined ? [] : [{ x, y: from.y }] });
  await touch("touchStart", from.x);
  const direction = Math.sign(toX - from.x);
  for (let x = from.x + 2 * direction; direction * (toX - x) > 0; x += 2 * direction) await touch("touchMove", x);
  await touch("touchMove", toX);
  await touch("touchEnd");
  await cdp.detach();
}

/** The slider's value as a number (the input's own value, which aria-valuetext speaks). */
const valueOf = async (slider: Locator) => Number(await slider.inputValue());

/**
 * Puts the slider at 0% from the keyboard (Home), so the drag that follows comes up to 4% from below and never passes
 * through it: a task that has ticked stays ticked (guided-tasks.ts), so a drag down from the opening 5% would tick it on
 * the way.
 */
async function fromZero(page: Page, slider: Locator) {
  await slider.focus();
  await page.keyboard.press("Home");
  await expect(slider).toHaveAttribute("aria-valuetext", "0 percent");
  return pointFor(slider, 0, 0, 20);
}

/**
 * A drag ending 20 pixels short of 4% rests outside the 12-pixel stop and near where it ended: between 28 and 12 pixels'
 * worth below 4% (the drag's grid is at most 2 pixels a step), never on 4%, and the task naming 4% stays open.
 */
async function restsShortOfFour(page: Page, slider: Locator) {
  const box = (await slider.boundingBox())!;
  const perPixel = 20 / (box.width - 44);
  await expect(slider).not.toHaveAttribute("aria-valuetext", "4 percent");
  const value = await valueOf(slider);
  expect(value, `${value}% after a drag ending 20 px short of 4%`).toBeLessThan(4 - 12 * perPixel);
  expect(value, `${value}% after a drag ending 20 px short of 4%`).toBeGreaterThan(4 - 28 * perPixel);
  await expect(tasks(page).first()).not.toHaveAttribute("data-state", "done");
}

test.describe("[B5] and does not rest on it from 20 pixels away (the stop is 12)", () => {
  test.use({ hasTouch: true });

  test("by mouse", async ({ page }, info) => {
    test.skip(info.project.name !== ONE, "one width is enough for the behaviour");
    await openFixture(page, "rate-move");
    const slider = page.getByRole("slider", { name: "New rate" });
    const from = await fromZero(page, slider);
    const to = await pointFor(slider, 4, 0, 20);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x - 20, to.y, { steps: 20 });
    await page.mouse.up();
    await restsShortOfFour(page, slider);
  });

  test("by touch", async ({ page }, info) => {
    test.skip(info.project.name !== ONE, "one width is enough for the behaviour");
    await openFixture(page, "rate-move");
    const slider = page.getByRole("slider", { name: "New rate" });
    const from = await fromZero(page, slider);
    const to = await pointFor(slider, 4, 0, 20);
    await touchDrag(page, from, to.x - 20);
    await restsShortOfFour(page, slider);
  });
});

test("[#102] a Learner opens the Full sheet from Go deeper and reads every input in plain words", async ({ page }, info) => {
  test.skip(info.project.name !== ONE, "one width is enough for the behaviour");
  await openFixture(page, "value-levers");
  const sheet = page.getByTestId("full-sheet");
  await expect(sheet).toBeHidden();
  await page.getByTestId("value-levers-go-deeper").getByText("Go deeper").click();
  await expect(sheet).toBeVisible();
  await expect(sheet.locator("[data-row]")).toHaveCount(15);
  await expect(sheet.locator('[data-row="taxRate"]')).toContainText("Tax rate");
  await expect(sheet.locator('[data-row="taxRate"]')).toContainText("35%");
  await expect(sheet.locator('[data-row="growth"]')).toContainText("150% in year 1, down to 6% in year 10");
  await expect(sheet.locator('[data-row="shares"]')).toContainText("340.79 million");
  // Nothing on the Full sheet can be typed into (#104 gives some rows a slider, never a typed number).
  await expect(sheet.locator('input:not([type="range"]), select, textarea, [contenteditable]')).toHaveCount(0);
  // It follows the Levers: a bigger revenue in year 10 reads as faster growth.
  await setSlider(page, "Revenue in year 10", "60");
  await expect(sheet.locator('[data-row="growth"]')).not.toContainText("150% in year 1,");
});

test("[#104] a Learner changes a Full sheet row by slider, never by typing, and the value follows the engine", async ({ page }, info) => {
  test.skip(info.project.name !== ONE, "one width is enough for the behaviour");
  await openFixture(page, "value-levers");
  await page.getByTestId("value-levers-go-deeper").getByText("Go deeper").click();
  const sheet = page.getByTestId("full-sheet");
  await expect(sheet).toBeVisible();
  // The rows the Levers do not set each have a slider; the Levers' own rows and the Case's facts do not.
  await expect(sheet.getByRole("slider")).toHaveCount(7);
  await expect(sheet.locator('[data-row="growth"]').getByRole("slider")).toHaveCount(0);
  await expect(sheet.locator('[data-row="shares"]').getByRole("slider")).toHaveCount(0);
  // No row can be typed into: every input on the sheet is a slider.
  await expect(sheet.locator('input:not([type="range"]), select, textarea, [contenteditable]')).toHaveCount(0);
  await expect(headline(page)).toHaveText("Your story is worth $35 a share");
  // $494m more cash, over 340.79 million shares, is about $1.45 a share more (the engine's figure: full-sheet-change.test.ts).
  await setSlider(page, "Change: Cash the company holds", "520");
  await expect(sheet.locator('[data-row="cash"]')).toContainText("$520m");
  await expect(headline(page)).toHaveText("Your story is worth $36 a share");
  // The tap buttons step a row too.
  await sheet.getByRole("button", { name: "Decrease Change: Tax rate by one step" }).click();
  await expect(sheet.locator('[data-row="taxRate"]')).toContainText("34%");
});

test("[#103] moving a Lever marks the Full sheet rows it moved, and each row opens its Lingo card inline", async ({ page }, info) => {
  test.skip(info.project.name !== ONE, "one width is enough for the behaviour");
  await openFixture(page, "value-levers");
  await page.getByTestId("value-levers-go-deeper").getByText("Go deeper").click();
  const sheet = page.getByTestId("full-sheet");
  // At the Case's own story nothing has moved.
  await expect(sheet.locator("[data-moved]")).toHaveCount(0);
  await setSlider(page, "Revenue in year 10", "60");
  await expect(sheet.locator("[data-moved]")).toHaveCount(1);
  await expect(sheet.locator('[data-row="growth"]')).toHaveAttribute("data-moved", "true");
  await expect(sheet.locator('[data-row="growth"]').getByTestId("full-sheet-moved")).toHaveText("Moved");
  // Every row has a Lingo card; pressing a row opens it in the sheet, with no reply from the Tutor.
  await expect(sheet.locator("[data-row] [data-testid=lingo-card]")).toHaveCount(15);
  const cash = sheet.locator('[data-row="cash"]');
  await expect(cash.getByTestId("lingo-card")).toBeHidden();
  await cash.locator("summary").click();
  await expect(cash.getByTestId("lingo-card")).toBeVisible();
  await expect(cash.getByTestId("lingo-card")).toContainText("Money the company has in the bank today");
});
