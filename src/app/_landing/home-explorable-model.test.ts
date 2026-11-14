import { describe, expect, it } from "vitest";
import type { CaseData } from "@/case-data/case-data";
import { DRAG_STEP, axisMax, dragStep, cashFigure, clampRate, dragRate, matchRate, matchWindow, shortMoney, sideOf, signedMoney, standingOf, worthAt, type HomeAnnuity } from "./home-explorable-model";

// Home's Explorable (the owner's design E, 11 Nov 2026): what the annuity is worth at the visitor's rate, and how
// that sits against the sourced cash option. Expected figures were worked out separately (a plain loop over the 30
// growing payments), not with the code under test.

const annuity: HomeAnnuity = {
  total: 1_537_000_000,
  payments: 30,
  growthPercent: 5,
  firstYear: 2018,
  compareTo: "mega-millions-2018/cash-option",
  rate: { label: "Interest rate (discount rate)", min: 0, max: 10, step: 0.01, start: 5 },
};
const CASH = 877_800_000;

describe("worthAt", () => {
  it.each([
    [0, 1537.0],
    [2, 1090.2],
    [5, 694.0],
    [10, 382.9],
  ])("at %d%% the 30 payments are worth $%dM today", (rate, millions) => {
    expect(Number((worthAt(annuity, rate).worth / 1e6).toFixed(1))).toBe(millions);
  });

  it("gives each payment's year and worth today, the first paid now", () => {
    const { rows } = worthAt(annuity, 5);
    expect(rows).toHaveLength(30);
    expect(rows[0].year).toBe(0);
    // At 5% discount and 5% growth, every payment is worth the same today.
    expect(rows[29].presentValue).toBeCloseTo(rows[0].presentValue, 0);
  });
});

describe("sideOf", () => {
  it("is a gain above the cash, a loss below it, and even within $50,000", () => {
    expect(sideOf(212_400_000)).toBe("gain");
    expect(sideOf(-183_800_000)).toBe("loss");
    expect(sideOf(49_999)).toBe("even");
    expect(sideOf(-49_999)).toBe("even");
  });

  it("flips between 3.37% and 3.39%, where the annuity passes the cash", () => {
    expect(sideOf(worthAt(annuity, 3.37).worth - CASH)).toBe("gain");
    expect(sideOf(worthAt(annuity, 3.39).worth - CASH)).toBe("loss");
  });
});

// Spec 2026-11-12 E3 and Appendix B.4: thirty payments, the first now, each 5% larger, adding up to $1,537M (the first
// $23.13M, the last $95.22M), against a cash option of $877.78M; the two match at 3.38%.
describe("the chart's axis [E3]", () => {
  it("is fixed at the tallest bar at 0%, $95.2M, drawn to $100M", () => {
    const tallest = Math.max(...worthAt(annuity, 0).rows.map((r) => r.presentValue));
    expect(shortMoney(tallest)).toBe("$95.2M");
    expect(axisMax(annuity)).toBe(100_000_000);
  });

  it("holds every bar at every rate the slider reaches, so it never has to change", () => {
    for (let rate = 0; rate <= 10; rate += 0.25) {
      for (const row of worthAt(annuity, rate).rows) expect(row.presentValue, `${rate}%`).toBeLessThanOrEqual(axisMax(annuity));
    }
  });
});

describe("the match [E3]", () => {
  const cash = 877_780_000;

  it("is the rate where the 30 payments are worth the cash: 3.38% (3.3774%)", () => {
    expect(matchRate(annuity, cash)!.toFixed(2)).toBe("3.38");
    expect(matchRate(annuity, cash)).toBeCloseTo(3.3774, 3);
  });

  it('"You found it" shows within 1% of the cash, a window that lies between 3.3% and 3.5%', () => {
    const window = matchWindow(annuity, cash)!;
    expect(window.low).toBeGreaterThan(3.3);
    expect(window.high).toBeLessThan(3.5);
    expect(window.low).toBeLessThan(3.3774);
    expect(window.high).toBeGreaterThan(3.3774);
    expect(standingOf(worthAt(annuity, 3.38).worth, cash)).toBe("match");
    expect(standingOf(worthAt(annuity, 3.3).worth, cash)).toBe("payments");
    expect(standingOf(worthAt(annuity, 3.5).worth, cash)).toBe("cash");
  });

  it("below the match the payments are worth more; above it, the cash", () => {
    expect(standingOf(worthAt(annuity, 0).worth, cash)).toBe("payments");
    expect(standingOf(worthAt(annuity, 2.99).worth, cash)).toBe("payments");
    expect(standingOf(worthAt(annuity, 5).worth, cash)).toBe("cash");
    expect(standingOf(worthAt(annuity, 10).worth, cash)).toBe("cash");
  });
});

describe("the rate slider [E3, B5]", () => {
  const cash = 877_780_000;

  it("drags in steps of 0.05: 200 steps across 0% to 10%", () => {
    expect(DRAG_STEP).toBe(0.05);
    expect((annuity.rate.max - annuity.rate.min) / DRAG_STEP).toBe(200);
    expect(dragRate(annuity, 2.987, cash)).toBe(3);
    expect(dragRate(annuity, 5.02, cash)).toBe(5);
    expect(dragRate(annuity, 12, cash)).toBe(10);
    expect(dragRate(annuity, -1, cash)).toBe(0);
  });

  it("rests on the match, 3.38%, when a drag lands within 1% of the cash", () => {
    expect(dragRate(annuity, 3.35, cash)).toBe(3.38);
    expect(dragRate(annuity, 3.4, cash)).toBe(3.38);
    expect(dragRate(annuity, 3.25, cash)).toBe(3.25);
    expect(dragRate(annuity, 3.5, cash)).toBe(3.5);
  });

  // B5: "Dragging moves in steps at least two pixels wide." A phone's track (390 px wide, less the page's and the card's
  // gutters) is about 326 px: 0.05 would be 1.6 px, so the drag steps in 0.1 there; the desktop card's 485 px keeps 0.05.
  it("keeps every drag step at least two pixels wide: 0.05 on a 485 px track, 0.1 on a phone's 326 px", () => {
    expect(dragStep(annuity, 485)).toBe(0.05);
    expect(dragStep(annuity, 400)).toBe(0.05);
    expect(dragStep(annuity, 326)).toBe(0.1);
    expect(dragStep(annuity, 0)).toBe(0.05);
    for (const width of [200, 326, 399, 485, 900]) expect((dragStep(annuity, width) / (annuity.rate.max - annuity.rate.min)) * width).toBeGreaterThanOrEqual(2);
    expect(dragRate(annuity, 2.96, cash, 0.1)).toBe(3);
  });

  it("on a phone's 0.1 steps the match can still be found: a drag to 3.4% rests on 3.38%", () => {
    expect(dragRate(annuity, 3.41, cash, dragStep(annuity, 326))).toBe(3.38);
    expect(dragRate(annuity, 3.29, cash, dragStep(annuity, 326))).toBe(3.3);
  });

  it("without the cash option, only steps", () => {
    expect(dragRate(annuity, 3.36, null)).toBe(3.35);
  });

  it("keeps a set rate inside the range, to the hundredth", () => {
    expect(clampRate(annuity, 0.1 + 0.2)).toBe(0.3);
    expect(clampRate(annuity, 10.4)).toBe(10);
    expect(clampRate(annuity, -0.01)).toBe(0);
  });
});

describe("shortMoney and signedMoney", () => {
  it("writes millions to one decimal and billions to three", () => {
    expect(shortMoney(694_000_000)).toBe("$694.0M");
    expect(shortMoney(877_800_000)).toBe("$877.8M");
    expect(shortMoney(1_537_000_000)).toBe("$1.537B");
    expect(shortMoney(999_960_000)).toBe("$1.000B");
  });

  it("signs the gap to the cash, with a true minus sign", () => {
    expect(signedMoney(659_200_000)).toBe("+$659.2M");
    expect(signedMoney(-183_800_000)).toBe("−$183.8M");
    expect(signedMoney(10_000)).toBe("$0.0M");
  });
});

describe("cashFigure", () => {
  const cases: CaseData[] = [
    {
      caseId: "mega-millions-2018",
      asOf: "2018-10-24",
      revealed: false,
      datasets: [
        {
          id: "cash-option",
          label: "Cash option",
          unit: "USD",
          source: "Mega Millions",
          sourceUrl: "https://example.com/",
          checkedOn: "2026-10-01",
          points: [
            { date: "2018-10-20", value: 1 },
            { date: "2018-10-23", value: CASH },
          ],
        },
      ],
    },
  ];

  it("reads the latest point of the referenced dataset", () => {
    expect(cashFigure(cases, "mega-millions-2018/cash-option")).toEqual({
      label: "Cash option",
      value: CASH,
      date: "2018-10-23",
      source: "Mega Millions",
      sourceUrl: "https://example.com/",
    });
  });

  it("is null when the Case or dataset is missing, or not in dollars", () => {
    expect(cashFigure([], "mega-millions-2018/cash-option")).toBeNull();
    expect(cashFigure(cases, "mega-millions-2018/other")).toBeNull();
    expect(cashFigure([{ ...cases[0], datasets: [{ ...cases[0].datasets[0], unit: "percent" }] }], "mega-millions-2018/cash-option")).toBeNull();
  });
});
