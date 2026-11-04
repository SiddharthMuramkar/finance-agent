import { describe, expect, it } from "vitest";
import { rateChange, rateMoveLines } from "./rate-change";

describe("a rate move as three worked lines (the rate_move Widget)", () => {
  it("works a rise out in words", () => {
    expect(rateMoveLines(5, 5.2)).toEqual(["5.2% minus 5% is 0.2 points", "0.2 points times 100 is 20 bp", "0.2 divided by the old 5%, times 100, is 4%"]);
    expect(rateMoveLines(4, 5)).toEqual(["5% minus 4% is 1 point", "1 point times 100 is 100 bp", "1 divided by the old 4%, times 100, is 25%"]);
  });

  it("names a fall as a fall", () => {
    expect(rateMoveLines(7.5, 7.2)).toEqual([
      "7.2% minus 7.5% is a fall of 0.3 points",
      "0.3 points times 100 is a fall of 30 bp",
      "0.3 divided by the old 7.5%, times 100, is a fall of 4%",
    ]);
  });

  it("says a move from 0% has no percent change", () => {
    expect(rateMoveLines(0, 1.5)[2]).toBe("The old rate is 0%, so the percent change has no value");
  });

  it("says no move as zero", () => {
    expect(rateMoveLines(6, 6)).toEqual(["6% minus 6% is 0 points", "0 points times 100 is 0 bp", "0 divided by the old 6%, times 100, is 0%"]);
  });

  it("agrees with rateChange on moves across the whole 0% to 20% range", () => {
    for (let a = 0; a <= 2000; a += 37) {
      for (let b = 0; b <= 2000; b += 41) {
        const change = rateChange(a / 100, b / 100);
        const lines = rateMoveLines(a / 100, b / 100);
        expect(lines[1]).toMatch(new RegExp(` ${Math.abs(change.basisPoints)} bp$`));
        if (change.percentChange !== null) expect(lines[2], `${a / 100} to ${b / 100}`).toMatch(new RegExp(` ${Math.abs(change.percentChange)}%$`));
      }
    }
  });
});
