import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { archetypeOf, widgetParts, widgetRuleProblems, widgetWarnings } from "./check";
import { quickCheckProblem, rankProblem } from "./part-rules";

const audit = (prefix: string) => {
  const dir = join(process.cwd(), "src/widgets/fixtures/audit");
  return readFileSync(join(dir, readdirSync(dir).find((f) => f.startsWith(prefix))!), "utf8");
};

describe("archetypeOf on the audit Widgets", () => {
  it("names a slider with a kit chart, a Select quiz and two datasets", () => {
    expect(archetypeOf(audit("03-"))).toBe("Grow");
    expect(archetypeOf(audit("09-"))).toBe("Grow");
    expect(archetypeOf(audit("10-"))).toBe("Check");
    expect(archetypeOf(audit("06-"))).not.toBeNull();
    expect(archetypeOf(audit("04-"))).toBe("Compare");
  });

  it("keeps a single history chart a History", () => {
    expect(archetypeOf(audit("01-"))).toBe("History");
  });
});

describe("widgetWarnings: a number shown twice", () => {
  it("warns when a Stat's number is typed again in TextContent", () => {
    const code = [
      'root = Widget("Price", [stat, text])',
      'stat = Stat("Price", 35.82, "inr")',
      'text = TextContent("It costs ₹35.82 today.")',
    ].join("\n");
    expect(widgetWarnings(code).some((w) => w.includes("35.82") && w.includes("twice"))).toBe(true);
  });

  it("is quiet when each number appears once", () => {
    const code = ['root = Widget("Price", [stat, text])', 'stat = Stat("Price", 35.82, "inr")', 'text = TextContent("It costs a little.")'].join("\n");
    expect(widgetWarnings(code).some((w) => w.includes("twice"))).toBe(false);
  });
});

describe("the dataset scan", () => {
  const draw = (title: string) => `root = Widget("${title}", [draw])\n$drawn = []\ndraw = DrawTheLine("sensex-1992/sensex-close", "", "Draw it", $drawn)`;

  it("reads a DrawTheLine's dataset", () => {
    expect(widgetParts(draw("A")).datasets).toEqual(["sensex-1992/sensex-close"]);
  });

  it("tells the Tutor to update the open Widget that already draws it", () => {
    const problems = widgetRuleProblems(draw("B"), [draw("A")]);
    expect(problems.some((p) => p.includes("Update that Widget instead"))).toBe(true);
  });
});

describe("part rules", () => {
  it("states the QuickCheck and Rank rules", () => {
    expect(quickCheckProblem(["a"], 0)).toMatch(/2 to 4/);
    expect(quickCheckProblem(["a", "b"], 1)).toBeNull();
    expect(rankProblem(["a", "b"], [0, 1], ["x", "y"])).toBeNull();
    expect(rankProblem(["a", "b"], [0, 0], ["x", "y"])).toMatch(/every item/);
  });
});
