import { readdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { seed, settled, type State } from "./support/app";

/**
 * D1a: every question is a tap (ADR 0009). The Learner never types a number: a Quick try, an open Check tab and a due
 * Review show choices to tap, and a wrong tap shows its own mix-up fix. D1c adds the /dev/widgets sweep to this file.
 */

// The OpenUI devtools overlay (dev server only) has a disabled "Chunk seed" number box; it is not the Learner's UI.
const TYPED_NUMBER = ':is(input[inputmode="decimal"], input[type="number"], input[inputmode="numeric"]):not([aria-label="Chunk seed"])';
// Any box to type in, outside that overlay. Its panel (with the Chunk seed box) mounts lazily under
// [data-openui-devtools-root], about 2 s after load: a bare `input` count passed or failed by which came first.
const LEARNER_INPUT = "input:not([data-openui-devtools-root] *)";

async function study(page: Page, state: State) {
  await seed(page, state);
  await page.goto("/study");
  await expect(page.getByTestId("workspace-frame")).toBeVisible();
  await page.waitForLoadState("networkidle");
}

test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "mbp14" && info.project.name !== "mbp14-dark", "one viewport per theme is enough here");
});

test("the Learner at Percent's Your turn taps a wrong choice and sees its fix", async ({ page }) => {
  await study(page, "your-turn");
  const card = page.getByTestId("quick-try");
  await expect(card).toContainText("A rate goes from 3% to 3.5%. How many points did it move?");
  // The order is the seed's choice (it differs between Sessions), so compare the set.
  await expect(card.getByTestId("quick-try-choice")).toHaveCount(2);
  expect((await card.getByTestId("quick-try-choice").allInnerTexts()).sort()).toEqual(["0.5 points", "50 points"]);
  await expect(page.locator(TYPED_NUMBER)).toHaveCount(0);
  await expect(page.getByTestId("quick-try-input")).toHaveCount(0);

  await card.getByTestId("quick-try-choice").filter({ hasText: "50 points" }).click();
  const result = page.getByTestId("quick-try-result").first();
  await expect(result).toHaveAttribute("data-verdict", "known_mistake");
  await expect(result).toHaveText("That is basis points. Points are the new rate minus the old rate.");
  await expect(page.locator(TYPED_NUMBER)).toHaveCount(0);
});

test("the Check tab's open quiz has no typed-number input", async ({ page }) => {
  await study(page, "quiz-open");
  await expect(page.getByTestId("quiz")).toBeVisible();
  await expect(page.locator(TYPED_NUMBER)).toHaveCount(0);
  await expect(page.getByTestId("quiz-number")).toHaveCount(0);
});

test("an open Review shows choices to pick, with no typed-number input", async ({ page }) => {
  await study(page, "review-due");
  const review = page.getByTestId("review");
  await expect(review).toBeVisible();
  await review.locator("summary").click();
  await expect(review.getByRole("radio").first()).toBeVisible();
  await expect(page.locator(TYPED_NUMBER)).toHaveCount(0);
  await settled(page);
});

// D1c: every fixture Widget in the developer harness, every part: no typed-number input (the harness page is dev only).
const FIXTURES = ["audit", "parts"].flatMap((group) => readdirSync(`src/widgets/fixtures/${group}`).filter((f) => f.endsWith(".openui")).map((f) => `${group}/${f}`));

test("every fixture Widget at /dev/widgets has no typed-number input", async ({ page }) => {
  test.setTimeout(240_000);
  expect(FIXTURES.length).toBeGreaterThan(20);
  for (const fixture of FIXTURES) {
    await page.goto(`/dev/widgets?fixture=${fixture.split("/")[1]}`);
    await expect(page.getByTestId("widget-card")).toBeVisible();
    await expect(page.locator(TYPED_NUMBER), fixture).toHaveCount(0);
  }
});

test("rate-move practice offers three readings to tap and nothing to type, and a tap marks it", async ({ page }) => {
  await page.goto("/dev/widgets?fixture=rate-move-practice");
  const choices = page.getByTestId("rate-move-choice");
  await expect(choices).toHaveCount(3);
  expect((await choices.allInnerTexts()).sort()).toEqual(["Up 1 point, or 100 bps", "Up 1%", "Up 10 bps"]);
  await expect(page.locator(LEARNER_INPUT)).toHaveCount(0);
  await choices.filter({ hasText: "Up 10 bps" }).click();
  await expect(page.getByTestId("rate-move-answer")).toHaveAttribute("data-status", "wrong");
  await expect(page.getByTestId("rate-move-result")).toContainText("multiply by 100, not 10");
  await expect(page.locator(TYPED_NUMBER)).toHaveCount(0);
});

// #394: at 1512 the number line's end labels clipped ("4.75%" showed ".75%"). Each end label must sit inside the SVG.
test("rate-move number line end labels like 3.75% and 4.75% sit inside the drawing, not clipped", async ({ page }) => {
  await page.goto("/dev/widgets?fixture=rate-move");
  const line = page.getByTestId("rate-move-line");
  await expect(line).toBeVisible();
  // The slider's new rate: 5 gives ends 3.75% and 5.25%; 4.5 gives 3.75% and 4.75%.
  for (const [rate, ends] of [["5", ["3.75%", "5.25%"]], ["4.5", ["3.75%", "4.75%"]]] as const) {
    await page.getByRole("slider").first().fill(rate);
    const labels = line.locator(":scope > text");
    await expect(labels.first()).toHaveText(ends[0]);
    await expect(labels.nth(1)).toHaveText(ends[1]);
    const svg = (await line.boundingBox())!;
    for (const i of [0, 1]) {
      const box = (await labels.nth(i).boundingBox())!;
      expect(box.x, `${ends[i]} left edge inside the SVG`).toBeGreaterThanOrEqual(svg.x);
      expect(box.x + box.width, `${ends[i]} right edge inside the SVG`).toBeLessThanOrEqual(svg.x + svg.width);
    }
  }
});

test("StepThrough's faded step has a Show the number button, never Your number", async ({ page }) => {
  await page.goto("/dev/widgets?fixture=step-through");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Your number")).toHaveCount(0);
  await page.getByRole("button", { name: "Show the number" }).click();
  await expect(page.getByTestId("step-ask-result")).toHaveText("It is ₹12,100.");
});
