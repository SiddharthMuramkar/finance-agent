// The currencies a Case's money can be counted in, and how each is written: its symbol, its word, the locale that
// groups its digits, and whether it has a minor unit (yen and won have none, so a share's value is never "¥7.60").
// Rupees read in lakh and crore; every other currency reads in the short scale (m, bn, tn).
//
// This module imports nothing, so `valuation-case.ts` and the course check (plain Node) can use it.

export const CURRENCIES = ["USD", "INR", "JPY", "KRW", "EUR"] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

export type CurrencyStyle = {
  symbol: string;
  /** The currency's word for one, and for many: "dollar", "dollars"; "yen", "yen". */
  word: readonly [one: string, many: string];
  /** The locale whose digit grouping the figures use. Euros use en-IE: an English page with "€1,234.50", not "1.234,50 €". */
  locale: string;
  /** Whether the currency has a minor unit (cents, paise); yen and won do not. */
  cents: boolean;
};

export const CURRENCY_STYLE: Record<CurrencyCode, CurrencyStyle> = {
  USD: { symbol: "$", word: ["dollar", "dollars"], locale: "en-US", cents: true },
  INR: { symbol: "₹", word: ["rupee", "rupees"], locale: "en-IN", cents: true },
  JPY: { symbol: "¥", word: ["yen", "yen"], locale: "ja-JP", cents: false },
  KRW: { symbol: "₩", word: ["won", "won"], locale: "ko-KR", cents: false },
  EUR: { symbol: "€", word: ["euro", "euros"], locale: "en-IE", cents: true },
};
