import { describe, expect, it } from "vitest";
import { loadCourseMap } from "./map";
import { courseOverview, defaultPath, navigate, type Progress } from "./navigator";

// Ticket #90 (spec #68; ADR 0004, ADR 0020): the three-statements Primer leaves the cash Topic and becomes its own Spine
// Topic, right after it, on a real Case (Webvan's report for 2000) with a reused Workbench (the Cash waterfall). The cash
// Topic keeps its id and its Checks, so its Learners keep their passes; the new Topic starts unpassed. Expected values
// are the ticket's, not the course read back.

const map = loadCourseMap();
const CASH = "spine-03-cash";
const STATEMENTS = "spine-statements";
const cash = map.topic(CASH)!;
const statements = map.topic(STATEMENTS)!;

describe("the three financial statements, a Spine Topic of their own (#90)", () => {
  it("sits on the Spine right after the cash Topic, written, so the default path never shows it Coming", () => {
    expect(statements.stage).toBe("spine");
    expect(statements.spine).toBe(cash.spine! + 1);
    const path = defaultPath(map).map((t) => t.id);
    expect(path.indexOf(STATEMENTS)).toBe(path.indexOf(CASH) + 1);
  });

  it("teaches the income statement, the balance sheet and the cash flow statement, in at most four new words", () => {
    expect(statements.terms.map((t) => t.term)).toEqual(["income statement", "balance sheet", "cash flow statement", "net income"]);
    expect(statements.dailyLife).toBeTruthy();
  });

  it("plays on a real Case, Webvan's report for 2000, with a reused Workbench", () => {
    expect(statements.cases.map((c) => [c.id, c.asOf])).toEqual([["spine-statements-webvan-2001", "2001-04-02"]]);
    expect(statements.explore?.workbench?.recipe).toBe("cash_waterfall");
  });

  it("takes the three-statements Primer from the cash Topic", () => {
    expect(statements.primers?.map((p) => p.title)).toContain("Three statements, one loop");
    expect(cash.primers?.map((p) => p.title) ?? []).not.toContain("Three statements, one loop");
  });

  it("keeps the cash Topic's id and Check ids, and gives the new Topic ids of its own", () => {
    expect(cash.checks.map((c) => c.id)).toEqual(["wc-check", "wc-talk"]);
    expect(cash.checks.every((c) => !c.required)).toBe(true);
    const old = new Set([...cash.checks.map((c) => c.id), ...cash.questions.map((q) => q.id)]);
    for (const id of [...statements.checks.map((c) => c.id), ...statements.questions.map((q) => q.id)]) expect(old.has(id), id).toBe(false);
  });

  it("keeps a Learner's pass of the cash Topic, and starts the new Topic unpassed", () => {
    const passedThrough = map.topics.filter((t) => t.stage === "spine" && t.spine! <= cash.spine!);
    const progress: Progress = {
      currentTopicId: null,
      topics: Object.fromEntries(passedThrough.map((t) => [t.id, { step: "principle", passedChecks: t.checks.map((c) => c.id), revealShown: true, status: "passed" as const }])),
    };
    const view = courseOverview(map, progress);
    expect(view.find((t) => t.id === CASH)).toMatchObject({ status: "passed", checks: [{ id: "wc-check", passed: true }, { id: "wc-talk", passed: true }] });
    expect(view.find((t) => t.id === STATEMENTS)).toMatchObject({ status: "not_started" });
    expect(navigate(map, progress)?.topic.id).toBe(STATEMENTS);
  });
});
