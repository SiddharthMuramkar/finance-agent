import { z } from "zod";
import { impliedPremium, impliedPremiumBlock } from "../finance/implied-erp.ts";
import { EUROPE_READINGS } from "./readings-europe.ts";

// Market readings (spec #68, ticket #105; GLOSSARY "Market reading"): a market-wide number, such as the premium investors
// ask over safe bonds or an industry's usual margin, shown with the date it was measured. Each is stored like Case Data
// (src/case-data/import.ts: a value, its date, its source, a link, when and how it was checked) plus its credit, and lives
// in git so the course check (scripts/check-course.mjs, no database) can hold every one to that. Nothing here is live
// (ADR 0013, ADR 0020): a reading is history from its own month, never "today". Premium readings carry the inputs the
// course's own implied-premium maths solves (src/finance/implied-erp.ts), and the check holds the solved premium to the
// one the source printed. Imports only packages, so plain Node runs it.

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "lowercase words joined by hyphens");

/** What a reading measures: the implied premium of a whole market, or one of an industry's yardsticks. */
/** A risk-free reading is a market's 10-year government bond yield on a stated day (tickets #114, #115). */
export const READING_KINDS = ["implied_premium", "operating_margin", "sales_to_capital", "cost_of_capital", "risk_free"] as const;

export const marketReadingSchema = z
  .object({
    id: slug,
    /** What it measures, in plain words: "Operating margin, auto and truck makers (India)". */
    label: z.string().trim().min(3),
    market: z.enum(["IN", "US", "EU"]),
    kind: z.enum(READING_KINDS),
    /** The industry, as the source names it, for an industry yardstick. */
    industry: z.string().trim().min(1).optional(),
    value: z.number().finite(),
    /** percent (9.69 is 9.69%), or times (sales for each rupee invested). */
    unit: z.enum(["percent", "times"]),
    /** The date the value was measured (not when it was checked). */
    date: z.iso.date(),
    /** The source's title, shown as the link's words. */
    source: z.string().trim().min(3),
    sourceUrl: z.url({ protocol: /^https?$/ }),
    /** Who made the figure: the credit shown beside it. */
    credit: z.string().trim().min(3),
    checkedOn: z.iso.date(),
    /** How the value was checked against the source. */
    checkNote: z.string().trim().min(3),
    /** For an implied premium: the index and cash flows the course's maths solves. */
    impliedPremium: impliedPremiumBlock.optional(),
  })
  .strict();

export type MarketReading = z.output<typeof marketReadingSchema>;
export type MarketReadingInput = Partial<z.input<typeof marketReadingSchema>>;

/** Words that would show a reading as live: a reading is history from its own month (ADR 0013). */
const NOT_LIVE = /\b(today'?s?|current(?:ly)?|now|latest|live)\b/i;

/** Within a hundredth of a percentage point of what the source printed, as caseProblems holds a Case's premium. */
const PREMIUM_TOLERANCE = 0.01;

/** Every way the readings break the rules, as sentences; empty when all pass. */
export function marketReadingErrors(readings: readonly unknown[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  readings.forEach((raw, i) => {
    const id = typeof raw === "object" && raw !== null && typeof (raw as { id?: unknown }).id === "string" ? (raw as { id: string }).id : `#${i + 1}`;
    const name = `Market reading "${id}"`;
    if (seen.has(id)) {
      errors.push(`${name} is listed twice`);
      return;
    }
    seen.add(id);
    const parsed = marketReadingSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) errors.push(`${name} needs ${issue.path.map(String).join(".") || "a value"}: ${issue.message}`);
      return;
    }
    const r = parsed.data;
    for (const text of [r.label, r.source, r.credit, r.checkNote]) {
      const word = text.match(NOT_LIVE)?.[0];
      if (word) errors.push(`${name} calls itself "${word}"; a reading is history, shown with its month and year`);
    }
    if (r.kind === "implied_premium") {
      if (!r.impliedPremium) {
        errors.push(`${name} is an implied premium, so it needs the impliedPremium inputs the course's maths solves`);
        return;
      }
      if (r.impliedPremium.index.date !== r.date) errors.push(`${name} is dated ${r.date}, but its index closed on ${r.impliedPremium.index.date}`);
      const solved = impliedPremium(r.impliedPremium).premium * 100;
      if (Math.abs(solved - r.value) > PREMIUM_TOLERANCE || Math.abs(r.impliedPremium.published.premiumPercent - r.value) > PREMIUM_TOLERANCE) {
        errors.push(`${name} states a premium of ${r.value}%, but its inputs give ${solved.toFixed(2)}%`);
      }
    } else if (r.kind !== "risk_free" && !r.industry) {
      errors.push(`${name} is an industry yardstick, so it needs its industry`);
    }
  });
  return errors;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A reading's date as its month and year: "Jan 2026". */
export function readingMonth(iso: string): string {
  const [year, month] = iso.split("-").map(Number);
  return `${MONTHS[month - 1]} ${year}`;
}

/** A reading's value in its unit: "9.69%", "1.03". */
export function readingValueText(r: Pick<MarketReading, "value" | "unit">): string {
  return r.unit === "percent" ? `${Number(r.value.toFixed(2))}%` : r.value.toFixed(2);
}

// ——— The first set (checked 2026-11-16) ———

const CREDIT = "Aswath Damodaran, NYU Stern";
const CHECKED = "2026-11-16";
/** The India sheets' "Date updated" cell (Excel day 46027). */
const INDIA_UPDATE = "2026-01-05";

const INDIA_SHEETS = {
  operating_margin: {
    source: "Damodaran Online, Operating and Net Margins by Industry (India), January 2026 update",
    url: "https://pages.stern.nyu.edu/~adamodar/pc/datasets/marginIndia.xls",
    what: "Operating margin before tax",
    column: "Pre-tax Unadjusted Operating Margin",
    unit: "percent",
  },
  sales_to_capital: {
    source: "Damodaran Online, Capital Expenditures by Industry (India), January 2026 update",
    url: "https://pages.stern.nyu.edu/~adamodar/pc/datasets/capexIndia.xls",
    what: "Sales for each rupee invested",
    column: "Sales/ Invested Capital (LTM)",
    unit: "times",
  },
  cost_of_capital: {
    source: "Damodaran Online, Cost of Equity and Capital by Industry (India), January 2026 update",
    url: "https://pages.stern.nyu.edu/~adamodar/pc/datasets/waccIndia.xls",
    what: "Cost of capital in rupees",
    column: "Cost of Capital (Local Currency)",
    unit: "percent",
  },
} as const;

type Yardsticks = { id: string; industry: string; plain: string; operating_margin: number; sales_to_capital: number; cost_of_capital: number };

/** Four of the sheets' industry rows, each figure rounded to two decimals from the cell. */
const INDIA_INDUSTRIES: Yardsticks[] = [
  { id: "auto", industry: "Auto & Truck", plain: "auto and truck makers", operating_margin: 9.69, sales_to_capital: 1.03, cost_of_capital: 13.9 },
  { id: "food", industry: "Food Processing", plain: "food processors", operating_margin: 7.26, sales_to_capital: 2.34, cost_of_capital: 11.97 },
  { id: "software", industry: "Software (System & Application)", plain: "software makers", operating_margin: 16.73, sales_to_capital: 1.85, cost_of_capital: 12.67 },
  { id: "market", industry: "Total Market (without financials)", plain: "all firms but banks and insurers", operating_margin: 11.2, sales_to_capital: 1.25, cost_of_capital: 11.45 },
];

const KIND_ID = { operating_margin: "margin", sales_to_capital: "sales-to-capital", cost_of_capital: "cost-of-capital" } as const;

const indiaYardsticks = INDIA_INDUSTRIES.flatMap((row) =>
  (["operating_margin", "sales_to_capital", "cost_of_capital"] as const).map((kind) => {
    const sheet = INDIA_SHEETS[kind];
    return {
      id: `in-${row.id}-${KIND_ID[kind]}`,
      label: `${sheet.what}, ${row.plain} (India)`,
      market: "IN" as const,
      kind,
      industry: row.industry,
      value: row[kind],
      unit: sheet.unit,
      date: INDIA_UPDATE,
      source: sheet.source,
      sourceUrl: sheet.url,
      credit: CREDIT,
      checkedOn: CHECKED,
      checkNote: `Read from the "${row.industry}" row, column "${sheet.column}", of the sheet "Industry Averages", and rounded to two decimals.`,
    };
  }),
);

const HISTIMPL = { title: "Damodaran, Historical Implied Equity Risk Premiums (histimpl.xls)", url: "https://pages.stern.nyu.edu/~adamodar/pc/datasets/histimpl.xls" };
const ERP_PAPER = { title: "Damodaran, Equity Risk Premiums (ERP): Determinants, Estimation and Implications, Tables 16 and 17", url: "https://pages.stern.nyu.edu/~adamodar/pdfiles/papers/ERPpageproof.pdf" };

/** The S&P 500's implied premium at a year's end, as histimpl.xls gives it, with the inputs the course's maths solves. */
function premiumReading(spec: { year: number; level: number; bond: number; cash: number; growth: number; requiredReturn: number; premium: number; paper?: boolean }) {
  const date = `${spec.year}-12-31`;
  return {
    id: `us-implied-premium-${spec.year}`,
    label: "Implied equity risk premium, S&P 500 (US)",
    market: "US" as const,
    kind: "implied_premium" as const,
    value: spec.premium,
    unit: "percent" as const,
    date,
    source: HISTIMPL.title,
    sourceUrl: HISTIMPL.url,
    credit: CREDIT,
    checkedOn: CHECKED,
    checkNote: `The ${spec.year} row: S&P 500 at ${spec.level}, dividends and buybacks of ${spec.cash}, T-bond rate ${spec.bond}%, growth ${spec.growth}% for five years, implied ERP (FCFE) ${spec.premium}%; the course's two-stage maths gives the same premium.`,
    impliedPremium: {
      index: { name: "S&P 500", level: spec.level, date },
      riskFreePercent: spec.bond,
      cashYieldPercent: Number(((spec.cash / spec.level) * 100).toFixed(4)),
      growthPercent: spec.growth,
      growthAfterPercent: spec.bond,
      published: { requiredReturnPercent: spec.requiredReturn, premiumPercent: spec.premium },
      sources: spec.paper ? [HISTIMPL, ERP_PAPER] : [HISTIMPL],
    },
  };
}

const premiums = [
  // 2007: the paper's Table 17 averages cash over 2001 to 2007 (59.03, 4.02% of the index), as val-implied-erp's Case does.
  {
    ...premiumReading({ year: 2007, level: 1468.36, bond: 4.02, cash: 59.03, growth: 5, requiredReturn: 8.39, premium: 4.37, paper: true }),
    checkNote:
      "Table 17 of the paper and the 2007 row of histimpl.xls: S&P 500 at 1468.36, dividends and buybacks averaging 59.03 over 2001 to 2007, T-bond rate 4.02%, growth 5% for five years, implied ERP 4.37%; the course's two-stage maths gives the same premium.",
  },
  premiumReading({ year: 2008, level: 903.25, bond: 2.21, cash: 52.58, growth: 4, requiredReturn: 8.64, premium: 6.43, paper: true }),
  premiumReading({ year: 2019, level: 3230.78, bond: 1.92, cash: 150.5, growth: 3.96, requiredReturn: 7.12, premium: 5.2 }),
];

/** Every Market reading in the course as written: the course check runs marketReadingErrors on these. */
export const MARKET_READING_INPUTS: readonly unknown[] = [...premiums, ...indiaYardsticks, ...EUROPE_READINGS];

/** Every Market reading that parses (the course check fails on any that does not). */
export const MARKET_READINGS: MarketReading[] = MARKET_READING_INPUTS.flatMap((r) => {
  const parsed = marketReadingSchema.safeParse(r);
  return parsed.success ? [parsed.data] : [];
});

const BY_ID = new Map(MARKET_READINGS.map((r) => [r.id, r]));

/** The reading with this id, or undefined. */
export const marketReading = (id: string): MarketReading | undefined => BY_ID.get(id);

/** Every reading's id. */
export const marketReadingIds = (): string[] => [...BY_ID.keys()];
