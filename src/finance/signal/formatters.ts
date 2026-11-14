import { formatInr } from "../indian-format";

// Signal Widget number formats (Signal spec §6.1). Pure functions: a number in, the text a Widget shows out.

/** Dollars in millions: `$694.0M`, and from 999.95 up in billions to 3 decimals: `$1.537B`. */
export function usdM(m: number): string {
  if (m >= 999.95) return `$${(m / 1000).toFixed(3)}B`;
  return `$${m.toFixed(1)}M`;
}

/** Whole rupees with Indian digit grouping: `₹17,449`, `₹12,34,567`. */
export function inr(x: number): string {
  return formatInr(Math.round(x));
}

/** Value a share in whole dollars: `$35`. A value of zero or below shows as `$0`, never as a negative price. */
export function share(v: number): string {
  if (v <= 0) return "$0";
  return `$${Math.round(v)}`;
}

/** The true minus sign, U+2212. A hyphen is shorter and sits lower, so a sum reads wrong with it. */
const MINUS = "−";

/**
 * Signed whole dollars, as a lever effect or a waterfall step: `+$28`, `−$17`. The minus is U+2212.
 * Halves round away from zero on both sides. A value that rounds to zero shows as `$0`, with no sign.
 */
export function d$(v: number): string {
  const whole = Math.round(Math.abs(v));
  if (whole === 0) return "$0";
  return `${v < 0 ? MINUS : "+"}$${whole}`;
}

/** `x` to at most `d` decimals with the trailing zeros removed: `1`, `0.04`, `12.5`. Never `-0`. */
export function trim(x: number, d: number): string {
  const fixed = x.toFixed(d);
  const text = fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
  return text === "-0" ? "0" : text;
}
