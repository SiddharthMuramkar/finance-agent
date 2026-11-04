/**
 * Exact answers: a typed answer read as a scaled integer, compared at the decimals its ask states and written back in
 * the item's unit. Floating point never decides a mark: 7.5 minus 7.2 is exactly 0.3 here.
 */

/** What a typed answer is measured in. "points" are percentage points; "inr" is rupees. */
export type Unit = "points" | "bp" | "percent" | "inr" | "years" | "ratio" | "number";

/**
 * How the sign of a typed answer counts.
 * - magnitude: the answer is a size, so 30 and -30 both match 30.
 * - either: the answer has a direction; the size alone, or the size with the right sign, is right (30 and -30 for a fall of 30, only 30 for a rise).
 * - signed: the sign must match.
 */
export type SignRule = "magnitude" | "signed" | "either";

/** A decimal held exactly: its value is scaled / 10^scale. */
export interface Exact {
  scaled: bigint;
  scale: number;
}

const TEN = 10n;
const pow10 = (n: number) => TEN ** BigInt(n);

/** The same value with no trailing zeros after the point: 12.50 becomes 12.5. */
export function normalize(x: Exact): Exact {
  let { scaled, scale } = x;
  while (scale > 0 && scaled % TEN === 0n) {
    scaled /= TEN;
    scale -= 1;
  }
  return { scaled, scale };
}

/** Rounds to `decimals` places, half away from zero (8.335 to 8.34, -0.125 to -0.13). */
export function roundTo(x: Exact, decimals: number): Exact {
  if (x.scale <= decimals) return { scaled: x.scaled * pow10(decimals - x.scale), scale: decimals };
  const p = pow10(x.scale - decimals);
  const negative = x.scaled < 0n;
  const size = negative ? -x.scaled : x.scaled;
  let q = size / p;
  if ((size % p) * 2n >= p) q += 1n;
  return { scaled: negative ? -q : q, scale: decimals };
}

/** True when a and b are the same once both are rounded to `decimals` places. */
export function exactEquals(a: Exact, b: Exact, decimals: number): boolean {
  return roundTo(a, decimals).scaled === roundTo(b, decimals).scaled;
}

/** True when a and b are the same value, with no rounding. */
export function sameValue(a: Exact, b: Exact): boolean {
  return exactEquals(a, b, Math.max(a.scale, b.scale));
}

const align = (a: Exact, b: Exact): [bigint, bigint, number] => {
  const scale = Math.max(a.scale, b.scale);
  return [a.scaled * pow10(scale - a.scale), b.scaled * pow10(scale - b.scale), scale];
};

export const add = (a: Exact, b: Exact): Exact => {
  const [x, y, scale] = align(a, b);
  return normalize({ scaled: x + y, scale });
};
export const subtract = (a: Exact, b: Exact): Exact => {
  const [x, y, scale] = align(a, b);
  return normalize({ scaled: x - y, scale });
};
export const multiply = (a: Exact, b: Exact): Exact => normalize({ scaled: a.scaled * b.scaled, scale: a.scale + b.scale });
export const negate = (x: Exact): Exact => ({ scaled: -x.scaled, scale: x.scale });
export const absolute = (x: Exact): Exact => (x.scaled < 0n ? negate(x) : x);
export const isZero = (x: Exact) => x.scaled === 0n;
export const isNegative = (x: Exact) => x.scaled < 0n;
/** Moves the point: shift(x, 2) is x × 100, shift(x, -3) is x ÷ 1,000. Always exact. */
export const shift = (x: Exact, places: number): Exact =>
  normalize(places >= 0 ? { scaled: x.scaled * pow10(places), scale: x.scale } : { scaled: x.scaled, scale: x.scale - places });
/** a ÷ b rounded to `decimals` places, half away from zero; null when b is 0. */
export function divide(a: Exact, b: Exact, decimals: number): Exact | null {
  if (isZero(b)) return null;
  // a / b = (a.scaled / 10^a.scale) / (b.scaled / 10^b.scale); work one place finer, then round.
  const finer = decimals + 1;
  const numerator = a.scaled * pow10(finer + b.scale);
  const denominator = b.scaled * pow10(a.scale);
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  // Truncated at one finer place, plus a sticky digit, so half-way cases round the same as exact division.
  const q = n / d;
  const sticky = n % d === 0n ? 0n : 1n;
  const rounded = roundTo({ scaled: q * TEN + sticky, scale: finer + 1 }, decimals);
  return normalize(negative ? negate(rounded) : rounded);
}

/** A number written in a Topic file or a template range, read exactly from its decimal form. */
export function exactFrom(value: number | string): Exact {
  const text = typeof value === "number" ? String(value) : value.trim();
  const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (match[2] === "" && !match[3])) throw new Error(`Not a plain decimal: ${text}`);
  const [, sign, whole, fraction = ""] = match;
  const scaled = BigInt(`${whole || "0"}${fraction}`);
  return normalize({ scaled: sign ? -scaled : scaled, scale: fraction.length });
}

/** The plain decimal, e.g. "0.3" or "-30", with no unit and no grouping. */
export function plainExact(x: Exact): string {
  const { scaled, scale } = normalize(x);
  const digits = (scaled < 0n ? -scaled : scaled).toString().padStart(scale + 1, "0");
  const whole = digits.slice(0, digits.length - scale);
  const fraction = digits.slice(digits.length - scale);
  return `${scaled < 0n ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

/** Indian grouping: 1,200 and 1,20,000. */
const group = (whole: string) => {
  if (whole.length <= 3) return whole;
  const last = whole.slice(-3);
  const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+$)/g, ",");
  return `${rest},${last}`;
};

/** The answer as the Learner reads it: "0.3 points", "30 bp", "12.5%", "₹1,200", "3 years". */
export function formatExact(x: Exact, unit: Unit): string {
  const plain = plainExact(x);
  const negative = plain.startsWith("-");
  const size = negative ? plain.slice(1) : plain;
  const [whole, fraction] = size.split(".");
  const grouped = `${group(whole)}${fraction ? `.${fraction}` : ""}`;
  const sign = negative ? "-" : "";
  const one = size === "1";
  switch (unit) {
    case "points":
      return `${sign}${grouped} ${one ? "point" : "points"}`;
    case "bp":
      return `${sign}${grouped} bp`;
    case "percent":
      return `${sign}${grouped}%`;
    case "inr":
      return `${sign}₹${grouped}`;
    case "years":
      return `${sign}${grouped} ${one ? "year" : "years"}`;
    case "ratio":
    case "number":
      return `${sign}${grouped}`;
  }
}

/** Unit words and symbols a Learner may type with the number. A unit that is not the item's own is ignored, so "0.3 points" for a basis-point ask is read as 0.3 and marked as the stopped-at-points Known mistake. */
const UNIT_WORDS = new Set([
  "bp", "bps", "bips", "basis", "point", "points", "pts", "pt", "pp", "percentage", "percent", "per", "cent", "pct",
  "rs", "inr", "rupee", "rupees", "year", "years", "yr", "yrs", "x", "times",
]);
const FALL_WORDS = new Set(["fall", "falls", "fell", "fallen", "down", "drop", "drops", "dropped", "decrease", "decreased", "decline", "declined", "lower", "minus", "negative"]);
const RISE_WORDS = new Set(["rise", "rises", "rose", "risen", "up", "increase", "increased", "plus", "positive", "higher"]);
const FILLER_WORDS = new Set(["a", "an", "of", "by", "it", "is", "its", "the"]);

const TOKEN = /\s+|(?<num>[+-]?(?:\d[\d,]*(?:\.\d*)?|\.\d+))|(?<word>[a-z]+)|(?<sym>[%₹×])/y;
const WESTERN = /^\d{1,3}(?:,\d{3})+$/;
const INDIAN = /^\d{1,2}(?:,\d{2})*,\d{3}$/;

/** Reads the digits of one number token, with its commas, into an Exact; null when the commas make no sense. */
function readNumber(token: string): Exact | null {
  const negative = token.startsWith("-");
  let body = token.replace(/^[+-]/, "");
  if (body.includes(",")) {
    const [whole, fraction] = body.split(".");
    const commas = whole.split(",").length - 1;
    const afterComma = whole.slice(whole.lastIndexOf(",") + 1);
    if (fraction === undefined && commas === 1 && afterComma.length !== 3) {
      body = whole.replace(",", "."); // a decimal comma: 0,5 or 12,5
    } else if (WESTERN.test(whole) || INDIAN.test(whole)) {
      body = `${whole.replaceAll(",", "")}${fraction === undefined ? "" : `.${fraction}`}`;
    } else {
      return null;
    }
  }
  const [whole, fraction = ""] = body.split(".");
  if (!/^\d*$/.test(whole) || !/^\d*$/.test(fraction) || whole + fraction === "") return null;
  const scaled = BigInt(`${whole || "0"}${fraction}`);
  return { scaled: negative ? -scaled : scaled, scale: fraction.length };
}

/**
 * Reads what the Learner typed as one exact number, or null when it is not one number. It accepts %, bp, ₹, Rs,
 * points, years, commas (Indian, Western or a decimal comma), a leading sign, and words for the direction ("a fall
 * of 30", "down 30", "up 30"). Units are read as decoration: the number is taken in the item's own `unit`.
 */
export function parseAnswer(input: string, unit: Unit): Exact | null {
  void unit; // every unit takes the same forms today; the parameter keeps room for unit-specific forms
  const text = input
    .toLowerCase()
    .replace(/[−–—]/g, "-")
    .replace(/\brs\./g, "rs")
    .trim();
  if (!text) return null;
  let number: string | null = null;
  let fall = false;
  let rise = false;
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < text.length) {
    const match = TOKEN.exec(text);
    if (!match) return null;
    const { num, word } = match.groups ?? {};
    if (num !== undefined) {
      if (number !== null) return null;
      number = num;
    } else if (word !== undefined) {
      if (FALL_WORDS.has(word)) fall = true;
      else if (RISE_WORDS.has(word)) rise = true;
      else if (!UNIT_WORDS.has(word) && !FILLER_WORDS.has(word)) return null;
    }
  }
  if (number === null || (fall && rise)) return null;
  if ((fall && number.startsWith("+")) || (rise && number.startsWith("-"))) return null;
  const read = readNumber(number);
  if (!read) return null;
  return normalize(fall && !isNegative(read) ? negate(read) : read);
}
