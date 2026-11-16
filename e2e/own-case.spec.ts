import { expect } from "@playwright/test";
import { test } from "./support/people";

/**
 * Spec #68, Assignments (#107): a Learner who has passed the Spine values a listed Indian company they pick, from its
 * annual report, and finds the one-page note in the Notebook. Ravi is the test bed's Spine-passed person; Asha has not
 * passed it, so the Assignment stays closed for her.
 */

test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "mbp14", "one viewport is enough here");
});

/** Coffee Day's prospectus figures (the course Case coffee-day-rupee-valuation-2015), as a Learner copies them. */
const FIGURES = {
  sales: "2,479.36",
  operatingProfit: "109.59",
  taxPercent: "33.99",
  debt: "4998.4",
  cash: "3679.63",
  price: "328",
} as const;

test("a Spine-passed Learner values an Indian company from the Course Map to a note in the Notebook", async ({ person }) => {
  test.setTimeout(180_000); // the dev server compiles each page on first visit
  const { page } = await person({ person: "ravi" });
  await page.goto("/course");
  await page.locator("[data-assignment-link]").click();
  await expect(page).toHaveURL(/\/assignment$/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Assignment: value a company you pick" })).toBeVisible();

  const form = page.locator("[data-own-case-form]");
  await form.getByLabel("Company").fill("Coffee Day Enterprises");
  await form.getByLabel("Date of the annual report").fill("2015-10-21");
  await form.locator('[data-industry="food"]').click();
  await expect(form.locator("[data-own-case-estimate]")).toContainText("Your Estimate opens at the industry");
  for (const [key, value] of Object.entries(FIGURES)) await form.locator(`[data-own-case-field="${key}"]`).fill(value);

  // No shares typed yet: a readable message, never an error page.
  await form.getByRole("button", { name: "Value it" }).click();
  await expect(form.locator('[data-own-case-result="problem"]')).toHaveText("The share count must be above zero.");
  await expect(form.getByRole("button", { name: "Save to Notebook" })).toHaveCount(0);

  await form.locator('[data-own-case-field="shares"]').fill("20,60,01,719");
  await form.getByRole("button", { name: "Value it" }).click();
  const value = form.locator('[data-own-case-result="value"]');
  await expect(value).toContainText(/^The engine's value: -?₹[\d,.]+ a share, beside a price of ₹328 on 21 Oct 2015\.$/);
  await form.getByRole("button", { name: "Save to Notebook" }).click();
  await expect(form.locator("[data-own-case-saved]")).toContainText("Saved to your Notebook.");

  await form.getByRole("link", { name: "Open the Notebook" }).click();
  await expect(page).toHaveURL(/\/notebook#own-cases$/, { timeout: 60_000 }); // the dev server compiles the Notebook on first visit
  const note = page.locator("#own-cases [data-own-case-note]").first();
  await expect(note).toContainText("Coffee Day Enterprises");
  await expect(note).toContainText("Coffee Day Enterprises, India. Annual report of 21 Oct 2015. Industry: Food processors.");
  await expect(note).toContainText("price ₹328 on 21 Oct 2015");
  await expect(note).toContainText("The engine's value: ");
});

test("a Learner who has not passed the Spine finds the Assignment closed", async ({ person }) => {
  test.setTimeout(120_000);
  const { page } = await person({ person: "asha" });
  await page.goto("/course");
  await expect(page.locator('section[data-stage="assignment"]')).toContainText("Opens once you pass every Spine Topic");
  await expect(page.locator("[data-assignment-link]")).toHaveCount(0);
  await page.goto("/assignment");
  await expect(page.locator("[data-assignment-closed]")).toContainText("The Assignment opens once you pass every Spine Topic.");
  await expect(page.locator("[data-own-case-form]")).toHaveCount(0);
});

/** Apple's Form 10-K for the year to 27 Sep 2025, in $ millions, as a Learner copies it (#113). */
const APPLE = {
  sales: "416,161",
  operatingProfit: "133,050",
  taxPercent: "21",
  debt: "98,657",
  cash: "35,934",
  shares: "14,776,353,000",
  price: "255.46",
} as const;

test("[#113] a Spine-passed Learner values a US company from its 10-K, with the guide and the dated US readings, to a note", async ({ person }) => {
  test.setTimeout(180_000);
  const { page } = await person({ person: "ravi" });
  await page.goto("/assignment");
  const form = page.locator("[data-own-case-form]");
  await form.locator('[data-market="US"]').click();

  // The guide: where the 10-K puts each figure, every line with a working source link.
  await expect(form.locator("[data-report-guide]")).toContainText("Form 10-K");
  const lines = form.locator("[data-guide-line]");
  await expect(lines).toHaveCount(8);
  for (const line of await lines.all()) await expect(line.locator("a")).toHaveAttribute("href", /^https:\/\/www\.(sec|investor|nasdaq)\.(gov|com)\//);
  await expect(form.locator('[data-guide-line="sales"]')).toContainText("Item 8");

  await form.getByLabel("Company").fill("Apple Inc.");
  await form.getByLabel("Date of the annual report").fill("2025-09-27");
  await form.locator('[data-industry="software"]').click();
  // The US yardsticks and the risk-free reading, each dated, credited and linked.
  const readings = form.getByTestId("market-reading");
  await expect(readings).toHaveCount(4);
  for (const reading of await readings.all()) {
    await expect(reading.getByTestId("reading-date")).toHaveText(/^\((Jan|Oct) 2026\)$/);
    await expect(reading.getByTestId("reading-credit")).toHaveAttribute("href", /^https:\/\/(pages\.stern\.nyu\.edu|home\.treasury\.gov)\//);
  }
  await expect(form.locator('[data-reading="us-treasury-10y"]')).toContainText("4.94%");
  await expect(form.locator("[data-own-case-estimate]")).toContainText("$1.54 of sales for each $1 invested");
  await form.locator('[data-industry="market"]').click();
  for (const [key, value] of Object.entries(APPLE)) await form.locator(`[data-own-case-field="${key}"]`).fill(value);

  await form.getByRole("button", { name: "Value it" }).click();
  await expect(form.locator('[data-own-case-result="value"]')).toContainText(/^The engine's value: -?\$[\d,.]+ a share, beside a price of \$255 on 27 Sep 2025\.$/);
  await form.getByRole("button", { name: "Save to Notebook" }).click();
  await expect(form.locator("[data-own-case-saved]")).toContainText("Saved to your Notebook.");

  await form.getByRole("link", { name: "Open the Notebook" }).click();
  await expect(page).toHaveURL(/\/notebook#own-cases$/, { timeout: 60_000 }); // the dev server compiles the Notebook on first visit
  const note = page.locator("#own-cases [data-own-case-note]").first();
  await expect(note).toContainText("Apple Inc., the US. Annual report of 27 Sep 2025.");
  await expect(note).toContainText("14,776,353,000 shares, price $255 on 27 Sep 2025");
  await expect(note).toContainText("The engine's value: $");
});
