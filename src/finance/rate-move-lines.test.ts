import { describe, expect, it } from "vitest";
import { rateChange, rateMoveLines } from "./rate-change";

// #530: the three lines are story and lingo quotes (a reporter, a trader, a headline), never a worked sum. The numbers
// are the same ones rateChange works out; no line says "minus", "times" or "divided".
describe("a rate move said three ways (the rate_move Widget)", () => {
  it("says a rise as a reporter, a trader and a headline would", () => {
    expect(rateMoveLines(5, 5.2)).toEqual(["The rate climbs from 5% to 5.2%: up 0.2 points", "Traders call that 20 bp", "Up 4% on the old rate"]);
    expect(rateMoveLines(4, 5)).toEqual(["The rate climbs from 4% to 5%: up 1 point", "Traders call that 100 bp", "Up 25% on the old rate"]);
  });

  it("names a fall as a fall", () => {
    expect(rateMoveLines(7.5, 7.2)).toEqual(["The rate drops from 7.5% to 7.2%: down 0.3 points", "Traders call that a fall of 30 bp", "Down 4% on the old rate"]);
  });

  it("says a move from 0% has no percent change", () => {
    expect(rateMoveLines(0, 1.5)[2]).toBe("From 0% no percent change can be given: the old rate is zero, so there is nothing to take a share of");
  });

  it("says no move as no move", () => {
    expect(rateMoveLines(6, 6)).toEqual(["The rate stays at 6%: 0 points", "Traders call that 0 bp", "No change on the old rate"]);
  });

  it("never says a sum: no minus, times or divided by on any move from 0% to 20%", () => {
    for (let a = 0; a <= 2000; a += 37) {
      for (let b = 0; b <= 2000; b += 41) {
        for (const line of rateMoveLines(a / 100, b / 100)) expect(line, `${a / 100} to ${b / 100}`).not.toMatch(/minus|times|divided/i);
      }
    }
  });

  it("agrees with rateChange on moves across the whole 0% to 20% range", () => {
    for (let a = 0; a <= 2000; a += 37) {
      for (let b = 0; b <= 2000; b += 41) {
        const change = rateChange(a / 100, b / 100);
        const lines = rateMoveLines(a / 100, b / 100);
        expect(lines[1]).toMatch(new RegExp(` ${Math.abs(change.basisPoints)} bp$`));
        if (change.percentChange !== null && change.percentChange !== 0) {
          expect(lines[2], `${a / 100} to ${b / 100}`).toMatch(new RegExp(`^(Up|Down) ${Math.abs(change.percentChange)}% on the old rate$`));
        }
      }
    }
  });
});
