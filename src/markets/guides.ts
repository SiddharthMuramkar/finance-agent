import { z } from "zod";
import { isIconName } from "../icons/names.ts";

// The annual-report guide (spec #68, ticket #108; user story 80): beside each Own Case field, where that number sits in
// one market's annual report, with a link to the rule or record that says so and a Lingo card for the word the Learner
// meets there, so a Learner can find every number alone. Guides live in git so the course check (scripts/check-course.mjs,
// no database) fails a guide line with no source. One guide per market (India #108, the US #113); more markets (#114, #115) add their lines here.
// Imports only packages and relative modules, so plain Node runs it.

/** The Own Case fields a guide covers: the company, the report's date and the seven figures typed from the report. */
export const GUIDE_FIELDS = ["company", "reportDate", "sales", "operatingProfit", "taxPercent", "debt", "cash", "shares", "price"] as const;
export type GuideField = (typeof GUIDE_FIELDS)[number];

/** A Lingo card's makings, as the LingoCard Widget takes them (term, means, pro, example, emoji). */
const lingoSchema = z
  .object({
    term: z.string().trim().min(2),
    means: z.string().trim().min(3),
    pro: z.string().trim().min(3),
    example: z.string().trim().min(3),
    emoji: z.string().trim().min(1),
  })
  .strict();

export const guideLineSchema = z
  .object({
    market: z.enum(["IN", "US"]),
    field: z.enum(GUIDE_FIELDS),
    /** Where the number sits in the annual report, in one or two plain sentences. */
    where: z.string().trim().min(10),
    /** The rule or record that says so: the link's words. */
    source: z.string().trim().min(3),
    sourceUrl: z.url({ protocol: /^https?$/ }),
    lingo: lingoSchema,
  })
  .strict();

export type GuideLine = z.output<typeof guideLineSchema>;
export type GuideLineInput = Partial<z.input<typeof guideLineSchema>>;

/** Every way the guide lines break the rules, as sentences; empty when all pass. */
export function guideErrors(lines: readonly unknown[]): string[] {
  const errors: string[] = [];
  const seen = new Map<string, Set<string>>();
  lines.forEach((raw, i) => {
    const loose = (typeof raw === "object" && raw !== null ? raw : {}) as { market?: unknown; field?: unknown };
    const market = typeof loose.market === "string" ? loose.market : "?";
    const field = typeof loose.field === "string" ? loose.field : `#${i + 1}`;
    const name = `Guide line ${market} "${field}"`;
    const fields = seen.get(market) ?? new Set<string>();
    seen.set(market, fields);
    if (fields.has(field)) {
      errors.push(`${name} is listed twice`);
      return;
    }
    fields.add(field);
    const parsed = guideLineSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) errors.push(`${name} needs ${issue.path.map(String).join(".") || "a value"}: ${issue.message}`);
      return;
    }
    if (!isIconName(parsed.data.lingo.emoji)) errors.push(`${name} has the Lingo picture "${parsed.data.lingo.emoji}", which is not an Icon name (src/icons/names.ts)`);
  });
  for (const [market, fields] of seen) {
    for (const field of GUIDE_FIELDS) if (!fields.has(field)) errors.push(`The ${market} guide has no line for "${field}": every Own Case field needs one`);
  }
  return errors;
}

// ——— India (checked 2026-11-16) ———
// Indian annual reports follow Schedule III to the Companies Act, 2013 (Division II for Ind AS companies; banks, NBFCs and
// insurers use other formats, and the Own Case's industries leave them out).

const MCA = { source: "Companies Act, 2013, with Schedule III (Ministry of Corporate Affairs)", sourceUrl: "https://www.mca.gov.in/content/dam/mca/pdf/CompaniesAct2013.pdf" };
const TAX = { source: "Income Tax Department, tax rates for domestic companies", sourceUrl: "https://incometaxindia.gov.in/Documents/Left%20Menu/TAX%20RATES-domestic.htm" };
const IND_AS_7 = { source: "Ind AS 7, Statement of Cash Flows, paragraph 7 (ICAI)", sourceUrl: "https://resource.cdn.icai.org/94048indas2025-26-7.pdf" };
const IND_AS_116 = { source: "Ind AS 116, Leases, paragraphs 47 and 49 (ICAI)", sourceUrl: "https://resource.cdn.icai.org/94043indas2025-26-116.pdf" };
const NSE = { source: "NSE, security-wise price archives", sourceUrl: "https://www.nseindia.com/report-detail/eq_security" };

const india: GuideLineInput[] = [
  {
    field: "company",
    where:
      "Type the name as the annual report's cover prints it. Inside, use the Consolidated Financial Statements (the second full set), not the Standalone ones; a company that owns no other company prints only standalone.",
    ...MCA,
    lingo: {
      term: "Consolidated statements",
      means: "The accounts of the company and every company it owns, added up as one.",
      pro: "consolidated numbers include the subsidiaries",
      example: "A tea maker that owns a café chain shows the cafés' sales in its consolidated statements.",
      emoji: "office-building",
    },
  },
  {
    field: "reportDate",
    where: "The Balance Sheet's heading: \"as at 31 March 2025\". That year end is the report's date; most Indian companies close their year on 31 March.",
    ...MCA,
    lingo: {
      term: "Financial year",
      means: "The twelve months an annual report covers; in India it ends on 31 March.",
      pro: "FY25 means the year to 31 March 2025",
      example: "A report for FY25 counts sales from 1 April 2024 to 31 March 2025.",
      emoji: "calendar",
    },
  },
  {
    field: "sales",
    where:
      "Statement of Profit and Loss, first line: \"Revenue from operations\", this year's column. Not \"Total income\", which adds other income. Read the unit at the top (₹ in crore, lakh or million) and turn it into crore: ₹ 5,000 million or ₹ 50,000 lakh is ₹ 500 crore.",
    ...MCA,
    lingo: {
      term: "Revenue from operations",
      means: "Money from selling the company's goods or services in the year, before any costs.",
      pro: "revenue from operations is the top line",
      example: "A biscuit maker's revenue from operations is its biscuit sales, not interest on its deposits.",
      emoji: "receipt",
    },
  },
  {
    field: "operatingProfit",
    where:
      "Statement of Profit and Loss: no line prints it, so work it out. Take \"Profit before exceptional items and tax\", add \"Finance costs\" (inside Expenses) and take away \"Other income\".",
    ...MCA,
    lingo: {
      term: "Operating profit (EBIT)",
      means: "Profit from running the business, before interest and tax.",
      pro: "EBIT is earnings before interest and taxes",
      example: "Profit before tax 150 + finance costs 30 - other income 40 = operating profit 140.",
      emoji: "factory",
    },
  },
  {
    field: "taxPercent",
    where:
      "The notes, \"Income tax\": the reconciliation names the tax rate that applies to the company. Under the 22% option (section 115BAA, now section 200 of the 2025 Act) with 10% surcharge and 4% cess it is 25.168%.",
    ...TAX,
    lingo: {
      term: "Applicable tax rate",
      means: "The rate the law sets for this company's profit, with surcharge and cess added.",
      pro: "the applicable rate, not the effective rate",
      example: "22% tax, plus 10% surcharge, plus 4% cess makes 25.168% of profit.",
      emoji: "classical-building",
    },
  },
  {
    field: "debt",
    where:
      "Balance Sheet, liabilities: add \"Borrowings\" and \"Lease liabilities\", under both Non-current and Current liabilities. Leave out trade payables: they are bills owed to suppliers, not borrowing.",
    ...IND_AS_116,
    lingo: {
      term: "Lease liability",
      means: "Rent the company has promised to pay in future years, counted like a loan.",
      pro: "lease liabilities are debt in all but name",
      example: "A shop chain with 500 rented stores shows their future rent as a lease liability.",
      emoji: "bank",
    },
  },
  {
    field: "cash",
    where:
      "Balance Sheet, current assets: add \"Cash and cash equivalents\" and \"Bank balances other than cash and cash equivalents\" (fixed deposits). Leave out balances the notes call earmarked, such as unpaid dividend accounts.",
    ...IND_AS_7,
    lingo: {
      term: "Cash equivalent",
      means: "Money parked where it turns back into a known amount of cash within about three months.",
      pro: "cash equivalents are as good as cash",
      example: "A two-month bank deposit is a cash equivalent; shares in another company are not.",
      emoji: "money-bag",
    },
  },
  {
    field: "shares",
    where:
      "The notes, \"Equity share capital\": the number of shares issued, subscribed and fully paid at the year end (the closing line of its reconciliation). Not the rupee amount on the Balance Sheet, and not the weighted average in the EPS note.",
    ...MCA,
    lingo: {
      term: "Face value",
      means: "The small fixed amount printed on each share, like ₹ 1 or ₹ 10; not what it trades for.",
      pro: "share capital is shares times face value",
      example: "₹ 206 crore of ₹ 10 shares is 20.6 crore shares.",
      emoji: "coin",
    },
  },
  {
    field: "price",
    where:
      "Not in the report: on NSE's price archives, pick the company's symbol and the report's date and read the closing price, in ₹ a share. If that day had no trading, use the last trading day before it.",
    ...NSE,
    lingo: {
      term: "Closing price",
      means: "The last price a share traded at on one day, as the exchange records it.",
      pro: "the close is the day's last traded price",
      example: "A share that opens at ₹ 320 and ends the day at ₹ 328 closed at ₹ 328.",
      emoji: "chart-increasing",
    },
  },
];

// ——— The US (#113, checked 2026-11-16) ———
// A US company's annual report is its Form 10-K, filed with the SEC and free on EDGAR; the accounts follow US GAAP. Each
// line was checked in Apple's 10-K for the year to 27 Sep 2025, the worked example linked below.

const EDGAR = { source: "SEC, EDGAR company search", sourceUrl: "https://www.sec.gov/edgar/searchedgar/companysearch.html" };
const HOW_TO_READ = { source: "Investor.gov (SEC), How to Read a 10-K", sourceUrl: "https://www.investor.gov/introduction-investing/getting-started/researching-investments/how-read-10-k" };
const APPLE_10K = { source: "Apple Inc., Form 10-K for the year to 27 Sep 2025 (SEC EDGAR)", sourceUrl: "https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/aapl-20250927.htm" };
const NASDAQ = { source: "Nasdaq, historical quotes", sourceUrl: "https://www.nasdaq.com/market-activity/quotes/historical" };

const us: GuideLineInput[] = [
  {
    field: "company",
    where: "Search the company on SEC EDGAR and open its Form 10-K for the year you value. Type the name as the 10-K's cover prints it.",
    ...EDGAR,
    lingo: {
      term: "Form 10-K",
      means: "The annual report a US listed company files with the SEC, with its audited accounts.",
      pro: "the 10-K is the US annual report",
      example: "Apple's 10-K for the year to 27 Sep 2025 is free on EDGAR.",
      emoji: "office-building",
    },
  },
  {
    field: "reportDate",
    where: 'The cover page: "For the fiscal year ended" and a date. That year end is the report\'s date; not every company closes in December.',
    ...APPLE_10K,
    lingo: {
      term: "Fiscal year",
      means: "The twelve months a 10-K covers; it need not end in December.",
      pro: "a fiscal year can end in any month",
      example: "Apple's fiscal 2025 ended on 27 September 2025.",
      emoji: "calendar",
    },
  },
  {
    field: "sales",
    where:
      'Item 8, the income statement ("Consolidated Statements of Operations"), first total: "Total net sales", "Revenues" or "Net revenues". Most tables are in $ millions; a smaller company may print $ thousands, so divide by 1,000.',
    ...HOW_TO_READ,
    lingo: {
      term: "Net sales",
      means: "Money from selling the company's goods and services in the year, after returns and discounts.",
      pro: "net sales is the top line",
      example: "Apple's total net sales for fiscal 2025 were $416,161 million.",
      emoji: "receipt",
    },
  },
  {
    field: "operatingProfit",
    where: 'The same statement: "Operating income", after the operating expenses. A few companies leave it out; then take sales less the costs of sales and operating expenses.',
    ...HOW_TO_READ,
    lingo: {
      term: "Operating income",
      means: "Profit from running the business, before interest and tax.",
      pro: "operating income is EBIT",
      example: "Apple's operating income for fiscal 2025 was $133,050 million.",
      emoji: "factory",
    },
  },
  {
    field: "taxPercent",
    where: 'The income-tax note sets the company\'s effective rate beside the 21% "statutory federal income tax rate". State taxes come on top of the federal rate.',
    ...APPLE_10K,
    lingo: {
      term: "Statutory rate",
      means: "The rate the law sets on company profit: 21% federal in the US, before state taxes.",
      pro: "the statutory rate, not the effective rate",
      example: "Apple's effective rate was 15.6% in fiscal 2025; the statutory federal rate was 21%.",
      emoji: "classical-building",
    },
  },
  {
    field: "debt",
    where: 'The balance sheet: add "Commercial paper" and "Term debt", in current and in non-current liabilities. Leave out accounts payable: they are bills owed to suppliers, not borrowing.',
    ...APPLE_10K,
    lingo: {
      term: "Commercial paper",
      means: "Short-term loans a large company raises from investors and repays within months.",
      pro: "commercial paper is short-term debt",
      example: "Apple owed $7,979 million of commercial paper on 27 Sep 2025.",
      emoji: "bank",
    },
  },
  {
    field: "cash",
    where: 'The balance sheet, at the top of current assets: "Cash and cash equivalents".',
    ...APPLE_10K,
    lingo: {
      term: "Cash equivalent",
      means: "Money parked where it turns back into a known amount of cash within about three months.",
      pro: "cash equivalents are as good as cash",
      example: "Apple held $35,934 million of cash and cash equivalents on 27 Sep 2025.",
      emoji: "money-bag",
    },
  },
  {
    field: "shares",
    where:
      'The cover page: "shares of common stock were issued and outstanding as of" a date. Type that full count; tables inside count shares in thousands.',
    ...APPLE_10K,
    lingo: {
      term: "Shares outstanding",
      means: "The shares owners hold on a date: those issued, less any the company bought back.",
      pro: "outstanding, not authorised, shares",
      example: "Apple had 14,776,353,000 shares outstanding on 17 Oct 2025.",
      emoji: "coin",
    },
  },
  {
    field: "price",
    where:
      "Not in the 10-K: on the exchange that lists the shares (Nasdaq or NYSE), read the closing price on the report's date, in $ a share. If that day had no trading, use the last trading day before it.",
    ...NASDAQ,
    lingo: {
      term: "Closing price",
      means: "The last price a share traded at on one day, as the exchange records it.",
      pro: "the close is the day's last traded price",
      example: "A share that opens at $250 and ends the day at $255 closed at $255.",
      emoji: "chart-increasing",
    },
  },
];

/** Every guide line in the course as written: the course check runs guideErrors on these. */
export const GUIDE_LINE_INPUTS: readonly unknown[] = [...india.map((line) => ({ market: "IN", ...line })), ...us.map((line) => ({ market: "US", ...line }))];

const GUIDE_LINES: GuideLine[] = GUIDE_LINE_INPUTS.flatMap((raw) => {
  const parsed = guideLineSchema.safeParse(raw);
  return parsed.success ? [parsed.data] : [];
});

/** One market's guide, by Own Case field (the course check fails a market that misses one). */
export function annualReportGuide(market: GuideLine["market"]): Record<GuideField, GuideLine> {
  return Object.fromEntries(GUIDE_LINES.filter((l) => l.market === market).map((l) => [l.field, l])) as Record<GuideField, GuideLine>;
}
