import { formatInr, formatInrWords } from "@/finance/indian-format";
import { CURRENCY_STYLE, type CurrencyCode } from "@/finance/money";

// One formatter for every axis label and every value read, by unit, so a rupee axis never says K or M and a
// tooltip never loses its unit.

export type PlotUnit = "inr" | "usd" | ShortScaleCurrency | "percent" | "plain";

/** Currencies read in the short scale with tn, bn and m: yen and won have no minor unit, so their values carry no decimals. */
type ShortScaleCurrency = "jpy" | "krw" | "eur";
/** The currency's symbol and decimals, from the one table of currencies (src/finance/money.ts). */
const shortScale = (kit: ShortScaleCurrency) => {
  const style = CURRENCY_STYLE[kit.toUpperCase() as CurrencyCode];
  return { symbol: style.symbol, digits: style.cents ? 2 : 0 };
};


/** Which of the kit's units a unit word means: "inr" or "rupees" or "₹", "usd" or "$", "jpy" or "yen" or "¥", "krw" or "won" or "₩", "eur" or "euros" or "€", "percent" or "%"; anything else is plain. */
export function plotUnit(unit: string | undefined): PlotUnit {
  const u = (unit ?? "").trim().toLowerCase();
  if (u === "inr" || u === "₹" || u === "rs" || u === "rupee" || u === "rupees") return "inr";
  if (u === "usd" || u === "$" || u === "dollar" || u === "dollars") return "usd";
  if (u === "jpy" || u === "¥" || u === "yen") return "jpy";
  if (u === "krw" || u === "₩" || u === "won") return "krw";
  if (u === "eur" || u === "€" || u === "euro" || u === "euros") return "eur";
  if (u === "percent" || u === "%" || u.startsWith("percent ")) return "percent";
  return "plain";
}

const trim = (v: number, digits: number) => Number(v.toFixed(digits)).toLocaleString("en-US", { maximumFractionDigits: digits });
const grouped = (v: number, digits = 2) => v.toLocaleString("en-US", { maximumFractionDigits: digits });

/** A short label for a tick: ₹8 L, ₹1.2 Cr, $50 m, $1.5 bn, ¥45 tn, €50 m, 3 %, or a plain grouped number. */
export function formatAxis(v: number, unit?: string): string {
  const kit = plotUnit(unit);
  switch (kit) {
    case "inr":
      // The existing lakh and crore words, shortened: "₹1.2 crore" becomes "₹1.2 Cr", "₹8 lakh" becomes "₹8 L".
      return formatInrWords(v).replace(" crore", " Cr").replace(" lakh", " L");
    case "usd": {
      const abs = Math.abs(v);
      const sign = v < 0 ? "-" : "";
      if (abs >= 1e9) return `${sign}$${trim(abs / 1e9, 2)} bn`;
      if (abs >= 1e6) return `${sign}$${trim(abs / 1e6, 2)} m`;
      return `${sign}$${grouped(abs)}`;
    }
    case "jpy":
    case "krw":
    case "eur": {
      const abs = Math.abs(v);
      const sign = v < 0 ? "-" : "";
      const { symbol, digits } = shortScale(kit);
      if (abs >= 1e12) return `${sign}${symbol}${trim(abs / 1e12, 2)} tn`;
      if (abs >= 1e9) return `${sign}${symbol}${trim(abs / 1e9, 2)} bn`;
      if (abs >= 1e6) return `${sign}${symbol}${trim(abs / 1e6, 2)} m`;
      return `${sign}${symbol}${grouped(abs, digits)}`;
    }
    case "percent":
      return `${trim(v, 2)} %`;
    default:
      return grouped(v);
  }
}

/** A value in full, with its unit: ₹4,000, $1,537,000,000, ¥2,450, €8.4, 3.38 %, or a plain grouped number. */
export function formatValue(v: number, unit?: string): string {
  const kit = plotUnit(unit);
  switch (kit) {
    case "inr":
      return formatInr(v);
    case "usd":
      return `${v < 0 ? "-" : ""}$${grouped(Math.abs(v))}`;
    case "jpy":
    case "krw":
    case "eur":
      return `${v < 0 ? "-" : ""}${shortScale(kit).symbol}${grouped(Math.abs(v), shortScale(kit).digits)}`;
    case "percent":
      return `${trim(v, 2)} %`;
    default:
      return grouped(v);
  }
}
