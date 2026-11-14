import { formatUsd } from "../../case-data-view";
import { formatInr, formatInrWords } from "@/finance/indian-format";

// How the wave 1 parts write a number. Rupees get lakh and crore (indian-format.ts), dollars the short form the
// rest of the app uses; every other unit is plain. Numbers reach these only from props or calculators.

/** A number to at most `digits` decimals, with no trailing zeros: 33.5, 12, 0.25. */
export function trimmed(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "–";
  const rounded = Number(value.toFixed(digits));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

/** A number with thousands grouping and at most `digits` decimals. */
export function grouped(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "–";
  return value.toLocaleString("en-IN", { maximumFractionDigits: digits });
}

/**
 * A value in its unit. inr, usd, percent, pp (percentage points), bp (basis points), years, months, grams and x are
 * known; any other text is added as a suffix ("of 3", "points").
 */
export function formatAmount(value: number, unit: string): string {
  if (!Number.isFinite(value)) return "–";
  switch (unit) {
    case "inr":
      return Math.abs(value) >= 100_000 ? formatInrWords(value) : formatInr(value);
    case "usd":
      return formatUsd(value);
    case "percent":
      return `${trimmed(value)}%`;
    case "pp":
      return `${trimmed(value)} pp`;
    case "bp":
      return `${trimmed(value)} bp`;
    case "years":
      return `${trimmed(value)} ${value === 1 ? "year" : "years"}`;
    case "months":
      return `${trimmed(value)} ${value === 1 ? "month" : "months"}`;
    case "grams":
      return `${trimmed(value)} g`;
    case "x":
      return `${trimmed(value)}×`;
    case "":
      return grouped(value);
    default:
      return `${grouped(value)} ${unit}`;
  }
}

/** "gold-bar" and 3 are "3 gold bars"; 1 is "1 gold bar". */
export function countOf(count: number, object: string): string {
  const name = object.replace(/-/g, " ");
  return `${trimmed(count)} ${count === 1 ? name : `${name}s`}`;
}
