import { describe, expect, it } from "vitest";
import { VISUALS, widgetProblems } from "./check";
import { quickCheckProblem as partQuickCheck } from "./primitives/wave1/quick-check";
import { rankProblem as partRank } from "./primitives/wave2/rank";
import { quickCheckProblem, rankProblem } from "./part-rules";

describe("one copy of the part rules", () => {
  it("a part and check.ts reject the same out-of-range QuickCheck answer and the same bad Rank order", () => {
    expect(partQuickCheck).toBe(quickCheckProblem);
    expect(partRank).toBe(rankProblem);
    const qc = widgetProblems('root = Stack([q])\nq = QuickCheck("Q?", ["a", "b"], 5, "why")');
    expect(qc.join(" ")).toContain(quickCheckProblem(["a", "b"], 5)!);
    const rk = widgetProblems('root = Stack([r])\nr = Rank("Order", ["a", "b"], [0, 0], ["x", "y"], "low", "high")');
    expect(rk.join(" ")).toContain(rankProblem(["a", "b"], [0, 0], ["x", "y"])!);
  });

  it("counts the new parts as visuals", () => {
    for (const part of ["DrawTheLine", "PriceTag", "Pictogram", "Rank", "StepThrough"]) expect(VISUALS.has(part)).toBe(true);
  });
});
