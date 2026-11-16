import { expect, type Locator } from "@playwright/test";
import { test } from "./support/people";

/**
 * Spec #68, More markets (#114): a Spine-passed Learner values one Japanese and one Korean company, from the market pick
 * to the one-page note in the Notebook. Beside each figure the form shows where it sits in that market's annual report,
 * with a source link and a Lingo card, and the market's dated risk-free reading with its source. The figures are the
 * companies' own (see src/finance/own-case-japan-korea.test.ts for each one's place in the report). Each Own Case is
 * dated when its figures were public, never at the year end (F07, G33), with that day's close:
 * - Kikkoman's Yuho was filed on EDINET on 2026-06-19 (S100YE5V, 【提出日】); TSE close that day ¥1,540 (irbank.net and
 *   kabutore.biz daily prices for 2801, read 2026-11-16).
 * - Samsung Electronics' 2025 사업보고서 was filed on DART on 2026-03-10 (접수일자, https://dart.fss.or.kr); KRX close that
 *   day ₩187,900 (Naver Finance daily prices for 005930, read 2026-11-16).
 */

test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "mbp14", "one viewport is enough here");
});

const MARKETS = [
  {
    market: "JP",
    company: "Kikkoman",
    reportDate: "2026-06-19",
    industry: "food",
    figures: { sales: "745,539", operatingProfit: "75,940", taxPercent: "30.5", debt: "61,429", cash: "111,770", shares: "927,741,900", price: "1,540" },
    riskFree: { id: "jp-risk-free-10y", text: "2.817% on 30 Oct 2026", host: "https://www.mof.go.jp/" },
    report: "営業利益",
    industries: ["auto", "food", "software", "market"],
    costOfCapital: "cost of capital 3.84%.",
    value: /^The engine's value: ¥[\d,]+ a share, beside a price of ¥1,540 on 19 Jun 2026\.$/,
    note: "Kikkoman, Japan. Annual report of 19 Jun 2026. Industry: Food processors.",
  },
  {
    market: "KR",
    company: "Samsung Electronics",
    reportDate: "2026-03-10",
    industry: "market",
    figures: { sales: "333,605,938", operatingProfit: "43,601,051", taxPercent: "26.4", debt: "25,239,139", cash: "57,856,378", shares: "6,630,180,138", price: "187,900" },
    riskFree: { id: "kr-risk-free-10y", text: "4.008% on 30 Oct 2026", host: "https://ecos.bok.or.kr/" },
    report: "영업이익",
    // No software pick in Korea (G07); the cost of capital is in won (G11).
    industries: ["auto", "food", "market"],
    costOfCapital: "cost of capital 8.92%.",
    value: /^The engine's value: ₩[\d,]+ a share, beside a price of ₩187,900 on 10 Mar 2026\.$/,
    note: "Samsung Electronics, Korea. Annual report of 10 Mar 2026. Industry: Any other firm (not a bank or insurer).",
  },
] as const;

/** Every figure has a guide line with an https source link and a Lingo card that opens. */
async function expectGuides(form: Locator, report: string) {
  const lines = form.locator("[data-own-case-guide]");
  await expect(lines).toHaveCount(10);
  for (const line of await lines.all()) {
    await expect(line.locator("[data-guide-source]")).toHaveAttribute("href", /^https:\/\//);
    await expect(line.locator("[data-guide-lingo] summary")).toContainText("Lingo: ");
  }
  await expect(form.locator('[data-own-case-guide="operatingProfit"]')).toContainText(report);
  await form.locator('[data-own-case-guide="operatingProfit"] [data-guide-lingo] summary').click();
  await expect(form.locator('[data-own-case-guide="operatingProfit"] [data-testid="lingo-card"]')).toBeVisible();
}

test("a Spine-passed Learner values a Japanese and a Korean company, from the pick to a note in the Notebook", async ({ person }) => {
  test.setTimeout(240_000); // the dev server compiles each page on first visit
  const { page } = await person({ person: "ravi" });
  for (const m of MARKETS) {
    await page.goto("/assignment");
    const form = page.locator("[data-own-case-form]");
    await form.locator(`[data-market="${m.market}"]`).click();
    const riskFree = form.locator(`[data-risk-free="${m.riskFree.id}"]`);
    await expect(riskFree).toContainText(m.riskFree.text);
    await expect(riskFree.locator("[data-reading-source]")).toHaveAttribute("href", new RegExp(`^${m.riskFree.host.replace(/\./g, "\\.")}`));
    await expect(riskFree.locator("[data-reading-credit]")).toHaveText(/^Credit: .+\.$/); // G24: visible, not hover text
    await expectGuides(form, m.report);

    await form.getByLabel("Company").fill(m.company);
    await form.getByLabel("Date of the annual report").fill(m.reportDate);
    await expect(form.locator("[data-industry]")).toHaveCount(m.industries.length);
    for (const id of m.industries) await expect(form.locator(`[data-industry="${id}"]`)).toBeVisible();
    await form.locator(`[data-industry="${m.industry}"]`).click();
    await expect(form.locator("[data-own-case-estimate]")).toContainText("Your Estimate opens at the industry");
    await expect(form.locator("[data-own-case-estimate]")).toContainText(m.costOfCapital);
    await expect(form.locator("#own-case-debt-hint")).toContainText("Borrowings and lease liabilities");
    // G17: the risk-free reading of 30 Oct 2026 is dated after either report, and the form says so.
    await expect(form.locator("[data-own-case-later-readings]")).toContainText(`of 30 Oct 2026`);
    for (const [key, value] of Object.entries(m.figures)) await form.locator(`[data-own-case-field="${key}"]`).fill(value);
    await form.getByRole("button", { name: "Value it" }).click();
    await expect(form.locator('[data-own-case-result="value"]')).toHaveText(m.value);
    await form.getByRole("button", { name: "Save to Notebook" }).click();
    await expect(form.locator("[data-own-case-saved]")).toContainText("Saved to your Notebook.");

    await form.getByRole("link", { name: "Open the Notebook" }).click();
    await expect(page).toHaveURL(/\/notebook#own-cases$/, { timeout: 30_000 }); // the dev server may compile the Notebook here
    await expect(page.locator("#own-cases [data-own-case-note]").filter({ hasText: m.note }).first()).toBeVisible();
  }
});
