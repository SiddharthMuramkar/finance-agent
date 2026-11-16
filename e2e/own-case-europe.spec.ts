import { expect } from "@playwright/test";
import { test } from "./support/people";

/**
 * Spec #68, More markets (#115): a Spine-passed Learner values one European company, from the market pick to the one-page
 * note in the Notebook. Beside each figure the form shows where it sits in a European (IFRS) annual report, with a source
 * link and a Lingo card; the Bund's dated risk-free reading and Europe's dated yardsticks show with their sources.
 * Danone's 2025 figures (see src/finance/own-case-europe.test.ts for each one's place in the report), dated when they were
 * public (F07, G33): the 2025 Universal Registration Document was filed with the AMF on 4 March 2026 (Danone's press
 * release, https://www.danone.com/content/dam/corp/global/danonecom/investors/fr-all-publications/2026/pressreleases/cpdanone040326.pdf),
 * and Euronext Paris closed BN at €70.94 that day (Yahoo Finance BN.PA daily history, read 2026-11-16).
 */

test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "mbp14", "one viewport is enough here");
});

const DANONE = { sales: "27,283", operatingProfit: "2,940", taxPercent: "25.83", debt: "14,419", cash: "6,553", shares: "640,172,858", price: "70.94" } as const;

test("a Spine-passed Learner values a European company, from the pick to a note in the Notebook", async ({ person }) => {
  test.setTimeout(240_000); // the dev server compiles each page on first visit
  const { page } = await person({ person: "ravi" });
  await page.goto("/assignment");
  const form = page.locator("[data-own-case-form]");
  await form.locator('[data-market="EU"]').click();

  const riskFree = form.locator('[data-risk-free="eu-risk-free-10y"]');
  await expect(riskFree).toContainText("3.4% on 30 Oct 2026");
  await expect(riskFree.locator("[data-reading-source]")).toHaveAttribute("href", /^https:\/\/api\.statistiken\.bundesbank\.de\//);
  // G27: named as the Bundesbank's yield-curve rate; G24: its credit is text on the page.
  await expect(riskFree).toContainText("10-year rate on the German federal bond yield curve (Europe)");
  await expect(riskFree.locator("[data-reading-credit]")).toHaveText("Credit: Deutsche Bundesbank.");
  // G09: the Europe Own Case is for companies that report and trade in euros.
  await expect(form.locator('[data-own-case-guide="company"] [data-guide-where]')).toContainText("whose shares trade in euros");
  await expect(form.locator('[data-own-case-guide="price"] [data-guide-where]')).not.toContainText("London");

  const guides = form.locator("[data-own-case-guide]");
  await expect(guides).toHaveCount(10);
  for (const guide of await guides.all()) await expect(guide.locator("a[data-guide-source]")).toHaveAttribute("href", /^https:\/\//);
  await expect(form.locator('[data-own-case-guide="sales"] [data-guide-where]')).toContainText("TEUR");
  await form.locator('[data-own-case-guide="debt"] [data-guide-lingo] > summary').click();
  await expect(form.locator('[data-own-case-guide="debt"] [data-testid="lingo-card"]')).toContainText("Lease liability");
  await expect(form.locator('[data-own-case-field="sales"] ~ p').first()).toContainText("€ millions");

  await form.getByLabel("Company").fill("Danone");
  await form.getByLabel("Date of the annual report").fill("2026-03-04");
  await form.locator('[data-industry="food"]').click();
  const estimate = form.locator("[data-own-case-estimate]");
  await expect(estimate).toContainText("fading to 3.4%; the margin heading for 9.37%; €1.88 of sales for each €1 invested; cost of capital 4.77%");
  // G21: each yardstick links its own sheet, not the cost of capital sheet for all three.
  await expect(estimate.locator('[data-yardstick-source="operating_margin"]')).toHaveAttribute("href", "https://pages.stern.nyu.edu/~adamodar/pc/datasets/marginEurope.xls");
  await expect(estimate.locator('[data-yardstick-source="sales_to_capital"]')).toHaveAttribute("href", "https://pages.stern.nyu.edu/~adamodar/pc/datasets/capexEurope.xls");
  await expect(estimate.locator('[data-yardstick-source="cost_of_capital"]')).toHaveAttribute("href", "https://pages.stern.nyu.edu/~adamodar/pc/datasets/waccEurope.xls");
  await expect(estimate).toContainText("Jan 2026");
  await expect(estimate.locator("[data-yardstick-credit]")).toHaveText("Credit: Aswath Damodaran, NYU Stern.");
  // G17: the Bund reading of 30 Oct 2026 is after the report; the yardsticks (5 Jan 2026) are before it.
  await expect(form.locator("[data-own-case-later-readings]")).toContainText(
    "Dated after your report’s date (4 Mar 2026): the 10-year rate on the German federal bond yield curve (Europe) of 30 Oct 2026. Nobody knew them on that day",
  );

  for (const [key, value] of Object.entries(DANONE)) await form.locator(`[data-own-case-field="${key}"]`).fill(value);
  await form.getByRole("button", { name: "Value it" }).click();
  await expect(form.locator('[data-own-case-result="value"]')).toHaveText(/^The engine's value: €[\d,.]+ a share, beside a price of €71 on 4 Mar 2026\.$/);
  await form.getByRole("button", { name: "Save to Notebook" }).click();
  await expect(form.locator("[data-own-case-saved]")).toContainText("Saved to your Notebook.", { timeout: 60_000 }); // the save route compiles on first call

  await form.getByRole("link", { name: "Open the Notebook" }).click();
  await expect(page).toHaveURL(/\/notebook#own-cases$/, { timeout: 60_000 });
  const note = page.locator("#own-cases [data-own-case-note]").filter({ hasText: "Danone, Europe. Annual report of 4 Mar 2026. Industry: Food processors." }).first();
  await expect(note).toBeVisible({ timeout: 30_000 });
  await expect(note).toContainText("price €71 on 4 Mar 2026");
});
