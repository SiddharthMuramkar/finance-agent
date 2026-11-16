// Industry yardsticks (spec #68, tickets #105, #113, #114; review F29 and G41): every market's yardsticks are rows of
// Damodaran's industry sheets, built into Market readings (src/markets/readings.ts) by this one builder, so their ids,
// labels and check notes cannot drift apart from market to market. Imports nothing, so plain Node and every market's
// readings file can use it without importing readings.ts (which imports them).

export const YARDSTICK_KINDS = ["operating_margin", "sales_to_capital", "cost_of_capital"] as const;
export type YardstickKind = (typeof YARDSTICK_KINDS)[number];
export type YardstickMarket = "IN" | "US" | "JP" | "KR" | "EU";

/** The id word each yardstick kind carries: "in-food-margin". */
export const KIND_ID = { operating_margin: "margin", sales_to_capital: "sales-to-capital", cost_of_capital: "cost-of-capital" } as const;

/** A yardstick reading's id, `<market>-<industry>-<kind>` ("in-food-margin"), as the Own Case industry pick names them. */
export const readingId = (market: YardstickMarket, industry: string, kind: YardstickKind): string => `${market.toLowerCase()}-${industry}-${KIND_ID[kind]}`;

/** One of the three sheets a market's yardsticks are read from. */
export type YardstickSheet = {
  /** The source's title, shown as the link's words. */
  source: string;
  url: string;
  /** What the figure is, in plain words: "Operating margin before tax". */
  what: string;
  /** The sheet's column the figure is read from. */
  column: string;
  /**
   * For a cell in another money than the market's (Korea's cost of capital is in US dollars): the reading's value from the
   * cell, and a sentence on how it was turned, added to the check note.
   */
  convert?: { value: (cell: number) => number; note: (cell: number) => string };
};
export type YardstickSheets = Record<YardstickKind, YardstickSheet>;

/** One industry's row: its id word, the source's name for it, plain words, and the three figures rounded to two decimals. */
export type YardstickRow = { id: string; industry: string; plain: string } & Record<YardstickKind, number>;

const CREDIT = "Aswath Damodaran, NYU Stern";
const UNIT = { operating_margin: "percent", sales_to_capital: "times", cost_of_capital: "percent" } as const;
const DATASETS = "https://pages.stern.nyu.edu/~adamodar/pc/datasets/";
const TITLES = {
  operating_margin: "Operating and Net Margins by Industry",
  sales_to_capital: "Capital Expenditures by Industry",
  cost_of_capital: "Cost of Equity and Capital by Industry",
} as const;

/**
 * Damodaran's three sheets for one region's January 2026 update: margins, capital expenditures (sales to invested capital)
 * and the cost of capital, each with its file name in his datasets folder.
 */
export function damodaranSheets(spec: {
  region: string;
  files: Record<YardstickKind, string>;
  /** "Sales for each rupee invested". */
  salesWhat: string;
  /** "Cost of capital in yen". */
  costWhat: string;
  costColumn: string;
  costConvert?: YardstickSheet["convert"];
}): YardstickSheets {
  const sheet = (kind: YardstickKind, what: string, column: string): YardstickSheet => ({
    source: `Damodaran Online, ${TITLES[kind]} (${spec.region}), January 2026 update`,
    url: `${DATASETS}${spec.files[kind]}`,
    what,
    column,
  });
  return {
    operating_margin: sheet("operating_margin", "Operating margin before tax", "Pre-tax Unadjusted Operating Margin"),
    sales_to_capital: sheet("sales_to_capital", spec.salesWhat, "Sales/ Invested Capital (LTM)"),
    cost_of_capital: { ...sheet("cost_of_capital", spec.costWhat, spec.costColumn), ...(spec.costConvert ? { convert: spec.costConvert } : {}) },
  };
}

/** One reading per industry and kind, dated at the sheets' update and credited to Damodaran. */
export function yardsticksFor(spec: { market: YardstickMarket; place: string; sheets: YardstickSheets; rows: readonly YardstickRow[]; date: string; checkedOn: string }) {
  return spec.rows.flatMap((row) =>
    YARDSTICK_KINDS.map((kind) => {
      const sheet = spec.sheets[kind];
      const cell = row[kind];
      const read = `Read from the "${row.industry}" row, column "${sheet.column}", of the sheet "Industry Averages", and rounded to two decimals.`;
      return {
        id: readingId(spec.market, row.id, kind),
        label: `${sheet.what}, ${row.plain} (${spec.place})`,
        market: spec.market,
        kind,
        industry: row.industry,
        value: sheet.convert ? sheet.convert.value(cell) : cell,
        unit: UNIT[kind],
        date: spec.date,
        source: sheet.source,
        sourceUrl: sheet.url,
        credit: CREDIT,
        checkedOn: spec.checkedOn,
        checkNote: sheet.convert ? `${read} ${sheet.convert.note(cell)}` : read,
      };
    }),
  );
}

/**
 * A rate in one money turned into another (val-india's rule: match the discount rate's money to the cash flows'): grow it
 * by one plus the new money's 10-year government bond yield, shrink it by one plus the old money's, and take one away.
 * Percents in, a percent out, rounded to two decimals.
 */
export function rateInOtherMoney(ratePercent: number, newYieldPercent: number, oldYieldPercent: number): number {
  const turned = ((1 + ratePercent / 100) * (1 + newYieldPercent / 100)) / (1 + oldYieldPercent / 100) - 1;
  return Math.round(turned * 1e4) / 100;
}
