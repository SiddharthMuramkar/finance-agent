// Market readings for Japan and Korea (spec #68, ticket #114), in the shape of src/markets/readings.ts (which lists them
// with the rest, so the course check holds every one to a date, a source, a credit and a link). Each market has its
// industry yardsticks (Damodaran's January 2026 update; sheet "Industry Averages", "Date updated" 2026-01-05) and a dated
// risk-free reading: the 10-year government bond yield on 30 Oct 2026, from the Ministry of Finance (Japan) and
// the Bank of Korea. Nothing is live (ADR 0013): each is history from its own day. Values were read on 2026-11-16 from
// the sources linked and rounded to two decimals (bond yields kept to the three the source prints).
//
// Korea has no industry sheet of its own: Damodaran puts it in "Emerging Markets" (all of Asia but Japan, Latin
// America, Africa, the Middle East and Eastern Europe), so each Korean yardstick says "emerging markets". The sheet's
// cost of capital is in US dollars (its "local currency" column assumes a generic 7.5% inflation, not the won's), and an
// Own Case in Korea discounts won, so each Korean cost of capital is turned into won (review G11) the way val-india
// teaches: with the 10-year Korea Treasury Bond and US Treasury yields of 31 Dec 2025, the day the sheet was measured
// on. Korea has no software yardstick (review G07): the Emerging Markets software row's margin, 0.28%, is no fair
// yardstick for a Korean software maker, so the Own Case offers Korea the other three picks. Imports only the shared
// builder, so plain Node runs it.

import { damodaranSheets, rateInOtherMoney, yardsticksFor, type YardstickRow } from "./yardsticks.ts";

const CHECKED = "2026-11-16";
/** The sheets' "Date updated" cell (Excel day 46027). */
const UPDATE = "2026-01-05";

/**
 * The 10-year yields that turn Korea's US-dollar cost of capital into won: both on 31 Dec 2025, the last close before the
 * sheets' update, read from the Bank of Korea and the US Treasury.
 */
const KTB_END_2025 = {
  id: "kr-risk-free-10y-2025",
  label: "10-year Korea Treasury Bond yield (Korea)",
  market: "KR" as const,
  kind: "risk_free" as const,
  value: 3.385,
  unit: "percent" as const,
  date: "2025-12-31",
  source: "Bank of Korea, ECOS table 817Y002, Market interest rates (daily), Treasury Bonds (10-year)",
  sourceUrl: "https://ecos.bok.or.kr/api/StatisticSearch/sample/json/kr/1/10/817Y002/D/20251224/20260106/010210000",
  credit: "Bank of Korea",
  checkedOn: CHECKED,
  checkNote: 'The row TIME "20251231", item 010210000 국고채(10년), unit 연% (percent a year); the same 3.385 as on 20251230.',
};
const UST_END_2025 = {
  id: "us-risk-free-10y-2025",
  label: "10-year US Treasury yield (US)",
  market: "US" as const,
  kind: "risk_free" as const,
  value: 4.18,
  unit: "percent" as const,
  date: "2025-12-31",
  source: "U.S. Treasury, Daily Treasury Par Yield Curve Rates, December 2025",
  sourceUrl: "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve&field_tdr_date_value_month=202512",
  credit: "U.S. Department of the Treasury",
  checkedOn: CHECKED,
  checkNote: 'The "10 Yr" column of the 12/31/2025 row (4.14% on 12/30).',
};

const JAPAN_SHEETS = damodaranSheets({
  region: "Japan",
  files: { operating_margin: "marginJapan.xls", sales_to_capital: "capexJapan.xls", cost_of_capital: "waccJapan.xls" },
  salesWhat: "Sales for each unit of money invested",
  costWhat: "Cost of capital in yen",
  costColumn: "Cost of Capital (Local Currency)",
});

const KOREA_SHEETS = damodaranSheets({
  region: "Emerging Markets",
  files: { operating_margin: "marginemerg.xls", sales_to_capital: "capexemerg.xls", cost_of_capital: "waccemerg.xls" },
  salesWhat: "Sales for each unit of money invested",
  costWhat: "Cost of capital in won, from US dollars",
  costColumn: "Cost of Capital",
  costConvert: {
    value: (dollars) => rateInOtherMoney(dollars, KTB_END_2025.value, UST_END_2025.value),
    note: (dollars) =>
      `That is ${dollars}% in US dollars, turned into won with the 10-year yields of 31 Dec 2025 (Korea ${KTB_END_2025.value}%, US ${UST_END_2025.value}%): grown by one plus the won yield, shrunk by one plus the dollar yield, less one.`,
  },
});

/** The industry rows India has, from each region's sheets (Korea's without software, review G07). */
const JAPAN_ROWS: YardstickRow[] = [
  { id: "auto", industry: "Auto & Truck", plain: "auto and truck makers", operating_margin: 6.07, sales_to_capital: 1.0, cost_of_capital: 5.02 },
  { id: "food", industry: "Food Processing", plain: "food processors", operating_margin: 5.11, sales_to_capital: 1.92, cost_of_capital: 3.84 },
  { id: "software", industry: "Software (System & Application)", plain: "software makers", operating_margin: 15.79, sales_to_capital: 3.93, cost_of_capital: 9.57 },
  { id: "market", industry: "Total Market (without financials)", plain: "all firms but banks and insurers", operating_margin: 7.66, sales_to_capital: 1.22, cost_of_capital: 5.73 },
];
/** Korea's cost of capital here is the sheet's US-dollar cell; the builder turns it into won. */
const KOREA_ROWS: YardstickRow[] = [
  { id: "auto", industry: "Auto & Truck", plain: "auto and truck makers", operating_margin: 4.29, sales_to_capital: 1.78, cost_of_capital: 10.57 },
  { id: "food", industry: "Food Processing", plain: "food processors", operating_margin: 8.15, sales_to_capital: 1.57, cost_of_capital: 7.64 },
  { id: "market", industry: "Total Market (without financials)", plain: "all firms but banks and insurers", operating_margin: 9.17, sales_to_capital: 1.06, cost_of_capital: 9.76 },
];

const yardsticks = [
  ...yardsticksFor({ market: "JP", place: "Japan", sheets: JAPAN_SHEETS, rows: JAPAN_ROWS, date: UPDATE, checkedOn: CHECKED }),
  ...yardsticksFor({ market: "KR", place: "emerging markets, used for Korea", sheets: KOREA_SHEETS, rows: KOREA_ROWS, date: UPDATE, checkedOn: CHECKED }),
];

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
    source: "Ministry of Finance Japan, Interest Rate (JGB yields), daily table, all years",
    sourceUrl: "https://www.mof.go.jp/jgbs/reference/interest_rate/data/jgbcm_all.csv",
    credit: "Ministry of Finance, Japan",
    checkedOn: CHECKED,
    checkNote: 'The row "R8.10.30" (Reiwa 8 = 2026), column "10年", in percent, of the file of every day since 1974 (Shift_JIS); the one-month file jgbcm.csv drops the row once that month is over.',
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

export const JAPAN_KOREA_READINGS = [...yardsticks, ...riskFree, KTB_END_2025, UST_END_2025];
