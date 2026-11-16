import { describe, expect, it } from "vitest";
import { E2E_SCRIPTS, draftOf } from "@/dev/e2e-tutor";
import { wordChoiceTerm } from "@/tutor/choices";
import { loadCourseMap } from "./map";
import { courseOverview, defaultPath, navigate, type Progress } from "./navigator";
import { buildScene } from "./scenes";
import { cashWaterfallScene } from "@/widgets/workbench/cash-waterfall-model";
import { cashWaterfallData } from "@/widgets/workbench/registry";

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

  it("draws where the cash went: the Workbench's scene of Webvan building, in years the Case names (critics round 2)", () => {
    const found = cashWaterfallData(statements.explore?.workbench?.inputs);
    if ("problem" in found) throw new Error(found.problem);
    expect(found.data.years).toEqual({ from: "2000", to: "2001" });
    expect(cashWaterfallScene(found.data, found.data.opening)?.line).toBe("More sales need warehouses, vans and stock first, so the cash goes out.");
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

// Spine critics round 1 on #90: the fixes each finding asked for, held here so they stay fixed.
describe("the three financial statements, after the critics' round 1 (#90)", () => {
  const dollars = (text: string) => text.match(/\$\d[\d,.]*/g) ?? [];

  it("opens on the stakes with at most two figures, leaving the rest to the scene (beginner persona)", () => {
    const story = draftOf("statements-story").text;
    expect(dollars(story).length).toBeLessThanOrEqual(2);
    expect(story.split(/(?<=[.!?])\s/).slice(0, 2).join(" ")).toMatch(/cash/);
  });

  it("glosses the explore turn's new words in plain words, and offers no word Choice for a statement the Concept already taught (beginner persona)", () => {
    const explore = draftOf("statements-explore").text;
    expect(explore).toMatch(/free cash flow, the cash left after paying to grow/i);
    expect(explore).toMatch(/operating income, what sales bring in after the running costs/i);
    const taught = draftOf("statements-concept").text.toLowerCase();
    const word = wordChoiceTerm(statements.terms, explore);
    expect(word === null || !taught.includes(word.toLowerCase()), String(word)).toBe(true);
    expect(Object.keys(E2E_SCRIPTS)).toContain("statements-explore");
  });

  it("gives Webvan no imagined words in the opening scene: its beat quotes a figure from its own report (historian)", () => {
    const opening = statements.scenes.find((s) => s.id === "st-opening")!;
    const beats = (opening.inputs as { beats: { who: string; says: string }[] }).beats.filter((b) => b.who === "webvan");
    const story = statements.cases[0].story;
    for (const b of beats) {
      expect(dollars(b.says).length, b.says).toBeGreaterThan(0);
      for (const d of dollars(b.says)) expect(story, d).toContain(d);
    }
  });

  it("gives the Concept its own Widget: one warehouse moving all three statements (widget fit)", () => {
    const concept = statements.scenes.filter((s) => s.step === "concept");
    expect(concept).toHaveLength(1);
    expect(concept[0].recipe).not.toBe("story_scene");
    const text = JSON.stringify(concept[0].inputs).toLowerCase();
    for (const name of ["warehouse", "income statement", "balance sheet", "cash flow statement"]) expect(text).toContain(name);
    expect(buildScene(statements, concept[0]).ok).toBe(true);
  });
});
