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
    market: z.enum(["IN", "US", "JP", "KR"]),
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

// ——— Japan and Korea (ticket #114; checked 2026-11-16, every link HTTP 200) ———
// Japan: the 有価証券報告書 (Yuho) on EDINET, Japanese GAAP or IFRS, money mostly in 百万円. Korea: the 사업보고서 on DART,
// K-IFRS, money mostly in 백만원.

const EDINET = { source: "EDINET, Financial Services Agency (有価証券報告書)", sourceUrl: "https://disclosure2.edinet-fsa.go.jp/" };
const FORM_JP = { source: "e-Gov, 企業内容等の開示に関する内閣府令 (第三号様式, the Yuho's form)", sourceUrl: "https://laws.e-gov.go.jp/law/348M50000040005" };

const japan: GuideLineInput[] = [
  {
    field: "company",
    where: "Type the name as the Yuho's cover prints it (【会社名】, with 【英訳名】 in English). Inside, use the consolidated statements (連結財務諸表), not the parent's own (財務諸表).",
    ...EDINET,
    lingo: { term: "連結財務諸表", means: "Consolidated statements: the company and every company it owns, added up as one.", pro: "consolidated numbers include the subsidiaries", example: "A soy-sauce maker that owns a US distributor shows its sales in its consolidated statements.", emoji: "office-building" },
  },
  {
    field: "reportDate",
    where: "The cover (表紙): 【事業年度】 gives the year, e.g. 自 2025年4月1日 至 2026年3月31日. Most Japanese years end on 31 March.",
    ...EDINET,
    lingo: { term: "有価証券報告書 (Yuho)", means: "Japan's annual securities report, filed on EDINET after the year ends.", pro: "the Yuho is the audited annual filing", example: "Kikkoman's Yuho for the year to March 2026 was filed in June.", emoji: "scroll" },
  },
  {
    field: "sales",
    where: "第5【経理の状況】 → 連結損益計算書: 売上高 (Japanese GAAP) or 売上収益 (IFRS). Read the unit line (単位：百万円) above the table.",
    ...FORM_JP,
    lingo: { term: "売上高 / 売上収益", means: "Sales: what customers paid for the year's goods and services.", pro: "the top line of the income statement", example: "A soy-sauce maker's bottles sold in a year.", emoji: "shopping-cart" },
  },
  {
    field: "operatingProfit",
    where: "The same statement: 営業利益. IFRS filers may also show 事業利益 (business profit); copy 営業利益.",
    ...FORM_JP,
    lingo: { term: "営業利益", means: "Operating profit: sales less the costs of running the business, before interest and tax.", pro: "operating profit is EBIT", example: "What the factory and shops earn before the bank and the taxman.", emoji: "factory" },
  },
  {
    field: "taxPercent",
    where: "The tax-effect note (税効果会計関係 or 法人所得税): 法定実効税率, the statutory effective rate, about 30%. MOF's chart gives 29.74% (30.64% with the defense tax from April 2026).",
    source: "Ministry of Finance Japan, corporate tax rates compared (084.pdf)",
    sourceUrl: "https://www.mof.go.jp/tax_policy/summary/corporation/084.pdf",
    lingo: { term: "法定実効税率", means: "The statutory effective tax rate: national and local corporate taxes together.", pro: "the statutory rate, not this year's paid rate", example: "Of ¥100 of taxable profit, about ¥30 goes in tax.", emoji: "receipt" },
  },
  {
    field: "debt",
    where: "連結貸借対照表 (or 連結財政状態計算書): 短期借入金, 1年内返済予定の長期借入金, 社債, 長期借入金 (IFRS: 社債及び借入金). Leases under Japanese GAAP stay off the balance sheet until years from April 2027.",
    source: "ASBJ Statement No. 34, Accounting Standard for Leases (2024)",
    sourceUrl: "https://www.asb-j.jp/en/accounting_standards/y2024/2024-0913.html",
    lingo: { term: "借入金 / 社債", means: "Borrowings and bonds: money the company owes lenders and must pay back with interest.", pro: "interest-bearing debt", example: "A bank loan for a new factory.", emoji: "bank" },
  },
  {
    field: "cash",
    where: "The balance sheet: 現金及び預金 (Japanese GAAP) or 現金及び現金同等物 (IFRS; also the last line of the cash-flow statement).",
    ...FORM_JP,
    lingo: { term: "現金及び現金同等物", means: "Cash and cash equivalents: cash and deposits the company can use at once.", pro: "cash on hand and near-cash", example: "Money in the company's bank accounts at the year end.", emoji: "money-bag" },
  },
  {
    field: "shares",
    where: "第4【提出会社の状況】 1【株式等の状況】: 発行済株式 (shares issued), less 自己株式 (treasury shares) from 【自己株式等】. Shares are counted in 株, one by one.",
    ...FORM_JP,
    lingo: { term: "発行済株式 / 自己株式", means: "Shares issued, and the ones the company bought back and holds; only the rest are outstanding.", pro: "shares outstanding exclude treasury stock", example: "969 million issued, 42 million bought back: 927 million outstanding.", emoji: "coin" },
  },
  {
    field: "price",
    where: "Not in the report: the Tokyo Stock Exchange closing price on the report's date (or the last trading day before it), in whole yen.",
    source: "Japan Exchange Group, daily stock price statistics",
    sourceUrl: "https://www.jpx.co.jp/markets/statistics-equities/daily/03.html",
    lingo: { term: "終値", means: "The closing price: the last price a share traded at that day.", pro: "the close on the as-of date", example: "Kikkoman closed at ¥1,435 on 31 March 2026.", emoji: "yen-banknote" },
  },
];

const DART = { source: "DART, Financial Supervisory Service (사업보고서)", sourceUrl: "https://dart.fss.or.kr/" };
const FORM_KR = { source: "Financial Supervisory Service, guide to the 사업보고서 form", sourceUrl: "https://www.fss.or.kr/fss/cmmn/file/fileDown.do?atchFileId=baaa9c7e22044e9b8c1568417b251dcf&fileSn=1" };

const korea: GuideLineInput[] = [
  {
    field: "company",
    where: "Type the name as the 사업보고서's cover prints it (회사명). Inside, use the consolidated statements (연결재무제표), not the separate ones (별도재무제표).",
    ...DART,
    lingo: { term: "연결재무제표", means: "Consolidated statements: the company and every company it owns, added up as one.", pro: "consolidated numbers include the subsidiaries", example: "A phone maker that owns a car-audio firm shows its sales in its consolidated statements.", emoji: "office-building" },
  },
  {
    field: "reportDate",
    where: "The cover: 사업연도, e.g. 2025년 01월 01일부터 2025년 12월 31일까지. Most Korean years end on 31 December; the report is filed within 90 days.",
    ...DART,
    lingo: { term: "사업보고서", means: "Korea's annual business report, filed on DART after the year ends.", pro: "the audited annual filing under K-IFRS", example: "Samsung Electronics filed its 2025 business report in March 2026.", emoji: "scroll" },
  },
  {
    field: "sales",
    where: "III. 재무에 관한 사항 → 연결재무제표 → 연결손익계산서: 매출액 (or 영업수익). Read the unit line (단위 : 백만원) above the table.",
    ...FORM_KR,
    lingo: { term: "매출액", means: "Sales: what customers paid for the year's goods and services.", pro: "the top line of the income statement", example: "Phones, chips and TVs sold in a year.", emoji: "shopping-cart" },
  },
  {
    field: "operatingProfit",
    where: "The same statement: 영업이익. Korean IFRS has required this line on the face of the statement since 2012.",
    source: "Financial Services Commission, K-IFRS 1001 amendment on 영업이익 (2012)",
    sourceUrl: "https://www.fsc.go.kr/po010101/70504?curPage=143&srchBeginDt&srchCtgry=1&srchEndDt&srchKey&srchText",
    lingo: { term: "영업이익", means: "Operating profit: sales less the costs of running the business, before interest and tax.", pro: "operating profit is EBIT", example: "What the factories earn before the bank and the taxman.", emoji: "factory" },
  },
  {
    field: "taxPercent",
    where: "The tax note (법인세비용) reconciles to the statutory rate. For a large company: 24% national (25% from 2026) plus local income tax of a tenth of it: 26.4% (27.5% from 2026).",
    source: "National Tax Service, 법인세 세율",
    sourceUrl: "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7746&mi=2220",
    lingo: { term: "법인세", means: "Corporate tax, charged in brackets; the top one applies to large companies' profit.", pro: "the statutory marginal rate", example: "Of ₩100 of a large firm's profit, about ₩26 goes in tax.", emoji: "receipt" },
  },
  {
    field: "debt",
    where: "연결재무상태표: 단기차입금, 유동성장기부채, 사채, 장기차입금 (and 리스부채, lease liabilities, in the notes).",
    ...FORM_KR,
    lingo: { term: "차입금 / 사채", means: "Borrowings and bonds: money the company owes lenders and must pay back with interest.", pro: "interest-bearing debt", example: "A bank loan for a new chip plant.", emoji: "bank" },
  },
  {
    field: "cash",
    where: "연결재무상태표: 현금및현금성자산. Large firms also hold 단기금융상품 (short-term deposits); copy only 현금및현금성자산.",
    ...FORM_KR,
    lingo: { term: "현금및현금성자산", means: "Cash and cash equivalents: cash and deposits the company can use at once.", pro: "cash on hand and near-cash", example: "Money in the company's bank accounts at the year end.", emoji: "money-bag" },
  },
  {
    field: "shares",
    where: "I. 회사의 개요 → 주식의 총수 등: 발행주식의 총수 (shares issued) less 자기주식 (treasury shares). Copy the common shares (보통주); preferred shares (우선주) trade apart.",
    ...FORM_KR,
    lingo: { term: "보통주 / 자기주식", means: "Common shares, and the ones the company bought back and holds; only the rest are outstanding.", pro: "shares outstanding exclude treasury stock", example: "5.92 billion issued, 92 million bought back: 5.83 billion outstanding.", emoji: "coin" },
  },
  {
    field: "price",
    where: "Not in the report: the Korea Exchange closing price on the report's date (or the last trading day before it; the market shuts on 31 December), in whole won.",
    source: "KRX Data Marketplace, Korea Exchange",
    sourceUrl: "https://data.krx.co.kr/",
    lingo: { term: "종가", means: "The closing price: the last price a share traded at that day.", pro: "the close on the as-of date", example: "Samsung Electronics closed at ₩119,900 on 30 December 2025.", emoji: "chart-increasing" },
  },
];

/** Every guide line in the course as written: the course check runs guideErrors on these. */
export const GUIDE_LINE_INPUTS: readonly unknown[] = [
  ...india.map((line) => ({ market: "IN", ...line })),
  ...us.map((line) => ({ market: "US", ...line })),
  ...japan.map((line) => ({ market: "JP", ...line })),
  ...korea.map((line) => ({ market: "KR", ...line })),
];

const GUIDE_LINES: GuideLine[] = GUIDE_LINE_INPUTS.flatMap((raw) => {
  const parsed = guideLineSchema.safeParse(raw);
  return parsed.success ? [parsed.data] : [];
});

/** One market's guide, by Own Case field (the course check fails a market that misses one). */
export function annualReportGuide(market: GuideLine["market"]): Record<GuideField, GuideLine> {
  return Object.fromEntries(GUIDE_LINES.filter((l) => l.market === market).map((l) => [l.field, l])) as Record<GuideField, GuideLine>;
}
