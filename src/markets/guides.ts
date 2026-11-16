import { z } from "zod";
import { isIconName } from "../icons/names.ts";

// The annual-report guide (spec #68, ticket #108; user story 80): beside each Own Case field, where that number sits in
// one market's annual report, with a link to the rule or record that says so and a Lingo card for the word the Learner
// meets there, so a Learner can find every number alone. Guides live in git so the course check (scripts/check-course.mjs,
// no database) fails a guide line with no source. One guide per market; more markets (#113-#115) add their lines here.
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

/** Every guide line in the course as written: the course check runs guideErrors on these. */
export const GUIDE_LINE_INPUTS: readonly unknown[] = india.map((line) => ({ market: "IN", ...line }));

const GUIDE_LINES: GuideLine[] = GUIDE_LINE_INPUTS.flatMap((raw) => {
  const parsed = guideLineSchema.safeParse(raw);
  return parsed.success ? [parsed.data] : [];
});

/** One market's guide, by Own Case field (the course check fails a market that misses one). */
export function annualReportGuide(market: GuideLine["market"]): Record<GuideField, GuideLine> {
  return Object.fromEntries(GUIDE_LINES.filter((l) => l.market === market).map((l) => [l.field, l])) as Record<GuideField, GuideLine>;
}
