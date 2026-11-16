import { describe, expect, it } from "vitest";
import { loadCourseMap } from "./map";
import { computedKeyedQuestion, computedQuestion } from "./quiz";
import { CASH_FLOW_CAPTION } from "@/widgets/workbench/value-levers-model";

// Spine critics round 1 on Spine Topic 15 (spine-15-value-yourself, ticket #92). Each expectation is a confirmed finding:
// the capstone's Widget words are taught on it, the which-lever choices are comparable by idea, and the Amazon reveal
// uses the course's sourced margin for 2000 (Form 10-K405: a $864m operating loss on $2,762m of net sales).

const map = loadCourseMap();
const topic = map.topic("spine-15-value-yourself")!;

describe("Spine 15 critics round 1", () => {
  it("teaches the words its Widget uses, since its start card asks for nothing first (beginner-persona)", () => {
    const terms = topic.terms.map((t) => t.term);
    for (const word of ["operating margin", "cost of capital"]) expect(terms).toContain(word);
    const story = topic.terms.find((t) => t.term === "Valuation story")!.means;
    for (const plain of ["how big it gets (sales in year 10)", "what it keeps (operating margin)", "what growth costs (sales for each dollar invested)", "how risky it is (cost of capital)"]) expect(story).toContain(plain);
    expect(story).not.toMatch(/\brevenue\b/i); // review 3 M01: the Spine never cards "revenue"; it says sales
    // The Concept names the bars by the Widget's own caption, not "free cash flow" (review 2 G31).
    expect(CASH_FLOW_CAPTION).toMatch(/^Cash it makes each year, then after year 10/);
    expect(topic.concept.replace(/\s+/g, " ")).toContain("the bars under the levers are the cash it makes each year, left after tax and after paying for growth, then one bar for every year after year 10");
    expect(topic.concept).not.toMatch(/free cash flow/);
  });

  it("moves every lever by the same fifth in the which-lever question, so the idea decides it, not the step sizes (math-police)", () => {
    const found = computedQuestion(map, "yourself-q-lever")!;
    const block = topic.cases.find((c) => c.id === found.question.computed.case)!.valuation!;
    const base: Record<string, number> = {
      marginTarget: block.margin && "afterPercent" in block.margin ? (block.margin.afterPercent as number) : NaN,
      salesToCapital: block.salesToCapital as number,
      costOfCapitalGrowing: (block.costOfCapitalPercent as number[])[0],
    };
    const steps = found.question.computed.changes.map((c) => {
      const [[lever, to]] = Object.entries(c.levers);
      const from = lever === "revenueYear10" ? (block.growthPercent as number[]).reduce((r, g) => r * (1 + g / 100), block.baseRevenue as number) : base[lever];
      return Math.abs(to / from - 1);
    });
    for (const s of steps) expect(s).toBeCloseTo(steps[0], 2);
    expect(steps[0]).toBeCloseTo(0.2, 2);
    expect(computedKeyedQuestion(map, "yourself-q-lever")!.answer).toBe("margin");
  });

  it("gives Amazon's 2000 loss as about 31 cents a dollar, the sourced figure, not 24 (historian)", () => {
    const reveal = topic.cases.find((c) => c.id === "amazon-yourself-2000")!.reveal!;
    expect(reveal).toContain("about 31 cents");
    expect(reveal).not.toMatch(/24 cents|like-for-like/);
    expect(Math.round((864 / 2762) * 100)).toBe(31);
  });
});
