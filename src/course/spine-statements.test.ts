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
  const dollars = (text: string) => (text.match(/\$\d[\d,.]*/g) ?? []).map((d) => d.replace(/[.,]$/, ""));
  const amount = (d: string) => Number(d.replace(/[$,]/g, ""));

  it("opens on the stakes with at most two figures, leaving the rest to the scene (beginner persona)", () => {
    const story = draftOf("statements-story").text;
    expect(dollars(story).length).toBeLessThanOrEqual(2);
    expect(story.split(/(?<=[.!?])\s/).slice(0, 2).join(" ")).toMatch(/cash/);
  });

  it("glosses the explore turn's new words in plain words, and offers no word Choice for a statement the Concept already taught (beginner persona)", () => {
    const explore = draftOf("statements-explore").text;
    expect(explore).toMatch(/free cash flow, the cash left after paying to grow/i);
    const taught = draftOf("statements-concept").text.toLowerCase();
    const word = wordChoiceTerm(statements.terms, explore);
    expect(word === null || !taught.includes(word.toLowerCase()), String(word)).toBe(true);
    expect(Object.keys(E2E_SCRIPTS)).toContain("statements-explore");
  });

  it("gives Webvan no imagined words in the opening scene: its beat quotes a figure from its own report, rounded at most (historian)", () => {
    const opening = statements.scenes.find((s) => s.id === "st-opening")!;
    const beats = (opening.inputs as { beats: { who: string; says: string }[] }).beats.filter((b) => b.who === "webvan");
    const reported = dollars(statements.cases[0].story).map(amount);
    for (const b of beats) {
      expect(dollars(b.says).length, b.says).toBeGreaterThan(0);
      for (const d of dollars(b.says)) expect(reported.some((r) => Math.abs(r - amount(d)) <= r * 0.02), d).toBe(true);
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

// Spine critics round 1 on #90, after the merge: the fixes each finding asked for, held here so they stay fixed.
describe("the three financial statements, after the critics' second round 1 (#90)", () => {
  const dollars = (text: string) => (text.match(/\$\d[\d,.]*/g) ?? []).map((d) => d.replace(/[.,]$/, ""));
  const opening = statements.scenes.find((s) => s.id === "st-opening")!;
  const beats = (opening.inputs as { beats: { says: string }[] }).beats.map((b) => b.says).join(" ");

  it("opens on two round figures across the reply and the scene, and leaves the spending figures to Go deeper (beginner persona)", () => {
    const turn1 = `${draftOf("statements-story").text} ${beats}`;
    const figures = new Set(dollars(turn1));
    expect(figures.size, [...figures].join(", ")).toBeLessThanOrEqual(2);
    for (const d of figures) expect(d, d).not.toMatch(/\.\d/);
    for (const d of ["$259.8", "$263.1", "$178.5"]) expect(turn1).not.toContain(d);
    // The gap between the loss and the cash is explained where the two figures now sit.
    for (const d of ["$453.3", "$263.1", "$259.8"]) expect(statements.goDeeper ?? "").toContain(d);
  });

  it("leads the explore turn with one new word, free cash flow, and calls the margin a profit on each sale (beginner persona)", () => {
    const explore = draftOf("statements-explore").text;
    expect(explore).toMatch(/free cash flow/i);
    expect(explore).not.toMatch(/operating income|reinvestment|operating margin/i);
    expect(explore).toMatch(/profit on each sale/i);
  });

  it("draws the three pages as tiles on the Concept's Widget, none lit at the event and each lit in turn, with a warehouse (widget fit)", () => {
    const concept = statements.scenes.find((s) => s.id === "st-one-warehouse")!;
    const inputs = concept.inputs as { tiles?: { label: string }[]; steps: { light?: number; emoji?: string }[] };
    expect(inputs.tiles?.map((t) => t.label.toLowerCase())).toEqual(["cash flow statement", "balance sheet", "income statement"]);
    expect(inputs.steps[0].light).toBeUndefined();
    expect(inputs.steps[0].emoji).toBeTruthy();
    expect(inputs.steps.slice(1).map((s) => s.light)).toEqual([0, 1, 2]);
    const built = buildScene(statements, concept);
    expect(built.ok && built.code).toMatch(/StepThrough\(\[.*\], \[/s);
  });
});

// Code review 3 on #90 (M02, M07, M08, L02, L06): the fixes each finding asked for, held here so they stay fixed.
describe("the three financial statements, after code review 3 (#90)", () => {
  const dollars = (text: string) => (text.match(/\$\d[\d,.]*/g) ?? []).map((d) => d.replace(/[.,]$/, ""));
  const question = (id: string) => statements.questions.find((q) => q.id === id)!;
  const computedChanges = (q: unknown) => ((q as { computed?: { changes: { label: string; levers: Record<string, number> }[] } }).computed?.changes ?? []);
  const texts = () =>
    [
      statements.concept,
      statements.goDeeper ?? "",
      statements.cases[0].story,
      ...(statements.youllLearn ?? []),
      ...statements.skills.map((s) => s.rule),
      JSON.stringify(statements.terms),
      JSON.stringify(statements.scenes),
      JSON.stringify(statements.questions),
      JSON.stringify(statements.checks),
      statements.insight?.written ?? "",
    ].join("\n");

  it("never has Webvan buy a warehouse: it rented them all and paid cash for the machines inside (M02, 10-K 2000 Item 2)", () => {
    expect(texts()).not.toMatch(/pays cash for a warehouse|warehouse it will use|a warehouse bought|warehouses it has built/i);
    expect(statements.concept).toMatch(/machines and freezers in a warehouse it rents/);
    expect(question("st-q-warehouse").prompt).toMatch(/warehouse it rents/);
    expect(JSON.stringify(question("st-q-warehouse"))).toMatch(/owns no real estate/);
    const cashTry = cash.primers?.find((p) => p.id === "wc-primer-lasting")?.quickTry;
    expect(cashTry?.ask).toMatch(/warehouse it rents/);
  });

  it("calls the reused waterfall a what-if, in its title, on screen and in the Insight's question (M07)", () => {
    expect(statements.explore!.workbench!.title).toBe("What if Webvan's sales doubled at a profit on each sale?");
    const found = cashWaterfallData(statements.explore?.workbench?.inputs);
    if ("problem" in found) throw new Error(found.problem);
    expect(found.data.whatIf).toMatch(/really lost money on most/);
    expect(statements.insight!.question).toMatch(/^Suppose\b/);
    expect(statements.insight!.question).toMatch(/really lost money on most/);
  });

  it("names, in each computed change, the statement that really shows it, and repeats none of the cash Topic's (M08)", () => {
    const lever = question("st-q-which-lever");
    const labels = computedChanges(lever).map((c) => c.label);
    expect(labels.filter((l) => /income statement/.test(l))).toHaveLength(1);
    expect(labels.filter((l) => /balance sheet/.test(l))).toHaveLength(1);
    expect(labels.filter((l) => /cash flow statement/.test(l))).toHaveLength(1);
    expect(labels.find((l) => /income statement/.test(l))).toMatch(/sales/);
    expect(labels.find((l) => /cash flow statement/.test(l))).toMatch(/invested/);
    expect(lever.explanation).toMatch(/Sales are on the income statement/);
    expect(lever.explanation).toMatch(/cash flow statement and then sits on the balance sheet/);
    expect(lever.prompt).not.toMatch(/different statement/);
    const predict = question("st-q-predict");
    expect(predict.prompt).toMatch(/income statement/);
    expect(predict.prompt).not.toMatch(/cash flow statement showed/);
    const theirs = cash.questions.flatMap((q) => computedChanges(q).map((c) => JSON.stringify(c.levers)));
    for (const q of [lever, predict]) {
      expect(q.skill).toBe("st-three-pages");
      for (const c of computedChanges(q)) expect(theirs, c.label).not.toContain(JSON.stringify(c.levers));
    }
  });

  it("says the $210 million is cash and investments, and gives the closing cash its own figure (L02, 10-K: $40.3m cash, $171.6m securities)", () => {
    const all = texts();
    const seen = [...all.matchAll(/\$21[02] million/g)].map((m) => all.slice(Math.max(0, m.index - 80), m.index + 60));
    expect(seen.length).toBeGreaterThan(2);
    for (const around of seen) expect(around, around).toMatch(/investments/);
    expect(statements.goDeeper).toMatch(/\$40\.3 million/);
    expect(draftOf("statements-story").text).toMatch(/\$210 million left in cash and investments/);
  });

  it("gives the real Tutor the beginner persona's fixes, not only the scripted one: two round figures in the story, a first hint with no operating income (L06)", () => {
    const story = statements.cases[0].story;
    expect(dollars(story).length, dollars(story).join(", ")).toBeLessThanOrEqual(2);
    for (const d of dollars(story)) expect(d).not.toMatch(/\.\d/);
    expect(statements.insight!.hints[0]).not.toMatch(/operating income|reinvestment/i);
    expect(statements.insight!.hints[0]).toMatch(/free cash flow, the cash left after paying to grow/);
  });
});
