import { describe, expect, it } from "vitest";
import { rateMove, rateMoveReadouts } from "./rates";

// Signal spec §6.5 "One move, three sizes". Every expected value comes from the spec's acceptance table (§6.5.3)
// and the QA checklist (§13 items 16 and 17), never from the formulas the module runs.
describe("one rate move, three sizes (spec §6.5.3)", () => {
  it("says 4% to 5% is 1 point, +100 bp, up 25%, and read literally only 0.04 points, to 4.04%", () => {
    expect(rateMove(4, 5)).toEqual({ points: 1, basisPoints: 100, percentOfOld: 25, literal: { points: 0.04, target: 4.04 } });
  });

  it("QA 16: 4% to 4.50% is 0.5 points, +50 bp, up 12.5%, and read literally 0.02 points, to 4.02%", () => {
    expect(rateMove(4, 4.5)).toEqual({ points: 0.5, basisPoints: 50, percentOfOld: 12.5, literal: { points: 0.02, target: 4.02 } });
  });

  it("QA 17: 2% to 3% is 1 point, +100 bp, up 50%, and read literally 0.02 points, to 2.02%", () => {
    expect(rateMove(2, 3)).toEqual({ points: 1, basisPoints: 100, percentOfOld: 50, literal: { points: 0.02, target: 2.02 } });
  });

  it("gives a fall negative sizes, and the literal reading moves the old rate down", () => {
    expect(rateMove(4, 3.5)).toEqual({ points: -0.5, basisPoints: -50, percentOfOld: -12.5, literal: { points: 0.02, target: 3.98 } });
    expect(rateMove(8, 7)).toEqual({ points: -1, basisPoints: -100, percentOfOld: -12.5, literal: { points: 0.08, target: 7.92 } });
  });

  it("gives the literal reading without float noise (worked by hand: 1/10 of 3% is 0.003 points, to 3.003%)", () => {
    expect(rateMove(3, 3.1).literal).toEqual({ points: 0.003, target: 3.003 });
  });

  it("has no literal reading when the rate does not move", () => {
    expect(rateMove(4, 4)).toEqual({ points: 0, basisPoints: 0, percentOfOld: 0, literal: null });
  });
});

// The facts grid under the chart (spec §6.5.2 "Readouts"): three cells, the same words the spec's table gives.
describe("the rates readouts (spec §6.5.2)", () => {
  it("words an up move of 1 point as the spec's first column does", () => {
    expect(rateMoveReadouts(4, 5)).toEqual({ howFar: "up 1 point", traders: "+100 bp", nextToOld: "up 25%" });
  });

  it("words a fall of 0.5 points as the second column does, with a true minus sign (U+2212)", () => {
    expect(rateMoveReadouts(4, 3.5)).toEqual({ howFar: "down 0.5 points", traders: "−50 bp", nextToOld: "down 12.5%" });
  });

  it("QA 16 and 17: 4% to 4.50% reads 0.5 points, +50 bp, up 12.5%; 2% to 3% reads up 1 point, +100 bp, up 50%", () => {
    expect(rateMoveReadouts(4, 4.5)).toEqual({ howFar: "up 0.5 points", traders: "+50 bp", nextToOld: "up 12.5%" });
    expect(rateMoveReadouts(2, 3)).toEqual({ howFar: "up 1 point", traders: "+100 bp", nextToOld: "up 50%" });
  });

  it("words no move as the third column does", () => {
    expect(rateMoveReadouts(4, 4)).toEqual({ howFar: "No move", traders: "0 bp", nextToOld: "0%" });
  });
});
