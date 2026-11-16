// Market readings for Japan and Korea (spec #68, ticket #114), in the shape of src/markets/readings.ts (which lists them
// with the rest, so the course check holds every one to a date, a source, a credit and a link). Each market has its
// industry yardsticks (Damodaran's January 2026 update; sheet "Industry Averages", "Date updated" 2026-01-05) and a
// dated risk-free reading: the 10-year government bond yield on 30 Oct 2026, from the Ministry of Finance (Japan) and
// the Bank of Korea. Nothing is live (ADR 0013): each is history from its own day. Values were read on 2026-11-16 from
// the sources linked and rounded to two decimals (bond yields kept to the three the source prints).
//
// Korea has no industry sheet of its own: Damodaran puts it in "Emerging Markets" (all of Asia but Japan, Latin
// America, Africa, the Middle East and Eastern Europe), so each Korean yardstick says "emerging markets", and its cost of
// capital is the sheet's US-dollar figure (the sheet's "local currency" column assumes a generic 7.5% inflation, not
// the won's). Imports nothing, so plain Node runs it.

const CREDIT = "Aswath Damodaran, NYU Stern";
const CHECKED = "2026-11-16";
/** The sheets' "Date updated" cell (Excel day 46027). */
const UPDATE = "2026-01-05";
const DATASETS = "https://pages.stern.nyu.edu/~adamodar/pc/datasets/";

type Kind = "operating_margin" | "sales_to_capital" | "cost_of_capital";
const KIND_ID = { operating_margin: "margin", sales_to_capital: "sales-to-capital", cost_of_capital: "cost-of-capital" } as const;

const SHEETS = {
  JP: {
    region: "Japan",
    files: { operating_margin: "marginJapan.xls", sales_to_capital: "capexJapan.xls", cost_of_capital: "waccJapan.xls" },
    costColumn: "Cost of Capital (Local Currency)",
    costWhat: "Cost of capital in yen",
    where: "Japan",
  },
  KR: {
    region: "Emerging Markets",
    files: { operating_margin: "marginemerg.xls", sales_to_capital: "capexemerg.xls", cost_of_capital: "waccemerg.xls" },
    costColumn: "Cost of Capital",
    costWhat: "Cost of capital in US dollars",
    where: "emerging markets, used for Korea",
  },
} as const;

const TITLES = {
  operating_margin: "Operating and Net Margins by Industry",
  sales_to_capital: "Capital Expenditures by Industry",
  cost_of_capital: "Cost of Equity and Capital by Industry",
} as const;

type Row = { id: string; industry: string; plain: string; operating_margin: number; sales_to_capital: number; cost_of_capital: number };

/** The same four industry rows India has, from each region's sheets. */
const ROWS: Record<keyof typeof SHEETS, Row[]> = {
  JP: [
    { id: "auto", industry: "Auto & Truck", plain: "auto and truck makers", operating_margin: 6.07, sales_to_capital: 1.0, cost_of_capital: 5.02 },
    { id: "food", industry: "Food Processing", plain: "food processors", operating_margin: 5.11, sales_to_capital: 1.92, cost_of_capital: 3.84 },
    { id: "software", industry: "Software (System & Application)", plain: "software makers", operating_margin: 15.79, sales_to_capital: 3.93, cost_of_capital: 9.57 },
    { id: "market", industry: "Total Market (without financials)", plain: "all firms but banks and insurers", operating_margin: 7.66, sales_to_capital: 1.22, cost_of_capital: 5.73 },
  ],
  KR: [
    { id: "auto", industry: "Auto & Truck", plain: "auto and truck makers", operating_margin: 4.29, sales_to_capital: 1.78, cost_of_capital: 10.57 },
    { id: "food", industry: "Food Processing", plain: "food processors", operating_margin: 8.15, sales_to_capital: 1.57, cost_of_capital: 7.64 },
    { id: "software", industry: "Software (System & Application)", plain: "software makers", operating_margin: 0.28, sales_to_capital: 1.04, cost_of_capital: 13.97 },
    { id: "market", industry: "Total Market (without financials)", plain: "all firms but banks and insurers", operating_margin: 9.17, sales_to_capital: 1.06, cost_of_capital: 9.76 },
  ],
};

const yardsticks = (Object.keys(SHEETS) as (keyof typeof SHEETS)[]).flatMap((market) => {
  const sheet = SHEETS[market];
  return ROWS[market].flatMap((row) =>
    (["operating_margin", "sales_to_capital", "cost_of_capital"] as Kind[]).map((kind) => {
      const what = kind === "operating_margin" ? "Operating margin before tax" : kind === "sales_to_capital" ? "Sales for each unit of money invested" : sheet.costWhat;
      const column = kind === "operating_margin" ? "Pre-tax Unadjusted Operating Margin" : kind === "sales_to_capital" ? "Sales/ Invested Capital (LTM)" : sheet.costColumn;
      return {
        id: `${market.toLowerCase()}-${row.id}-${KIND_ID[kind]}`,
        label: `${what}, ${row.plain} (${sheet.where})`,
        market,
        kind,
        industry: row.industry,
        value: row[kind],
        unit: kind === "sales_to_capital" ? ("times" as const) : ("percent" as const),
        date: UPDATE,
        source: `Damodaran Online, ${TITLES[kind]} (${sheet.region}), January 2026 update`,
        sourceUrl: `${DATASETS}${sheet.files[kind]}`,
        credit: CREDIT,
        checkedOn: CHECKED,
        checkNote: `Read from the "${row.industry}" row, column "${column}", of the sheet "Industry Averages", and rounded to two decimals.`,
      };
    }),
  );
});

/** Each market's 10-year government bond yield on a stated day: the risk-free reading an Own Case's growth stays under. */
const riskFree = [
  {
    id: "jp-risk-free-10y",
    label: "10-year Japanese government bond yield (Japan)",
    market: "JP" as const,
    kind: "risk_free" as const,
    value: 2.817,
    unit: "percent" as const,
    date: "2026-10-30",
    source: "Ministry of Finance Japan, Interest Rate (JGB yields), daily table",
    sourceUrl: "https://www.mof.go.jp/jgbs/reference/interest_rate/jgbcm.csv",
    credit: "Ministry of Finance, Japan",
    checkedOn: CHECKED,
    checkNote: 'The row "R8.10.30" (Reiwa 8 = 2026), column "10年", in percent; the file is Shift_JIS. The same row is in jgbcm_all.csv.',
  },
  {
    id: "kr-risk-free-10y",
    label: "10-year Korea Treasury Bond yield (Korea)",
    market: "KR" as const,
    kind: "risk_free" as const,
    value: 4.008,
    unit: "percent" as const,
    date: "2026-10-30",
    source: "Bank of Korea, ECOS table 817Y002, Market interest rates (daily), Treasury Bonds (10-year)",
    sourceUrl: "https://ecos.bok.or.kr/api/StatisticSearch/sample/json/kr/1/10/817Y002/D/20261026/20261106/010210000",
    credit: "Bank of Korea",
    checkedOn: CHECKED,
    checkNote: 'The row TIME "20261030", item 010210000 국고채(10년), unit 연% (percent a year).',
  },
];

export const JAPAN_KOREA_READINGS = [...yardsticks, ...riskFree];
