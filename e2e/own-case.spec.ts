import { expect } from "@playwright/test";
import { openingEstimate, valueOwnCase } from "../src/finance/own-case";
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
  await expect(page).toHaveURL(/\/assignment$/, { timeout: 60_000 }); // the dev server compiles /assignment on first visit
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
  await expect(value).toBeVisible();
  // G15: an edit after Value it clears the result, so Save never stores figures the screen did not value.
  await form.locator('[data-own-case-field="cash"]').fill("3679");
  await expect(value).toHaveCount(0);
  await expect(form.getByRole("button", { name: "Save to Notebook" })).toHaveCount(0);
  await form.locator('[data-own-case-field="cash"]').fill(FIGURES.cash);
  await form.getByRole("button", { name: "Value it" }).click();
  // G17: India's yardsticks are of Jan 2026, long after a 2015 report: the form says so on screen.
  await expect(form.locator("[data-own-case-later-readings]")).toHaveText(
    "Dated after your report’s date (21 Oct 2015): the industry's yardsticks of Jan 2026. Nobody knew them on that day, so your Estimate opens at figures from after the price.",
  );
  // On the industry's opening Estimate, Coffee Day's debt outweighs its business: never a negative price (F06), but ₹0
  // and the words Value levers uses, on screen and in the note.
  await expect(value).toHaveText("The engine's value: ₹0 a share, beside a price of ₹328 on 21 Oct 2015. Lenders take everything: nothing is left for shareholders.");
  await expect(form.locator("[data-own-case-options]")).toHaveText("Employee stock options are not entered: the engine counts none.");
  await form.getByRole("button", { name: "Save to Notebook" }).click();
  await expect(form.locator("[data-own-case-saved]")).toContainText("Saved to your Notebook.");

  await form.getByRole("link", { name: "Open the Notebook" }).click();
  await expect(page).toHaveURL(/\/notebook#own-cases$/, { timeout: 60_000 }); // the dev server compiles the Notebook on first visit
  const note = page.locator("#own-cases [data-own-case-note]").first();
  await expect(note).toContainText("Coffee Day Enterprises");
  await expect(note).toContainText("Coffee Day Enterprises, India. Annual report of 21 Oct 2015. Industry: Food processors.");
  await expect(note).toContainText("price ₹328 on 21 Oct 2015");
  await expect(note).toContainText("The engine's value: ₹0 a share");
  await expect(note).toContainText("nothing is left for shareholders");
});

/** The engine's value a share in a sentence: "₹-12.3" -> -12.3. */
const rupees = (text: string) => Number(/(-?)₹(-?[\d,.]+) a share/.exec(text)!.slice(1).join("").replace(/,/g, ""));

test("[#111] Go deeper on an Own Case opens the Full sheet, says where each input came from, and a row's slider or tap revalues it", async ({ person }) => {
  test.setTimeout(180_000);
  const { page } = await person({ person: "ravi" });
  await page.goto("/assignment");
  const form = page.locator("[data-own-case-form]");
  await form.getByLabel("Company").fill("Coffee Day Enterprises");
  await form.getByLabel("Date of the annual report").fill("2015-10-21");
  await form.locator('[data-industry="food"]').click();
  for (const [key, value] of Object.entries({ ...FIGURES, shares: "20,60,01,719" })) await form.locator(`[data-own-case-field="${key}"]`).fill(value);
  await form.getByRole("button", { name: "Value it" }).click();
  const formValue = await form.locator('[data-own-case-result="value"]').textContent();

  const deeper = page.getByTestId("own-case-go-deeper");
  await deeper.getByText("Go deeper: the Full sheet").click();
  const sheet = deeper.getByTestId("full-sheet");
  const origin = (row: string) => sheet.locator(`[data-row="${row}"] [data-origin]`);
  for (const row of ["baseRevenue", "taxRate", "cash", "debt", "shares", "price"]) await expect(origin(row), row).toHaveAttribute("data-origin", "typed");
  for (const row of ["salesToCapital", "costOfCapital", "marginAfter"]) await expect(origin(row), row).toHaveAttribute("data-origin", "yardstick");
  for (const row of ["growth", "growthAfter", "returnOnCapitalAfter", "lossesCarried", "options", "failure"]) await expect(origin(row), row).toHaveAttribute("data-origin", "default");
  await expect(origin("returnOnCapitalAfter")).toHaveText("A default: the same as the cost of capital after year 10");
  await expect(origin("margin")).toHaveText("You typed it; then the industry's yardstick");
  await expect(sheet.locator('[data-row="price"]')).toContainText("₹328");
  // Nothing on the sheet can be typed into: sliders and tap buttons only (ADR 0020).
  await expect(sheet.locator('input:not([type="range"]), textarea')).toHaveCount(0);

  // The sheet and the form agree: Coffee Day's value is below zero on this Estimate, so both read ₹0 (F06).
  const value = deeper.getByTestId("own-case-sheet-value");
  expect(rupees((await value.textContent())!)).toBe(rupees(formValue!));
  await expect(value).toHaveText("The engine's value with these rows: ₹0 a share. Lenders take everything: nothing is left for shareholders.");

  // A slider: no debt at all is the value of typing a debt of 0 into the form.
  const debt = sheet.getByRole("slider", { name: "Change: Debt the company owes" });
  await expect(async () => {
    await debt.fill("0");
    await expect(debt).toHaveValue("0", { timeout: 500 });
  }).toPass();
  const noDebt = valueOwnCase(
    { company: "Coffee Day Enterprises", market: "IN", reportDate: "2015-10-21", industry: "food", sales: 2479.36, operatingProfit: 109.59, taxPercent: 33.99, debt: 0, cash: 3679.63, shares: 206_001_719, price: 328 },
    openingEstimate("food"),
  );
  if (!noDebt.ok) throw new Error(noDebt.error);
  // The sentence rounds to whole rupees.
  await expect.poll(async () => Math.abs(rupees((await value.textContent())!) - noDebt.valuePerShare)).toBeLessThanOrEqual(0.5);
  await expect(sheet.locator('[data-row="debt"]')).toHaveAttribute("data-moved", "true");

  // A tap: one step more cash raises the value.
  const before = rupees((await value.textContent())!);
  await sheet.getByRole("button", { name: "Increase Change: Cash the company holds by one step" }).click();
  await expect.poll(async () => rupees((await value.textContent())!)).toBeGreaterThan(before);
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
  const fields = ["company", "reportDate", "industry", "sales", "operatingProfit", "taxPercent", "debt", "cash", "shares", "price"];
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

/**
 * Apple's Form 10-K for the year to 27 Sep 2025, in $ millions, as a Learner copies it (#113). Dated when its figures were
 * public (F07, G33): EDGAR's "Filing Date" 2025-10-31
 * (https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/0000320193-25-000079-index.html), with Nasdaq's
 * close that day, $270.37 (Yahoo Finance AAPL daily history, read 2026-11-16). The tax rate is the combined federal and
 * state rate, about 25% (M04: OECD 25.53% for 2026); the debt counts the leases note's lease liabilities, 13,720, beside
 * commercial paper and term debt (M05).
 */
const APPLE = {
  sales: "416,161",
  operatingProfit: "133,050",
  taxPercent: "25",
  debt: "112,377",
  cash: "35,934",
  shares: "14,776,353,000",
  price: "270.37",
} as const;

test("[#113] a Spine-passed Learner values a US company from its 10-K, with the guide and the dated US readings, to a note", async ({ person }) => {
  test.setTimeout(180_000);
  const { page } = await person({ person: "ravi" });
  await page.goto("/assignment");
  const form = page.locator("[data-own-case-form]");
  await form.locator('[data-market="US"]').click();

  // The guide: where the 10-K puts each figure, every line with a working source link and a Lingo card (#108's markup).
  const guides = form.locator("[data-own-case-guide]");
  await expect(guides).toHaveCount(10);
  for (const guide of await guides.all()) await expect(guide.locator("a[data-guide-source]")).toHaveAttribute("href", /^https:\/\/www\.(sec|investor|nasdaq|oecd)\.(gov|com|org)\//);
  // M04: the combined federal and state rate, as the US yardsticks assume; M05: leases count as debt.
  await expect(form.locator('[data-own-case-guide="taxPercent"] [data-guide-where]')).toContainText("about 25%");
  await expect(form.locator("#own-case-taxPercent-hint")).toContainText("federal and state together");
  await expect(form.locator("#own-case-debt-hint")).toHaveText("Borrowings and lease liabilities, long and short, in $ millions.");
  await expect(form.locator('[data-own-case-guide="debt"] [data-guide-where]')).toContainText("lease liabilities");
  await expect(form.locator('[data-own-case-guide="company"] [data-guide-where]')).toContainText("EDGAR");
  await expect(form.locator('[data-own-case-guide="sales"] [data-guide-where]')).toContainText("Item 8");
  await expect(form.locator('[data-own-case-guide="sales"] [data-guide-lingo] > summary')).toHaveText("Lingo: Net sales");

  await form.getByLabel("Company").fill("Apple Inc.");
  await form.getByLabel("Date of the annual report").fill("2025-10-31");
  await form.locator('[data-industry="software"]').click();
  // The US risk-free reading and the industry's yardsticks, each dated, credited and linked.
  const riskFree = form.locator('[data-risk-free="us-risk-free-10y"]');
  await expect(riskFree).toContainText("4.94% on 30 Oct 2026");
  await expect(riskFree.locator("a[data-reading-source]")).toHaveAttribute("href", /^https:\/\/home\.treasury\.gov\//);
  // G24: each reading's credit is text on the page, not hover text.
  await expect(riskFree.locator("[data-reading-credit]")).toBeVisible();
  await expect(riskFree.locator("[data-reading-credit]")).toHaveText(/^Credit: .+\.$/);
  const readings = form.getByTestId("market-reading");
  await expect(readings).toHaveCount(3);
  for (const reading of await readings.all()) {
    await expect(reading.getByTestId("reading-date")).toHaveText("(Jan 2026)");
    await expect(reading.getByTestId("reading-credit")).toHaveAttribute("href", /^https:\/\/pages\.stern\.nyu\.edu\/~adamodar\/pc\/datasets\/(margin|capex|wacc)\.xls$/);
  }
  await expect(form.locator("[data-own-case-estimate]")).toContainText("$1.54 of sales for each $1 invested");
  // G21: each yardstick links its own sheet; G24: the credit is visible.
  const estimateLine = form.locator("[data-own-case-estimate]");
  await expect(estimateLine.locator('[data-yardstick-source="operating_margin"]')).toHaveAttribute("href", /\/margin\.xls$/);
  await expect(estimateLine.locator('[data-yardstick-source="sales_to_capital"]')).toHaveAttribute("href", /\/capex\.xls$/);
  await expect(estimateLine.locator('[data-yardstick-source="cost_of_capital"]')).toHaveAttribute("href", /\/wacc\.xls$/);
  await expect(estimateLine.locator("[data-yardstick-credit]")).toHaveText("Credit: Aswath Damodaran, NYU Stern.");
  // G17: the Treasury reading (30 Oct 2026) and the yardsticks (Jan 2026) both come after a 10-K filed on 31 Oct 2025.
  await expect(form.locator("[data-own-case-later-readings]")).toContainText("Dated after your report’s date (31 Oct 2025): the 10-year US Treasury yield (US) of 30 Oct 2026 and the industry's yardsticks of Jan 2026.");
  await form.locator('[data-industry="market"]').click();
  for (const [key, value] of Object.entries(APPLE)) await form.locator(`[data-own-case-field="${key}"]`).fill(value);

  await form.getByRole("button", { name: "Value it" }).click();
  await expect(form.locator('[data-own-case-result="value"]')).toContainText(/^The engine's value: -?\$[\d,.]+ a share, beside a price of \$270 on 31 Oct 2025\.$/);
  await form.getByRole("button", { name: "Save to Notebook" }).click();
  await expect(form.locator("[data-own-case-saved]")).toContainText("Saved to your Notebook.");

  await form.getByRole("link", { name: "Open the Notebook" }).click();
  await expect(page).toHaveURL(/\/notebook#own-cases$/, { timeout: 60_000 }); // the dev server compiles the Notebook on first visit
  const note = page.locator("#own-cases [data-own-case-note]").first();
  await expect(note).toContainText("Apple Inc., the US. Annual report of 31 Oct 2025.");
  await expect(note).toContainText("14,776,353,000 shares, price $270 on 31 Oct 2025");
  await expect(note).toContainText("The engine's value: $");
});
