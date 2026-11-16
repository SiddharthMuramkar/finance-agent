import { z } from "zod";

// Annual-report guides (spec #68; #108 for India, #114 for Japan and Korea): beside each figure the Own Case form asks
// for, one line saying where it sits in the market's annual report, a link to the primary source that says so (the
// regulator, the exchange or the tax office), and a Lingo card for the report's own word. They live in git so the course
// check (scripts/check-course.mjs, no database) fails a guide line with no source. Imports only packages, so plain Node
// runs it. Checked 2026-11-16: every link answered HTTP 200.

/** The figures the Own Case form asks for, in its order (src/app/assignment/own-case-form.tsx). */
export const GUIDE_FIELDS = ["reportDate", "sales", "operatingProfit", "taxPercent", "debt", "cash", "shares", "price"] as const;
export type GuideField = (typeof GUIDE_FIELDS)[number];

const lingo = z
  .object({
    term: z.string().trim().min(1),
    means: z.string().trim().min(3),
    pro: z.string().trim().min(3),
    example: z.string().trim().min(3),
    /** An Icon name (src/icons/names.ts), as every Lingo card's. */
    emoji: z.string().trim().min(1),
  })
  .strict();

export const guideLineSchema = z
  .object({
    field: z.enum(GUIDE_FIELDS),
    /** Where the figure sits in the report, in the report's own words. */
    where: z.string().trim().min(10),
    /** The source's title, shown as the link's words. */
    source: z.string().trim().min(3),
    sourceUrl: z.url({ protocol: /^https$/ }),
    lingo,
  })
  .strict();

export type GuideLine = z.output<typeof guideLineSchema>;

/** Every way the guides break the rules, as sentences; empty when all pass. Each market needs one line per field. */
export function reportGuideErrors(guides: Readonly<Record<string, readonly unknown[]>>): string[] {
  return Object.entries(guides).flatMap(([market, lines]) => {
    const errors: string[] = [];
    const seen = new Set<string>();
    lines.forEach((raw, i) => {
      const field = typeof raw === "object" && raw !== null && typeof (raw as { field?: unknown }).field === "string" ? (raw as { field: string }).field : `#${i + 1}`;
      const name = `The ${market} guide line for "${field}"`;
      if (seen.has(field)) errors.push(`${name} is listed twice`);
      seen.add(field);
      const parsed = guideLineSchema.safeParse(raw);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) errors.push(`${name} needs ${issue.path.map(String).join(".") || "a value"}: ${issue.message}`);
      }
    });
    for (const field of GUIDE_FIELDS) if (!seen.has(field)) errors.push(`The ${market} guide has no line for "${field}"`);
    return errors;
  });
}

const EDINET = { source: "EDINET, Financial Services Agency (有価証券報告書)", sourceUrl: "https://disclosure2.edinet-fsa.go.jp/" };
const FORM_JP = { source: "e-Gov, 企業内容等の開示に関する内閣府令 (第三号様式, the Yuho's form)", sourceUrl: "https://laws.e-gov.go.jp/law/348M50000040005" };

const JAPAN = [
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

const KOREA = [
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

/** The guides as written, by market: the course check runs reportGuideErrors on these. */
export const REPORT_GUIDE_INPUTS: Readonly<Record<string, readonly unknown[]>> = { JP: JAPAN, KR: KOREA };

/** A market's guide line for a field, or undefined (a market with no guide yet, or a line the course check fails). */
export function guideLine(market: string, field: GuideField): GuideLine | undefined {
  const raw = REPORT_GUIDE_INPUTS[market]?.find((l) => (l as { field?: string }).field === field);
  const parsed = guideLineSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}
