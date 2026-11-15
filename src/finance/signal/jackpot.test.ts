import { describe, expect, it } from "vitest";
import { breakEvenFound, jackpotAt, jackpotBreakEven } from "./jackpot";

// Signal spec §6.3: the 2018 Mega Millions jackpot. Money is in $ millions; rates are yearly percentages (5 means 5%).
// Every expected value is a literal from the spec, not recomputed here.

describe("Signal jackpot model (spec §6.3.1)", () => {
  it("pays 30 yearly payments from 2018 to 2047: $23.134M first (at once) and $95.223M last", () => {
    const { columns } = jackpotAt(0);
    expect(columns).toHaveLength(30);
    expect(columns[0].year).toBe(2018);
    expect(columns[14].year).toBe(2032);
    expect(columns[29].year).toBe(2047);
    expect(columns[0].paid.toFixed(3)).toBe("23.134");
    expect(columns[29].paid.toFixed(3)).toBe("95.223");
  });
});

describe("Signal jackpot acceptance values (spec §6.3.4)", () => {
  // Rate (%) → the 30 payments' worth today, in $ millions to one decimal.
  const table: [ratePercent: number, sum: string][] = [
    [0, "1537.0"],
    [1, "1288.9"],
    [2, "1090.2"],
    [3, "930.0"],
    [3.35, "881.4"],
    [3.4, "874.8"],
    [3.45, "868.2"],
    [4, "800.1"],
    [5, "694.0"],
    [7.5, "503.7"],
    [10, "382.9"],
  ];

  for (const [ratePercent, sum] of table) {
    it(`at ${ratePercent}% the 30 payments are worth $${sum}M today`, () => {
      expect(jackpotAt(ratePercent).sum.toFixed(1)).toBe(sum);
    });
  }

  it("at 5% every payment is worth $23.13M today: the growth and the rate cancel", () => {
    for (const column of jackpotAt(5).columns) expect(column.worthToday.toFixed(2)).toBe("23.13");
  });

  it("at 10% the 2047 payment is worth $6.00M today", () => {
    const last = jackpotAt(10).columns[29];
    expect(last.year).toBe(2047);
    expect(last.worthToday.toFixed(2)).toBe("6.00");
  });

  it('marks 3.35% and 3.40% as "same" (within $5M of the $877.8M cash), but not 3.45%', () => {
    expect(jackpotAt(3.35).same).toBe(true);
    expect(jackpotAt(3.4).same).toBe(true);
    expect(jackpotAt(3.45).same).toBe(false);
  });

  it('reaches "same" at 3.35% and 3.40% only, on the slider\'s 0 to 10 range in 0.05 steps', () => {
    const sliderRates = Array.from({ length: 201 }, (_, step) => step / 20);
    expect(sliderRates.filter((rate) => jackpotAt(rate).same)).toEqual([3.35, 3.4]);
  });

  it("breaks even with the $877.8M cash at a true rate of 3.377% (about 3.4%)", () => {
    expect(jackpotBreakEven().toFixed(3)).toBe("3.377");
    expect(jackpotBreakEven().toFixed(1)).toBe("3.4");
  });
});

describe("Signal jackpot pills (spec §6.3.3)", () => {
  it("gives the pill to the payments when they are worth more (d > 0)", () => {
    const at3 = jackpotAt(3);
    expect(at3.d).toBeGreaterThan(0);
    expect(at3.worthMore).toBe("payments");
  });

  it("gives the pill to the cash when it is worth more (d < 0)", () => {
    const at4 = jackpotAt(4);
    expect(at4.d).toBeLessThan(0);
    expect(at4.worthMore).toBe("cash");
  });

  it('gives "same" to both rows when they are within $5M', () => {
    expect(jackpotAt(3.35).worthMore).toBe("same");
  });
});

describe("Signal jackpot QA checklist (spec §13, items 2 to 4)", () => {
  it('2. after "The cash" the rate runs to 5.00%: payments $694.0M, "Worth more" on Cash today, $183.8M away', () => {
    const at5 = jackpotAt(5);
    expect(at5.sum.toFixed(1)).toBe("694.0");
    expect(at5.worthMore).toBe("cash");
    // d < 0, so Go deeper says "You are $183.8M away. Try a lower rate."
    expect(at5.d).toBeLessThan(0);
    expect(Math.abs(at5.d).toFixed(1)).toBe("183.8");
  });

  it('3. the scripted run from 0% to 5% passes through 3.35% and 3.40% but never shows "Break-even found"', () => {
    const scriptedRun = Array.from({ length: 101 }, (_, step) => step / 20);
    const found = scriptedRun.reduce((wasFound, rate) => breakEvenFound(wasFound, jackpotAt(rate), "script"), false);
    expect(found).toBe(false);
  });

  it('4. the rate set to 3.40% by hand gives $874.8M, "Same" on both rows and "Break-even found"', () => {
    const at340 = jackpotAt(3.4);
    expect(at340.sum.toFixed(1)).toBe("874.8");
    expect(at340.worthMore).toBe("same");
    expect(breakEvenFound(false, at340, "hand")).toBe(true);
  });

  it('keeps "Break-even found" for the session once the learner finds it', () => {
    expect(breakEvenFound(true, jackpotAt(5), "hand")).toBe(true);
    expect(breakEvenFound(true, jackpotAt(0), "script")).toBe(true);
  });

  it('does not show "Break-even found" for a hand-set rate that is not "same"', () => {
    expect(breakEvenFound(false, jackpotAt(3.45), "hand")).toBe(false);
  });
});
