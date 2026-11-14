import { formatInr, formatInrWords } from "@/finance/indian-format";

// One formatter for every axis label and every value read, by unit, so a rupee axis never says K or M and a
// tooltip never loses its unit.

export type PlotUnit = "inr" | "usd" | "percent" | "plain";

/** Which of the kit's units a unit word means: "inr" or "rupees" or "₹", "usd" or "$", "percent" or "%"; anything else is plain. */
export function plotUnit(unit: string | undefined): PlotUnit {
  const u = (unit ?? "").trim().toLowerCase();
  if (u === "inr" || u === "₹" || u === "rs" || u === "rupee" || u === "rupees") return "inr";
  if (u === "usd" || u === "$" || u === "dollar" || u === "dollars") return "usd";
  if (u === "percent" || u === "%" || u.startsWith("percent ")) return "percent";
  return "plain";
}

const trim = (v: number, digits: number) => Number(v.toFixed(digits)).toLocaleString("en-US", { maximumFractionDigits: digits });
const grouped = (v: number, digits = 2) => v.toLocaleString("en-US", { maximumFractionDigits: digits });

/** A short label for a tick: ₹8 L, ₹1.2 Cr, $50 m, $1.5 bn, 3 %, or a plain grouped number. */
export function formatAxis(v: number, unit?: string): string {
  switch (plotUnit(unit)) {
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
    case "percent":
      return `${trim(v, 2)} %`;
    default:
      return grouped(v);
  }
}

/** A value in full, with its unit: ₹4,000, $1,537,000,000, 3.38 %, or a plain grouped number. */
export function formatValue(v: number, unit?: string): string {
  switch (plotUnit(unit)) {
    case "inr":
      return formatInr(v);
    case "usd":
      return `${v < 0 ? "-" : ""}$${grouped(Math.abs(v))}`;
    case "percent":
      return `${trim(v, 2)} %`;
    default:
      return grouped(v);
  }
}
