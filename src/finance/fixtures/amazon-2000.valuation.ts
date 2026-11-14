import type { ValuationBlockInput } from "../valuation-case.ts";

// Damodaran's valuation of Amazon.com in February 2000, as a `valuation:` block (spec 2026-11-12, Appendix B.1).
// Every input is in the val-dcf Topic's Case story (course/topics/val-dcf.yaml, Case amazon-dcf-2000), which took them
// from the paper's tables on cash flows and cost of capital. Dollars in millions; shares in millions.
// The engine gives $35.04 a share against the paper's $35.08: the paper rounds its costs of capital to two decimals.

/** Where this block's figures are taught. */
export const AMAZON_2000_CASE = { topic: "val-dcf", case: "amazon-dcf-2000" } as const;

export const AMAZON_2000 = {
  currency: "USD",
  unit: "millions",
  // Revenue for the twelve months to September 1999.
  baseRevenue: 1117,
  growthPercent: [150, 100, 75, 50, 30, 25.2, 20.4, 15.6, 10.8, 6],
  // An operating loss of $410m on $1,117m, closing half the gap to 10% each year: 9.95% in year 10, 10% after.
  margin: { startPercent: -36.71, targetPercent: 10, afterPercent: 10 },
  taxPercent: 35,
  lossesCarried: 500,
  salesToCapital: 3,
  costOfCapitalPercent: [12.84, 12.84, 12.84, 12.83, 12.81, 12.13, 11.62, 11.08, 10.49, 9.61],
  growthAfterPercent: 6,
  returnOnCapitalAfterPercent: 20,
  cash: 26,
  debt: 349,
  options: 2892,
  shares: 340.79,
  per: "share",
  // About $84 was the close on 3 February 2000, after the fourth-quarter results; the paper says only February 2000.
  price: { value: 84, date: "2000-02-03", note: "The close on 3 February 2000, after the fourth-quarter results; the paper says only February 2000." },
  illustration: false,
  published: {
    valuePerShare: 35.08,
    fcff: [-931, -1024, -989, -758, -408, -163, 177, 625, 1174, 1788],
    note: "Terminal value $52,148m (1,881 / (9.6075% - 6%); the paper prints 9.61%), operating assets $15,170m, equity $14,847m before and $11,955m after the options, over 340.79m shares: $35.08 (his sheet: $35.0805). With the printed two-decimal costs of capital the engine gives $35.04; the gap is rounding.",
  },
  sources: [
    {
      title: "Damodaran, The Dark Side of Valuation: Firms with no Earnings, no History and no Comparables. Can Amazon.com be valued? (March 2000; valuation done Feb 2000)",
      url: "https://pages.stern.nyu.edu/~adamodar/pdfiles/papers/HighGrow.pdf",
    },
    {
      title: "Damodaran, amazon2000.xls: the valuation spreadsheet, listed on his Company Valuations page as 'Amazon.com in January 2000'",
      url: "https://pages.stern.nyu.edu/~adamodar/pc/eqegs/amazon2000.xls",
    },
    { title: "Damodaran, Valuation seminar slides (techval.pdf, March 2000): Amazon cost of capital", url: "https://pages.stern.nyu.edu/~adamodar/pdfiles/Seminars/techval.pdf" },
    {
      title: "Amazon.com Form 10-K405 for 2000 (SEC EDGAR 0001032210-01-500087)",
      url: "https://www.sec.gov/Archives/edgar/data/1018724/000103221001500087/d10k405.txt",
    },
  ],
  reproduces: true,
} satisfies ValuationBlockInput;
