import { describe, expect, it } from "vitest";
import { breakEvenFound, JACKPOT, jackpotAt, jackpotBreakEven } from "./jackpot";

// Signal spec §6.3: the jackpot widget on the Kerala Thiruvonam Bumper of 9 October 2024 (₹25 crore, paid at once), set
// against the same ₹25 crore paid the American way, as 30 yearly payments. Money is in ₹ crore; rates are yearly
// percentages (5 means 5%). Every expected value is a literal from the spec's §6.3.4 table, worked out apart from the code.

describe("Signal jackpot model (spec §6.3.1)", () => {
  it("is the dated Indian Moment: ₹25 crore drawn on 9 Oct 2024 and paid at once", () => {
    expect(JACKPOT).toMatchObject({ advertisedTotal: 25, cash: 25, payments: 30, growthPercent: 5, firstYear: 2024, asOf: "2024-10-09" });
  });

  it("pays 30 yearly payments from 2024 to 2053: ₹0.3763 crore first (at once) and ₹1.5488 crore last", () => {
    const { columns } = jackpotAt(0);
    expect(columns).toHaveLength(30);
    expect(columns[0].year).toBe(2024);
    expect(columns[14].year).toBe(2038);
    expect(columns[29].year).toBe(2053);
    expect(columns[0].paid.toFixed(4)).toBe("0.3763");
    expect(columns[29].paid.toFixed(4)).toBe("1.5488");
  });
});

describe("Signal jackpot acceptance values (spec §6.3.4)", () => {
  // Rate (%) → the 30 payments' worth today, in ₹ crore to two decimals.
  const table: [ratePercent: number, sum: string][] = [
    [0, "25.00"],
    [0.05, "24.78"],
    [1, "20.96"],
    [2, "17.73"],
    [3, "15.13"],
    [4, "13.01"],
    [5, "11.29"],
    [7.5, "8.19"],
    [10, "6.23"],
  ];

  for (const [ratePercent, sum] of table) {
    it(`at ${ratePercent}% the 30 payments are worth ₹${sum} crore today`, () => {
      expect(jackpotAt(ratePercent).sum.toFixed(2)).toBe(sum);
    });
  }

  it("at 5% every payment is worth ₹0.3763 crore today: the growth and the rate cancel", () => {
    for (const column of jackpotAt(5).columns) expect(column.worthToday.toFixed(4)).toBe("0.3763");
  });

  it("at 10% the 2053 payment is worth ₹0.0976 crore (₹9.76 lakh) today", () => {
    const last = jackpotAt(10).columns[29];
    expect(last.year).toBe(2053);
    expect(last.worthToday.toFixed(4)).toBe("0.0976");
  });

  it('reaches "same" at 0% only, on the slider\'s 0 to 10 range in 0.05 steps', () => {
    const sliderRates = Array.from({ length: 201 }, (_, step) => step / 20);
    expect(sliderRates.filter((rate) => jackpotAt(rate).same)).toEqual([0]);
  });

  it("breaks even with the ₹25 crore cash only at 0%: at any rate above it the cash is worth more", () => {
    expect(jackpotBreakEven().toFixed(3)).toBe("0.000");
  });
});

describe("Signal jackpot pills (spec §6.3.3)", () => {
  it("gives the pill to the cash at any rate above zero (d < 0)", () => {
    const at4 = jackpotAt(4);
    expect(at4.d).toBeLessThan(0);
    expect(at4.worthMore).toBe("cash");
  });

  it('gives "same" to both rows at 0%', () => {
    expect(jackpotAt(0).worthMore).toBe("same");
  });
});

describe("Signal jackpot QA checklist (spec §13, items 2 to 4)", () => {
  it('2. after "The cash" the rate runs to 5.00%: payments ₹11.29 crore, "Worth more" on Cash today, ₹13.71 crore away', () => {
    const at5 = jackpotAt(5);
    expect(at5.sum.toFixed(2)).toBe("11.29");
    expect(at5.worthMore).toBe("cash");
    expect(at5.d).toBeLessThan(0);
    expect(Math.abs(at5.d).toFixed(2)).toBe("13.71");
  });

  it('3. the scripted run from 0% to 5% starts at the "same" 0% but never shows "Break-even found"', () => {
    const scriptedRun = Array.from({ length: 101 }, (_, step) => step / 20);
    const found = scriptedRun.reduce((wasFound, rate) => breakEvenFound(wasFound, jackpotAt(rate), "script"), false);
    expect(found).toBe(false);
  });

  it('4. the rate set to 0% by hand gives ₹25 crore, "Same" on both rows and "Break-even found"', () => {
    const at0 = jackpotAt(0);
    expect(at0.sum.toFixed(2)).toBe("25.00");
    expect(at0.worthMore).toBe("same");
    expect(breakEvenFound(false, at0, "hand")).toBe(true);
  });

  it('keeps "Break-even found" for the session once the learner finds it', () => {
    expect(breakEvenFound(true, jackpotAt(5), "hand")).toBe(true);
  });

  it('does not show "Break-even found" for a hand-set rate that is not "same"', () => {
    expect(breakEvenFound(false, jackpotAt(0.05), "hand")).toBe(false);
  });
});
