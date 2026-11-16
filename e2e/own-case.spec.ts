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
  await expect(page).toHaveURL(/\/assignment$/);
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
  await expect(page).toHaveURL(/\/notebook#own-cases$/);
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

test("beside every field, the Own Case form shows where it sits in an Indian annual report, a source link and a Lingo card (#108)", async ({ person }) => {
  test.setTimeout(120_000);
  const { page } = await person({ person: "ravi" });
  await page.goto("/assignment");
  const form = page.locator("[data-own-case-form]");
  const fields = ["company", "reportDate", "sales", "operatingProfit", "taxPercent", "debt", "cash", "shares", "price"];
  await expect(form.locator("[data-own-case-guide]")).toHaveCount(fields.length);
  for (const field of fields) {
    const guide = form.locator(`[data-own-case-guide="${field}"]`);
    await expect(guide.locator("[data-guide-where]")).toBeVisible();
    await expect(guide.locator("a[data-guide-source]")).toHaveAttribute("href", /^https:\/\//);
    const card = guide.locator('[data-testid="lingo-card"]');
    await expect(card).toBeHidden();
    await guide.locator("[data-guide-lingo] > summary").click();
    await expect(card).toBeVisible();
  }
  await expect(form.locator('[data-own-case-guide="sales"] [data-guide-where]')).toContainText("Revenue from operations");
  await expect(form.locator('[data-own-case-guide="sales"] [data-testid="lingo-card"]')).toContainText("Revenue from operations");
  await expect(form.locator('[data-own-case-guide="debt"] a[data-guide-source]')).toContainText("Ind AS 116");
});
