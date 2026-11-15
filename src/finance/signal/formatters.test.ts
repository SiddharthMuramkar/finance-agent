import { describe, expect, it } from "vitest";
import { d$, inr, share, trim, usdM } from "./formatters";

// Expected strings come from the Signal spec (docs/specs/value-it-signal-spec.md): the §6.1 formatter
// table, and the screens in §6.2.4, §6.3 and §13 that show a number through one of these formatters.

describe("Signal formatters: usdM, dollars in millions", () => {
  it.each([
    // §6.1 examples: the jackpot billboard total and the 30 payments at 5%.
    [1537, "$1.537B"],
    [694.0, "$694.0M"],
    // §13 QA rows 2 and 4: the payments at 5% and 3.40%, and the gap to the cash at 5%.
    [693.98, "$694.0M"],
    [874.8, "$874.8M"],
    [183.8, "$183.8M"],
    // §6.3.1: the cash option.
    [877.8, "$877.8M"],
  ])("usdM(%s) is %s", (m, text) => {
    expect(usdM(m)).toBe(text);
  });

  it("switches to billions at 999.95, the first value that 1 decimal would print as $1000.0M", () => {
    expect(usdM(999.94)).toBe("$999.9M");
    expect(usdM(999.95)).toBe("$1.000B");
  });
});

describe("Signal formatters: inr, whole rupees", () => {
  it.each([
    // §6.1 example and §6.4.1: TOT(30) = 17,449.40 shows as ₹17,449.
    [17_449.4, "₹17,449"],
    // §13 QA rows 13 and 14: growth, year 30 alone, and the split at 30 years.
    [16_449.4, "₹16,449"],
    [1_586.31, "₹1,586"],
    [3_000, "₹3,000"],
    [13_449.4, "₹13,449"],
    // §6.4.4: 8 years is ₹2,143.59, which rounds up.
    [2_143.5888, "₹2,144"],
    [1_100, "₹1,100"],
  ])("inr(%s) is %s", (x, text) => {
    expect(inr(x)).toBe(text);
  });

  it("groups as en-IN does: the last three digits, then pairs (one lakh is 1,00,000)", () => {
    expect(inr(1_234_567.4)).toBe("₹12,34,567");
  });
});

describe("Signal formatters: share, value a share", () => {
  it.each([
    // §6.1 example: his story, 35.09.
    [35.09, "$35"],
    // §13 QA rows 6, 7 and 11: one story worth $84, the grocer, and "What it keeps" at 18%.
    [83.89, "$84"],
    [2.92, "$3"],
    [86.47, "$86"],
    // §6.2.4: the risk-at-17.44% story and all four levers at maximum.
    [55.54, "$56"],
    [310.16, "$310"],
  ])("share(%s) is %s", (v, text) => {
    expect(share(v)).toBe(text);
  });

  it("shows $0 when the value is zero or below (§6.2.4: all four at minimum, −16.11 → $0)", () => {
    expect(share(-16.11)).toBe("$0");
    expect(share(0)).toBe("$0");
  });
});

describe("Signal formatters: d$, signed whole dollars", () => {
  const MINUS = "−";

  it.each([
    // §6.1 examples: +$28 and −$17 (the 27.68 growth effect and the −16.84 risk effect in §6.2.4).
    [27.68, "+$28"],
    [-16.84, `${MINUS}$17`],
    // §13 QA rows 6 and 7: the other pills for one story worth $84, and the grocer's margin pill.
    [16.68, "+$17"],
    [4.44, "+$4"],
    [-32.17, `${MINUS}$32`],
    // §6.2.3 waterfall for his story (§6.2.4): cash from years 1 to 10, after year 10, and what it owes.
    [-5.49, `${MINUS}$5`],
    [49.82, "+$50"],
    [-9.24, `${MINUS}$9`],
  ])("d$(%s) is %s", (v, text) => {
    expect(d$(v)).toBe(text);
  });

  it("writes the minus as a true minus sign, U+2212, not a hyphen", () => {
    const text = d$(-17);
    expect(text.codePointAt(0)).toBe(0x2212);
    expect(text).not.toContain("-");
  });

  it("shows a zero without a sign, as the rates readout writes 0 bp and 0% (§6.5.2)", () => {
    expect(d$(0)).toBe("$0");
    expect(d$(-0.3)).toBe("$0");
    expect(d$(0.3)).toBe("$0");
  });
});

describe("Signal formatters: trim, up to d decimals", () => {
  it.each([
    // §6.1 examples, the rates move from 4% to 5% and to 4.5% (§6.5.3): 1 point, 0.04 pt literal, 12.5% of the old rate.
    [1, 2, "1"],
    [0.04, 2, "0.04"],
    [12.5, 2, "12.5"],
    // §6.5.3 and §13 QA row 16: the other points, literal readings and targets.
    [0.5, 2, "0.5"],
    [0.02, 2, "0.02"],
    [4.02, 2, "4.02"],
    [3.98, 2, "3.98"],
    [7.92, 2, "7.92"],
    [25, 2, "25"],
  ])("trim(%s, %s) is %s", (x, d, text) => {
    expect(trim(x, d)).toBe(text);
  });

  it("rounds to d decimals before it removes the trailing zeros", () => {
    expect(trim(0.1 + 0.2, 2)).toBe("0.3");
    expect(trim(1.0001, 2)).toBe("1");
    expect(trim(12.345, 1)).toBe("12.3");
  });

  it("never shows a negative zero", () => {
    expect(trim(-0.001, 2)).toBe("0");
  });
});
