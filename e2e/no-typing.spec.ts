import { readdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { seed, settled, type State } from "./support/app";
import { becomePerson } from "./support/people";

/**
 * D1a: every question is a tap (ADR 0002). The Learner never types a number: a Quick try, an open Check tab and a due
 * Review show choices to tap, and a wrong tap shows its own mix-up fix. D1c adds the /dev/widgets sweep to this file.
 * ADR 0020 narrows the rule by one form: the Own Case form of the Assignment, where a Learner copies numbers from an
 * annual report. Every typed-number box in the app is inside that form, and nowhere else.
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
  test.skip(info.project.name !== "mbp14", "one viewport is enough here");
});

test("the Learner at Percent's Your turn taps a wrong choice and sees its fix", async ({ page }) => {
  await study(page, "your-turn");
  const card = page.getByTestId("quick-try");
  await expect(card).toContainText("If the Fed took its 3% rate to 3.5%, a rise traders call 50 basis points, her story would say:");
  // The order is the seed's choice (it differs between Sessions), so compare the set.
  await expect(card.getByTestId("quick-try-choice")).toHaveCount(3);
  expect((await card.getByTestId("quick-try-choice").allInnerTexts()).sort()).toEqual(["Rates rose 50 percent", "Rates rose half a percent", "Rates rose half a percentage point"]);
  await expect(page.locator(TYPED_NUMBER)).toHaveCount(0);
  await expect(page.getByTestId("quick-try-input")).toHaveCount(0);

  await card.getByTestId("quick-try-choice").filter({ hasText: /^Rates rose half a percent$/ }).click();
  const result = page.getByTestId("quick-try-result").first();
  await expect(result).toHaveAttribute("data-verdict", "known_mistake");
  await expect(result).toHaveText("Half a percent is a share of the old rate. The gap between two rates is in points.");
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

test("the Own Case form is the one place a Learner types numbers, and its industry is a tap", async ({ page }) => {
  test.setTimeout(120_000);
  await becomePerson(page, { person: "ravi" });
  await page.goto("/assignment");
  const form = page.locator("[data-own-case-form]");
  await expect(form).toBeVisible();
  const typed = page.locator(TYPED_NUMBER);
  expect(await typed.count()).toBeGreaterThan(0);
  await expect(typed).toHaveCount(await form.locator(TYPED_NUMBER).count());
  // The industry is picked with a tap, not typed.
  await expect(form.locator("[data-industry]")).toHaveCount(4);
  await expect(form.locator("select")).toHaveCount(0);
  // Outside the Assignment, the same Learner's pages have no box to type a number in.
  for (const path of ["/course", "/notebook"]) {
    await page.goto(path);
    await expect(page.locator(TYPED_NUMBER), path).toHaveCount(0);
  }
});

// Ticket #88: Spine Topic 1 asks for nothing typed and for no own story. Its Insight is a tap code marks, and its
// closing Check (worth-talk, once a conversation asking for the Learner's own story) judges other people's stories by tap.
test("Spine Topic 1 settles its Insight by a tap, with nothing to type", async ({ page }) => {
  await study(page, "spine-01-explore");
  const pick = page.getByTestId("insight-pick");
  await expect(pick).toBeVisible();
  expect((await pick.getByTestId("insight-pick-choice").allInnerTexts()).sort()).toEqual(["Far more sales, and more kept of each sale", "Only a lower cost of capital", "Only more sales for each dollar invested"]);
  await expect(page.locator(TYPED_NUMBER)).toHaveCount(0);
  await pick.getByTestId("insight-pick-choice").filter({ hasText: "Only a lower cost of capital" }).click();
  // The first tap can wait on the dev server compiling its route.
  await expect(page.getByTestId("insight-pick-result")).toHaveAttribute("data-released", "hint_1", { timeout: 60_000 });
  await expect(page.locator(TYPED_NUMBER)).toHaveCount(0);
});

test("Spine Topic 1's closing Check judges other people's stories by tap, never the Learner's own", async ({ page }) => {
  await study(page, "spine-01-judging");
  const quiz = page.getByTestId("quiz");
  await expect(quiz).toBeVisible();
  await expect(quiz.locator("fieldset")).toHaveCount(4);
  await expect(quiz.getByRole("radio").first()).toBeVisible();
  await expect(page.locator(TYPED_NUMBER)).toHaveCount(0);
  await expect(page.getByTestId("quiz-number")).toHaveCount(0);
  await expect(page.getByText(/your story|your own story|Tell Amazon's story/i)).toHaveCount(0);
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
  // 11 gives a 6-character end (2.25% and 12.75%); 20, the top of the slider, gives 0% and 24%.
  for (const [rate, ends] of [["5", ["3.75%", "5.25%"]], ["4.5", ["3.75%", "4.75%"]], ["11", ["2.25%", "12.75%"]], ["20", ["0%", "24%"]]] as const) {
    const slider = page.getByRole("slider").first();
    await slider.fill(rate);
    // A drag rests on the task's 4% or the opening 5% within 12 pixels (spec 2026-11-12, B5): the arrow keys reach 4.5.
    for (let press = 0; press < 100 && (await slider.getAttribute("aria-valuetext")) !== `${rate} percent`; press++) {
      const now = parseFloat((await slider.getAttribute("aria-valuetext")) ?? "0");
      await slider.press(now < Number(rate) ? "ArrowRight" : "ArrowLeft");
    }
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

// #417: 6-character ends ("10.25%") are the widest the 0-20 sliders make, and "%" is far wider than a digit. Both
// rates move here (practice mode's play sliders), so both ends can be 6 characters at once.
test("rate-move number line 6-character end labels like 10.25% and 21.25% sit inside the drawing, not clipped", async ({ page }) => {
  await page.goto("/dev/widgets?fixture=rate-move-practice");
  await page.getByTestId("rate-move-choice").filter({ hasText: "Up 1 point, or 100 bps" }).click();
  await expect(page.getByTestId("rate-move-answer")).toHaveAttribute("data-status", "right");
  const line = page.getByTestId("rate-move-line");
  const cases = [
    ["10.5", "11", ["10.25%", "11.25%"]],
    ["15", "20", ["13.75%", "21.25%"]],
    ["19.99", "20", ["19.74%", "20.25%"]],
    ["0.04", "20", ["0%", "24.99%"]],
  ] as const;
  // A drag lands on the slider's 2-pixel steps (spec 2026-11-12, B5), so 19.99% or 0.04% is reached as a person reaches it:
  // drag near, then the arrow keys, which move 0.01.
  const setRate = async (label: string, rate: string) => {
    const slider = page.getByLabel(label);
    await slider.fill(rate);
    for (let press = 0; press < 200 && (await slider.getAttribute("aria-valuetext")) !== `${rate} percent`; press++) {
      const now = parseFloat((await slider.getAttribute("aria-valuetext")) ?? "0");
      await slider.press(now < Number(rate) ? "ArrowRight" : "ArrowLeft");
    }
    await expect(slider).toHaveAttribute("aria-valuetext", `${rate} percent`);
  };
  for (const [oldRate, newRate, ends] of cases) {
    await setRate("Old rate", oldRate);
    await setRate("New rate", newRate);
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
