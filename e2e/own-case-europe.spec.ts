import { expect } from "@playwright/test";
import { test } from "./support/people";

/**
 * Spec #68, More markets (#115): a Spine-passed Learner values one European company, from the market pick to the one-page
 * note in the Notebook. Beside each figure the form shows where it sits in a European (IFRS) annual report, with a source
 * link and a Lingo card; the Bund's dated risk-free reading and Europe's dated yardsticks show with their sources.
 * Danone's 2025 figures (see src/finance/own-case-europe.test.ts for each one's place in the report).
 */

test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "mbp14", "one viewport is enough here");
});

const DANONE = { sales: "27,283", operatingProfit: "2,940", taxPercent: "25.83", debt: "14,419", cash: "6,553", shares: "640,172,858", price: "76.78" } as const;

test("a Spine-passed Learner values a European company, from the pick to a note in the Notebook", async ({ person }) => {
  test.setTimeout(240_000); // the dev server compiles each page on first visit
  const { page } = await person({ person: "ravi" });
  await page.goto("/assignment");
  const form = page.locator("[data-own-case-form]");
  await form.locator('[data-market="EU"]').click();

  const riskFree = form.locator('[data-risk-free="eu-risk-free-10y"]');
  await expect(riskFree).toContainText("3.4% on 30 Oct 2026");
  await expect(riskFree.locator("[data-reading-source]")).toHaveAttribute("href", /^https:\/\/api\.statistiken\.bundesbank\.de\//);

  const guides = form.locator("[data-own-case-guide]");
  await expect(guides).toHaveCount(9);
  for (const guide of await guides.all()) await expect(guide.locator("a[data-guide-source]")).toHaveAttribute("href", /^https:\/\//);
  await expect(form.locator('[data-own-case-guide="sales"] [data-guide-where]')).toContainText("TEUR");
  await form.locator('[data-own-case-guide="debt"] [data-guide-lingo] > summary').click();
  await expect(form.locator('[data-own-case-guide="debt"] [data-testid="lingo-card"]')).toContainText("Lease liability");
  await expect(form.locator('[data-own-case-field="sales"] ~ p').first()).toContainText("€ millions");

  await form.getByLabel("Company").fill("Danone");
  await form.getByLabel("Date of the annual report").fill("2025-12-31");
  await form.locator('[data-industry="food"]').click();
  const estimate = form.locator("[data-own-case-estimate]");
  await expect(estimate).toContainText("fading to 3.4%; the margin heading for 9.37%; €1.88 of sales for each €1 invested; cost of capital 4.77%");
  await expect(estimate.locator("[data-yardstick-source]")).toHaveAttribute("href", "https://pages.stern.nyu.edu/~adamodar/pc/datasets/waccEurope.xls");
  await expect(estimate).toContainText("Jan 2026");

  for (const [key, value] of Object.entries(DANONE)) await form.locator(`[data-own-case-field="${key}"]`).fill(value);
  await form.getByRole("button", { name: "Value it" }).click();
  await expect(form.locator('[data-own-case-result="value"]')).toHaveText(/^The engine's value: €[\d,.]+ a share, beside a price of €77 on 31 Dec 2025\.$/);
  await form.getByRole("button", { name: "Save to Notebook" }).click();
  await expect(form.locator("[data-own-case-saved]")).toContainText("Saved to your Notebook.");

  await form.getByRole("link", { name: "Open the Notebook" }).click();
  await expect(page).toHaveURL(/\/notebook#own-cases$/);
  const note = page.locator("#own-cases [data-own-case-note]").filter({ hasText: "Danone, Europe. Annual report of 31 Dec 2025. Industry: Food processors." }).first();
  await expect(note).toBeVisible();
  await expect(note).toContainText("price €77 on 31 Dec 2025");
});
