import { describe, expect, it } from "vitest";
import { annuityBreakEven } from "@/finance/present-value";
import { loadCourseMap } from "./map";
import { courseOverview, navigate, type Progress } from "./navigator";
import { topicTexts } from "./topic-texts";

// Spine Topics 2 and 3 for beginners (#89, spec #68 stories 49, 54 and 55; ADR 0020): the lottery Topic asks about the
// lottery only and keeps its formula behind Go deeper; the cash Topic defines operating income once and its Workbench
// opens at a margin a beginner believes. Each brings at most four new words and ends its Principle on a daily-life line.
// Every Check id stays, so a Learner who passed either Topic keeps the pass. Read on the real Course Map.

const map = loadCourseMap();
const LOTTERY = "spine-02-money-later";
const CASH = "spine-03-cash";
const lottery = map.topic(LOTTERY)!;
const cash = map.topic(CASH)!;

/** Every text a Learner meets in a Quick try or a quiz question. */
const askedTexts = (id: string) => topicTexts(map.topic(id)!).filter((t) => t.group === "question" || / Quick try | quickTry|Primer/.test(t.where) || t.where.includes("ask"));

describe("Spine Topic 2, the lottery, for beginners", () => {
  it("asks about the lottery only: one Case, the jackpot, and no question names Amazon", () => {
    expect(lottery.cases.map((c) => c.id)).toEqual(["spine-02-jackpot-2018"]);
    const amazon = askedTexts(LOTTERY).filter((t) => /amazon|damodaran/i.test(t.text));
    expect(amazon.map((t) => t.where)).toEqual([]);
  });

  it("keeps the formula behind Go deeper: none in the concept, the present-value Formula Card in Go deeper", () => {
    expect(lottery.concept).not.toMatch(/\{\{formula:/);
    expect(lottery.concept).not.toMatch(/divide by one plus/i);
    expect(lottery.goDeeper).toMatch(/\{\{formula:present-value /);
  });

  it("drops the expert lines: no rate given to two decimals in its questions and Quick tries", () => {
    const expert = askedTexts(LOTTERY).filter((t) => /\d+\.\d\d%/.test(t.text));
    expect(expert.map((t) => `${t.where}: ${t.text}`)).toEqual([]);
  });

  it("asks its two-year question with no sum: the answer is read off the growth it gives", () => {
    const twoYear = lottery.primers!.map((p) => p.quickTry).find((q) => /two years/.test(q.ask))!;
    expect(twoYear.ask).toMatch(/grows to \$110\.25 in two years/);
    expect(twoYear.ask).not.toMatch(/\bwhat is\b.*\bworth today\b/i);
  });
});

describe("Spine Topic 3, the cash, for beginners", () => {
  it("defines operating income once, as a Lingo term", () => {
    expect(cash.terms.filter((t) => t.term === "operating income")).toHaveLength(1);
  });

  it("opens its Workbench at a believable margin: a small profit on each sale, not -179%", () => {
    const company = cash.explore!.workbench!.inputs.company as { opening: { margin: number } };
    expect(company.opening.margin).toBeGreaterThan(0);
    expect(company.opening.margin).toBeLessThanOrEqual(10);
  });
});

// Spine critics round 1 on #89 (beginner persona, widget fit).
describe("Spine Topic 3 after the critics' round 1", () => {
  const company = () => cash.explore!.workbench!.inputs.company as { years?: { from: string; to: string }; whatIf?: string; icon?: string };

  it("names one new word in the concept, free cash flow, and leaves operating income, tax and reinvestment to Go deeper", () => {
    expect(cash.concept).toMatch(/free cash flow/i);
    expect(cash.concept).toMatch(/cash left after paying for growth/i);
    expect(cash.concept).not.toMatch(/operating income|reinvestment|\btax\b/i);
    expect(cash.goDeeper).toMatch(/operating income/i);
    expect(cash.goDeeper).toMatch(/tax/i);
  });

  it("drops the worked division from the check's card", () => {
    const card = cash.checks.find((c) => c.id === "wc-check")!.card!;
    expect(card.lines.join(" ")).not.toMatch(/divided by|\$1 invested brings/);
    expect(card.example ?? []).not.toEqual([60, 3, 20]);
  });

  it("says on screen that the profit on each sale is a what-if: the title, the bench's line and the Insight's question", () => {
    expect(cash.explore!.workbench!.title).toMatch(/^What if Webvan had made a profit on each sale\?$/);
    expect(company().whatIf).toMatch(/really lost money on most/);
    expect(cash.insight!.question).toMatch(/really lost money on most/);
    expect(cash.concept).toMatch(/really lost money on most/);
  });

  it("labels the bench with its real years, 1999 into 2000, and gives it Webvan's van", () => {
    expect(company().years).toEqual({ from: "1999", to: "2000" });
    expect(company().icon).toBe("delivery-truck");
  });
});

describe("Spine Topic 2 after the critics' round 1", () => {
  it("puts the winner and the lottery beside the chart, reacting at 0% and at the even rate the second task names", () => {
    const code = lottery.widgets.find((w) => w.id === "ml-annuity")!.code;
    expect(code).toMatch(/StoryScene\(/);
    expect(code).toMatch(/root = Widget\([^\n]*\bscene\b/);
    // It reacts only where a task already ticks, so it never gives away which side wins before the Insight is settled.
    expect(code).toMatch(/\$rate == 0 \?/);
    expect(code).toMatch(/\$rate >= 3\.36 && \$rate <= 3\.39 \?/);
  });

  it("calls the payments and the cash about the same only within 0.02 points of the break-even code works out (G12)", () => {
    // At the 30-year Treasury rate (3.33%) the payments are still worth $6.3M more than the cash, so the scene's
    // "about the same", its balance face and the "even" task all use the band the Present value Elective uses.
    const code = lottery.widgets.find((w) => w.id === "ml-annuity")!.code;
    const bands = [...code.matchAll(/\$rate >= ([\d.]+) && \$rate <= ([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(bands).toHaveLength(3);
    const rates = Array.from({ length: 1001 }, (_, i) => Number((i * 0.01).toFixed(2)));
    for (const cashOption of [877_800_000, 877_784_124]) {
      const breakEven = annuityBreakEven({ total: 1_537_000_000, payments: 30, growthPercent: 5 }, cashOption)!;
      const near = rates.filter((rate) => Math.abs(rate - breakEven) <= 0.02);
      for (const [low, high] of bands) expect(rates.filter((rate) => rate >= low && rate <= high)).toEqual(near);
    }
    expect(code).toMatch(/worth about the same/);
  });
});

describe("Spine Topics 2 and 3, for beginners", () => {
  it("bring at most four new words each", () => {
    expect(lottery.terms.length).toBeLessThanOrEqual(4);
    expect(cash.terms.length).toBeLessThanOrEqual(4);
  });

  it("each end the Principle step on a daily-life line", () => {
    expect(lottery.dailyLife).toMatch(/job offer paid over four years.*EMI/i);
    expect(cash.dailyLife).toMatch(/stock options at a startup.*how many months its cash lasts/i);
  });

  it("keep every Check id, none required, so a Learner who passed either Topic keeps the pass", () => {
    expect(lottery.checks.map((c) => c.id)).toEqual(["ml-check", "ml-talk"]);
    expect(cash.checks.map((c) => c.id)).toEqual(["wc-check", "wc-talk"]);
    expect([...lottery.checks, ...cash.checks].some((c) => c.required)).toBe(false);
    const passed: Progress = {
      currentTopicId: null,
      topics: {
        [LOTTERY]: { step: "principle", passedChecks: ["ml-check", "ml-talk"], revealShown: true, status: "passed" },
        [CASH]: { step: "principle", passedChecks: ["wc-check", "wc-talk"], revealShown: true, status: "passed" },
      },
    };
    const overview = courseOverview(map, passed);
    expect(overview.find((t) => t.id === LOTTERY)).toMatchObject({ status: "passed" });
    expect(overview.find((t) => t.id === CASH)).toMatchObject({ status: "passed" });
    expect(navigate(map, passed)?.dueChecks ?? []).toEqual([]);
  });
});

// Code review 3 (M01) and review 2 (G28) on the cash Topic: held here so they stay fixed.
describe("Spine Topic 3, the cash Topic, after code review 3", () => {
  it("glosses 'revenue' as its sales at its first use, the goal, and says sales everywhere else (M01: no Lingo card for it)", () => {
    expect(cash.goal).toMatch(/revenue \(its sales\)/);
    const later = topicTexts(cash).filter((t) => t.text !== cash.goal && /\brevenue\b/i.test(t.text));
    expect(later.map((t) => `${t.where}: ${t.text}`)).toEqual([]);
  });

  it("teaches in the Concept the idea its Quick tries and Insight test: more sales for each dollar spent makes growth cost less (G28)", () => {
    expect(cash.concept).toMatch(/The more sales each dollar spent on them brings in, the less growth costs\./);
    const tries = cash.checks.flatMap((c) => c.quickTries).flatMap((q) => ("id" in q ? [q] : []));
    expect(tries.find((q) => q.id === "wc-try-cheaper-growth")).toBeTruthy();
    // The zero-growth Quick try's fix no longer leans on a division the Concept does not teach.
    expect(JSON.stringify(tries.find((q) => q.id === "wc-try-zero-growth"))).not.toMatch(/over sales for each dollar/);
  });
});
