import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
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

/** The Topic file as written: the daily-life line is read here until the Topic schema carries it (#86). */
const file = (id: string) => parse(readFileSync(join(process.cwd(), "course/topics", `${id}.yaml`), "utf8")) as Record<string, unknown>;

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

describe("Spine Topics 2 and 3, for beginners", () => {
  it("bring at most four new words each", () => {
    expect(lottery.terms.length).toBeLessThanOrEqual(4);
    expect(cash.terms.length).toBeLessThanOrEqual(4);
  });

  it("each end the Principle step on a daily-life line", () => {
    expect(file(LOTTERY).dailyLife).toMatch(/job offer paid over four years.*EMI/i);
    expect(file(CASH).dailyLife).toMatch(/stock options at a startup.*how many months its cash lasts/i);
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
