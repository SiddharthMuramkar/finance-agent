import { z } from "zod";

// The annual-report guide (spec #68: #108 for India, #113 for the US, then #114 and #115): beside each figure the Own Case
// form asks for, one line saying where it sits in that market's annual report, with the source that says so. A guide
// lives in git, keyed by the form's own field ids, so the course check (scripts/check-course.mjs, no database) can fail
// a line with no source. Imports only packages, so plain Node runs it.

/** The Own Case form's field ids (src/app/assignment/own-case-form.tsx), each of which gets a guide line. */
export const REPORT_GUIDE_FIELDS = ["reportDate", "sales", "operatingProfit", "taxPercent", "debt", "cash", "shares", "price"] as const;
export type ReportGuideField = (typeof REPORT_GUIDE_FIELDS)[number];

const sourced = z
  .object({
    /** Where the figure sits, in plain words. */
    line: z.string().trim().min(10),
    /** The source's title, shown as the link's words. */
    source: z.string().trim().min(3),
    sourceUrl: z.url({ protocol: /^https$/ }),
  })
  .strict();

export const reportGuideSchema = z
  .object({
    market: z.enum(["IN", "US"]),
    /** The report itself: its name and where a Learner finds one. */
    report: z.object({ name: z.string().trim().min(3), where: z.string().trim().min(10), source: z.string().trim().min(3), sourceUrl: z.url({ protocol: /^https$/ }) }).strict(),
    fields: z.partialRecord(z.enum(REPORT_GUIDE_FIELDS), sourced),
  })
  .strict();

export type ReportGuide = { market: "IN" | "US"; report: z.output<typeof reportGuideSchema>["report"]; fields: Record<ReportGuideField, z.output<typeof sourced>> };

/** Every way the guides break the rules, as sentences; empty when all pass. */
export function reportGuideErrors(guides: readonly unknown[]): string[] {
  return guides.flatMap((raw, i) => {
    const market = typeof raw === "object" && raw !== null && typeof (raw as { market?: unknown }).market === "string" ? (raw as { market: string }).market : `#${i + 1}`;
    const parsed = reportGuideSchema.safeParse(raw);
    if (!parsed.success) {
      return parsed.error.issues.map((issue) => {
        const [where, field, key] = issue.path.map(String);
        return where === "fields" && field ? `${market} guide line "${field}" needs ${key ?? "a line"}: ${issue.message}` : `${market} guide needs ${issue.path.map(String).join(".") || "a value"}: ${issue.message}`;
      });
    }
    return REPORT_GUIDE_FIELDS.filter((f) => !parsed.data.fields[f]).map((f) => `${market} guide has no line for "${f}"`);
  });
}

// ——— The US (#113, checked 2026-11-16) ———

const HOW_TO_READ = { source: "Investor.gov (SEC), How to Read a 10-K", sourceUrl: "https://www.investor.gov/introduction-investing/getting-started/researching-investments/how-read-10-k" };
/** A worked example: Apple's 10-K for the year to 27 Sep 2025, where each line below was checked. */
const APPLE_10K = { source: "Apple Inc., Form 10-K for the year to 27 Sep 2025 (SEC EDGAR)", sourceUrl: "https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/aapl-20250927.htm" };

const US_GUIDE = {
  market: "US",
  report: {
    name: "Form 10-K",
    where: "A US company's annual report is its Form 10-K, filed with the SEC. Search the company on SEC EDGAR and open the 10-K for the year you value.",
    source: "SEC, EDGAR company search",
    sourceUrl: "https://www.sec.gov/edgar/searchedgar/companysearch.html",
  },
  fields: {
    reportDate: { line: 'The cover page: "For the fiscal year ended" and a date. Not every company closes in December (Apple closes in September).', ...APPLE_10K },
    sales: { line: 'Item 8, the income statement ("Consolidated Statements of Operations"): "Total net sales", "Revenues" or "Net revenues". Most tables are in $ millions.', ...HOW_TO_READ },
    operatingProfit: { line: 'The same statement: "Operating income". A few companies leave it out; then take sales less the operating costs.', ...HOW_TO_READ },
    taxPercent: { line: 'The income-tax note sets the company\'s effective rate beside the 21% "statutory federal income tax rate". State taxes come on top of the federal rate.', ...APPLE_10K },
    debt: { line: 'The balance sheet: "Commercial paper" and "Term debt", in current and in non-current liabilities. Add them up.', ...APPLE_10K },
    cash: { line: 'The balance sheet, at the top of current assets: "Cash and cash equivalents".', ...APPLE_10K },
    shares: {
      line: 'The cover page: "shares of common stock were issued and outstanding as of" a date. Type that full count; tables inside count shares in thousands.',
      ...APPLE_10K,
    },
    price: {
      line: "A 10-K prints no share price. Take the closing price on the fiscal year's last trading day from the exchange that lists the shares (Nasdaq or NYSE).",
      source: "Nasdaq, historical quotes",
      sourceUrl: "https://www.nasdaq.com/market-activity/quotes/historical",
    },
  },
};

/** Every guide as written: the course check runs reportGuideErrors on these. India's comes with #108. */
export const REPORT_GUIDE_INPUTS: readonly unknown[] = [US_GUIDE];

const GUIDES = new Map(
  REPORT_GUIDE_INPUTS.flatMap((g) => {
    const parsed = reportGuideSchema.safeParse(g);
    return parsed.success ? [[parsed.data.market, parsed.data as ReportGuide] as const] : [];
  }),
);

/** The guide for a market's annual report, or undefined when it has none yet. */
export const reportGuide = (market: string): ReportGuide | undefined => GUIDES.get(market as ReportGuide["market"]);
