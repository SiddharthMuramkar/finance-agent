// Market readings for Europe (spec #68, ticket #115), in the shape of src/markets/readings.ts (which lists them with the
// rest, so the course check holds every one to a date, a source, a credit and a link). Europe has its industry
// yardsticks (Damodaran's January 2026 update; sheet "Industry Averages", "Date updated" 2026-01-05) and a dated
// risk-free reading: the 10-year rate on the Bundesbank's German federal bond yield curve on 30 Oct 2026 (a Svensson
// zero-coupon rate, about 0.1 point above the 10-year coupon yield: G27, so it is named as that). Nothing is live
// (ADR 0013): each is history from its own day. Values were read on 2026-11-16 from the sources linked and rounded to
// two decimals.
//
// Damodaran's "Europe" is the EU, the UK, Switzerland and Scandinavia. Its cost of capital is the sheet's euro column
// ("Cost of Capital (Euros)", which assumes 1.5% euro inflation), not the US-dollar one. The Bund is the euro's
// risk-free rate in the same data ("the lowest of the 10-year government Euro bond rates", Damodaran's riskfreerate.pdf),
// so the yardsticks and the reading agree. Imports nothing, so plain Node runs it.

const CREDIT = "Aswath Damodaran, NYU Stern";
const CHECKED = "2026-11-16";
/** The sheets' "Date updated" cell (Excel day 46027). */
const UPDATE = "2026-01-05";
const DATASETS = "https://pages.stern.nyu.edu/~adamodar/pc/datasets/";

type Kind = "operating_margin" | "sales_to_capital" | "cost_of_capital";
const KIND_ID = { operating_margin: "margin", sales_to_capital: "sales-to-capital", cost_of_capital: "cost-of-capital" } as const;

const SHEETS = {
  operating_margin: { file: "marginEurope.xls", title: "Operating and Net Margins by Industry", what: "Operating margin before tax", column: "Pre-tax Unadjusted Operating Margin" },
  sales_to_capital: { file: "capexEurope.xls", title: "Capital Expenditures by Industry", what: "Sales for each euro invested", column: "Sales/ Invested Capital (LTM)" },
  cost_of_capital: { file: "waccEurope.xls", title: "Cost of Equity and Capital by Industry", what: "Cost of capital in euros", column: "Cost of Capital (Euros)" },
} as const;

type Row = { id: string; industry: string; plain: string; operating_margin: number; sales_to_capital: number; cost_of_capital: number };

/** The same four industry rows India has, from the Europe sheets. */
const ROWS: Row[] = [
  { id: "auto", industry: "Auto & Truck", plain: "auto and truck makers", operating_margin: 3.9, sales_to_capital: 1.06, cost_of_capital: 6.37 },
  { id: "food", industry: "Food Processing", plain: "food processors", operating_margin: 9.37, sales_to_capital: 1.88, cost_of_capital: 4.77 },
  { id: "software", industry: "Software (System & Application)", plain: "software makers", operating_margin: 19.33, sales_to_capital: 2.6, cost_of_capital: 7.64 },
  { id: "market", industry: "Total Market (without financials)", plain: "all firms but banks and insurers", operating_margin: 12.05, sales_to_capital: 1.32, cost_of_capital: 6.59 },
];

const yardsticks = ROWS.flatMap((row) =>
  (["operating_margin", "sales_to_capital", "cost_of_capital"] as Kind[]).map((kind) => {
    const sheet = SHEETS[kind];
    return {
      id: `eu-${row.id}-${KIND_ID[kind]}`,
      label: `${sheet.what}, ${row.plain} (Europe)`,
      market: "EU" as const,
      kind,
      industry: row.industry,
      value: row[kind],
      unit: kind === "sales_to_capital" ? ("times" as const) : ("percent" as const),
      date: UPDATE,
      source: `Damodaran Online, ${sheet.title} (Europe), January 2026 update`,
      sourceUrl: `${DATASETS}${sheet.file}`,
      credit: CREDIT,
      checkedOn: CHECKED,
      checkNote: `Read from the "${row.industry}" row, column "${sheet.column}", of the sheet "Industry Averages", and rounded to two decimals.`,
    };
  }),
);

/** The euro's 10-year risk-free reading on a stated day: the German federal bond yield curve's 10-year rate an Own Case's growth stays under. */
const riskFree = {
  id: "eu-risk-free-10y",
  label: "10-year rate on the German federal bond yield curve (Europe)",
  market: "EU" as const,
  kind: "risk_free" as const,
  value: 3.4,
  unit: "percent" as const,
  date: "2026-10-30",
  source: "Deutsche Bundesbank, term structure of interest rates on listed Federal securities (Svensson method), residual maturity 10.0 years (daily)",
  sourceUrl: "https://api.statistiken.bundesbank.de/rest/download/BBSIS/D.I.ZST.ZI.EUR.S1311.B.A604.R10XX.R.A.A._Z._Z.A?format=csv&lang=en",
  credit: "Deutsche Bundesbank",
  checkedOn: CHECKED,
  checkNote:
    'Series BBSIS.D.I.ZST.ZI.EUR.S1311.B.A604.R10XX.R.A.A._Z._Z.A ("Term structure of interest rates on listed Federal securities (method by Svensson) / residual maturity of 10.0 years / daily data"), row "2026-10-30", value 3.40 percent; re-read 2026-11-16. A zero-coupon rate fitted to the curve, not the coupon yield of one bond. The ECB\'s AAA euro-area 10-year spot rate that day was 3.365%.',
};

export const EUROPE_READINGS = [...yardsticks, riskFree];
