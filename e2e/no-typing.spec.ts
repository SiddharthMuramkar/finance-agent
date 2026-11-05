import { expect, test, type Page } from "@playwright/test";
import { seed, settled, type State } from "./support/app";

/**
 * D1a: every question is a tap (ADR 0009). The Learner never types a number: a Quick try, an open Check tab and a due
 * Review show choices to tap, and a wrong tap shows its own mix-up fix. D1c adds the /dev/widgets sweep to this file.
 */

// The OpenUI devtools overlay (dev server only) has a disabled "Chunk seed" number box; it is not the Learner's UI.
// The Slider's "exact value" boxes in a Widget are D1c's to remove; it drops the second :not() when it does.
const TYPED_NUMBER = ':is(input[inputmode="decimal"], input[type="number"], input[inputmode="numeric"]):not([aria-label="Chunk seed"]):not([aria-label$="exact value"])';

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
  await expect(card.getByTestId("quick-try-choice")).toHaveText(["0.5 points", "50 points"], { useInnerText: true });
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
