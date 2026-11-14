import { describe, expect, it } from "vitest";
import { calculate, CALCULATORS } from "./calculators";

// The registry is what the Tutor's tool and the calculator widget both call: inputs in,
// formatted numbers out, from the tested formulas. Expected figures are the worked examples
// checked in the formula tests.

const text = (result: ReturnType<typeof calculate>, label: string) => {
  if (!result.ok) throw new Error(result.error);
  return result.results.find((r) => r.label === label)?.text;
};

describe("calculate", () => {
  it("runs the EMI formula and shows rupees in Indian grouping with the lakh figure", () => {
    const r = calculate("emi", { principal: 5_000_000, ratePercent: 8.5, years: 20 });
    expect(text(r, "Monthly instalment")).toBe("₹43,391.16");
    expect(text(r, "Total interest")).toBe("₹54,13,878.80 (₹54.14 lakh)");
  });

  it("shows crore for the SIP maturity", () => {
    const r = calculate("sip", { monthly: 100_000, ratePercent: 12, years: 20 });
    expect(text(r, "Maturity value")).toMatch(/\(₹\d+(\.\d+)? crore\)$/);
  });

  it("uses dollars for a non-Indian calculator by default and rupees when asked", () => {
    const inputs = { amount: 1000, ratePercent: 10, years: 5 };
    expect(text(calculate("present_value", inputs), "Present value")).toBe("$620.92");
    expect(text(calculate("present_value", { ...inputs, amount: 100_000 }, "inr"), "Present value")).toBe("₹62,092.13");
  });

  it("runs bond pricing, with a percent answer for yield to maturity", () => {
    expect(text(calculate("bond_price", { face: 1000, couponPercent: 8, yieldPercent: 10, years: 5, perYear: 2 }), "Price")).toBe("$922.78");
    expect(text(calculate("yield_to_maturity", { face: 1000, couponPercent: 8, price: 922.78, years: 5, perYear: 2 }), "Yield to maturity")).toBe("10.00%");
  });

  it("takes a list of cash flows for NPV and IRR", () => {
    expect(text(calculate("npv", { ratePercent: 10, cashFlows: [-1000, 500, 400, 300, 200] }), "Net present value")).toBe("$147.12");
    expect(text(calculate("irr", { cashFlows: [-70_000, 12_000, 15_000, 18_000, 21_000, 26_000] }), "Internal rate of return")).toBe("8.66%");
  });

  it("answers an error message, not an exception, for an unknown calculator or bad input", () => {
    expect(calculate("nope", {})).toEqual({ ok: false, error: expect.stringContaining("emi") });
    const missing = calculate("emi", { principal: 100 });
    expect(missing).toEqual({ ok: false, error: expect.stringContaining("ratePercent") });
    const impossible = calculate("gordon_growth", { lastDividend: 5, growthPercent: 15, requiredPercent: 10 });
    expect(impossible).toEqual({ ok: false, error: expect.stringMatching(/growth/i) });
  });

  it("every calculator runs on its own example inputs", () => {
    for (const c of CALCULATORS) {
      const r = calculate(c.id, c.example);
      expect(r.ok, `${c.id}: ${r.ok ? "" : r.error}`).toBe(true);
    }
  });
});
