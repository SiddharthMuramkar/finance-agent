import { expect } from "@playwright/test";
import { script, signIn } from "./support/app";
import { test } from "./support/people";

/**
 * Spec #68, ticket #110: the AI Tutor in the Assignment. Ravi (Spine passed) saves an Own Case whose operating margin is
 * far from its industry's figure. The range check shows it on screen under the engine's value, with the yardstick's month
 * and source (#109); the scripted Tutor's reply names that flagged input and asks what story it assumes, with no verdict or
 * advice word.
 */

test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "mbp14", "one viewport is enough here");
});

/** A food company typed with an operating margin of 45%: more than double Food Processing's 7.26% (India, Jan 2026). */
const FIGURES = { sales: "10,000", operatingProfit: "4,500", taxPercent: "25", debt: "3,300", cash: "2,900", shares: "98,94,34,000", price: "1090" } as const;

test("the Tutor in the Assignment names the flagged input of the Learner's Own Case", async ({ person, page: tools }) => {
  test.setTimeout(180_000); // the dev server compiles each page on first visit
  const { page } = await person({ person: "ravi" });
  await page.goto("/assignment");
  const form = page.locator("[data-own-case-form]");
  await form.getByLabel("Company").fill("Tata Consumer Products");
  await form.getByLabel("Date of the annual report").fill("2025-03-31");
  await form.locator('[data-industry="food"]').click();
  for (const [key, value] of Object.entries(FIGURES)) await form.locator(`[data-own-case-field="${key}"]`).fill(value);
  await form.getByRole("button", { name: "Value it" }).click();

  // The range check (#109): the typed margin, not the engine's year 1, named under the value with its yardstick's date and source.
  await expect(form.locator('[data-own-case-result="value"]')).toContainText("The engine's value: ₹");
  const flags = form.getByTestId("range-flag");
  await expect(flags).toHaveCount(1);
  await expect(flags.first()).toHaveAttribute("data-input", "operating_margin");
  await expect(flags.first().getByTestId("range-sentence")).toHaveText("Your operating margin of 45% is far above Food Processing's 7.26% in India (Jan 2026): more than double it.");
  const source = flags.first().getByTestId("range-source");
  await expect(source).toContainText("Operating and Net Margins by Industry (India), January 2026 update");
  await expect(source).toHaveAttribute("href", "https://pages.stern.nyu.edu/~adamodar/pc/datasets/marginIndia.xls");

  await form.getByRole("button", { name: "Save to Notebook" }).click();
  await expect(form.locator("[data-own-case-saved]")).toContainText("Saved to your Notebook.");

  // Only the tools Learner may pick the scripted Tutor's reply: the test's own page signs in as it (an earlier test's seed
  // may have started it over, which signs the saved cookie out), apart from Ravi's browser.
  await signIn(tools);
  await script(tools, "assignment-flag");
  const tutor = page.locator("[data-assignment-tutor]");
  await tutor.getByLabel("Your message").fill("What do you make of my figures?");
  await tutor.getByRole("button", { name: "Ask the Tutor" }).click();
  const reply = tutor.locator('[data-assignment-said="reply"]');
  await expect(reply).toContainText("operating margin", { timeout: 60_000 });
  await expect(reply).toContainText("What story");
  await expect(reply).not.toContainText(/cheap|dear|undervalued|overvalued|\bbuy\b|\bsell\b|right value|wrong value/i);
});
