import { describe, expect, it } from "vitest";
import { exactEquals, formatExact, parseAnswer, type Exact } from ".";

/** Reads a known-good decimal literal the test states, e.g. "0.3". */
const value = (input: string) => {
  const parsed = parseAnswer(input, "number");
  if (!parsed) throw new Error(`test literal ${input} did not parse`);
  return parsed;
};

describe("reading a typed answer", () => {
  it("reads 7.5 minus 7.2 as exactly 0.3, where floating point gives 0.2999…", () => {
    expect(7.5 - 7.2).not.toBe(0.3);
    expect(exactEquals(value("0.3"), parseAnswer("0.30", "points")!, 2)).toBe(true);
    expect(parseAnswer("0.3", "points")).toEqual<Exact>({ scaled: 3n, scale: 1 });
  });

  it("accepts the unit typed with the number, in any spacing", () => {
    for (const input of ["30", "30bp", "30 bp", "30 bps", "30 basis points", " 30 "]) {
      expect(exactEquals(parseAnswer(input, "bp")!, value("30"), 0), input).toBe(true);
    }
    expect(exactEquals(parseAnswer("12.5%", "percent")!, value("12.5"), 1)).toBe(true);
    expect(exactEquals(parseAnswer("12.5 percent", "percent")!, value("12.5"), 1)).toBe(true);
    expect(exactEquals(parseAnswer("0.5 points", "points")!, value("0.5"), 1)).toBe(true);
    expect(exactEquals(parseAnswer("1 point", "points")!, value("1"), 0)).toBe(true);
    expect(exactEquals(parseAnswer("3 years", "years")!, value("3"), 0)).toBe(true);
    expect(exactEquals(parseAnswer("1.5x", "ratio")!, value("1.5"), 1)).toBe(true);
  });

  it("reads rupees with ₹, Rs and Indian or Western commas", () => {
    for (const input of ["₹1,200", "Rs 1200", "rs. 1,200", "1200 rupees", "₹ 1200"]) {
      expect(exactEquals(parseAnswer(input, "inr")!, value("1200"), 0), input).toBe(true);
    }
    expect(exactEquals(parseAnswer("₹1,20,000", "inr")!, value("120000"), 0)).toBe(true);
    expect(exactEquals(parseAnswer("120,000", "inr")!, value("120000"), 0)).toBe(true);
  });

  it("reads a sign, or the words fall, down, rise and up", () => {
    for (const input of ["-30", "−30", "-30 bp", "a fall of 30", "30 bp fall", "down 30", "fell 30 bp", "30 down"]) {
      expect(exactEquals(parseAnswer(input, "bp")!, value("-30"), 0), input).toBe(true);
    }
    for (const input of ["+30", "up 30", "a rise of 30 bp", "rose 30"]) {
      expect(exactEquals(parseAnswer(input, "bp")!, value("30"), 0), input).toBe(true);
    }
  });

  it("reads .5, a decimal comma and trailing zeros", () => {
    expect(exactEquals(parseAnswer(".5", "points")!, value("0.5"), 1)).toBe(true);
    expect(exactEquals(parseAnswer("0,5", "points")!, value("0.5"), 1)).toBe(true);
    expect(exactEquals(parseAnswer("12,5%", "percent")!, value("12.5"), 1)).toBe(true);
    expect(exactEquals(parseAnswer("50.00", "bp")!, value("50"), 0)).toBe(true);
  });

  it("gives null for anything that is not one number", () => {
    for (const input of ["", "   ", "abc", "30 or 40", "1.2.3", "12,34,5", "3e2", "thirty", "--30", "30 bp 40"]) {
      expect(parseAnswer(input, "bp"), input).toBeNull();
    }
  });
});

describe("comparing exactly", () => {
  it("compares at the decimals the ask states, rounding half away from zero", () => {
    expect(exactEquals(value("8.333"), value("8.33"), 2)).toBe(true);
    expect(exactEquals(value("8.335"), value("8.34"), 2)).toBe(true);
    expect(exactEquals(value("8.3"), value("8.33"), 2)).toBe(false);
    expect(exactEquals(value("-0.125"), value("-0.13"), 2)).toBe(true);
    expect(exactEquals(value("0.3"), value("0.31"), 2)).toBe(false);
  });
});

describe("writing an answer for the Learner", () => {
  it("writes each unit the way the Topic says it", () => {
    expect(formatExact(value("0.3"), "points")).toBe("0.3 points");
    expect(formatExact(value("1.00"), "points")).toBe("1 point");
    expect(formatExact(value("30"), "bp")).toBe("30 bp");
    expect(formatExact(value("12.50"), "percent")).toBe("12.5%");
    expect(formatExact(value("1200"), "inr")).toBe("₹1,200");
    expect(formatExact(value("120000"), "inr")).toBe("₹1,20,000");
    expect(formatExact(value("-1200"), "inr")).toBe("-₹1,200");
    expect(formatExact(value("1"), "years")).toBe("1 year");
    expect(formatExact(value("3"), "years")).toBe("3 years");
    expect(formatExact(value("1.5"), "ratio")).toBe("1.5");
    expect(formatExact(value("-0.05"), "number")).toBe("-0.05");
  });
});
