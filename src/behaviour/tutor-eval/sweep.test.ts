import { describe, expect, it } from "vitest";
import { loadCourseMap } from "@/course/map";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { Budget } from "./budget";
import { CASES_DIR, loadCases, type EvalCase } from "./case";
import type { EvalReport } from "./report";
import type { SuiteDeps } from "./run-suite";
import { chooseSetting, DEFAULT_PAIRS, parsePairs, renderSweep, runSweep, summarisePair, sweepFiles } from "./sweep";

const map = loadCourseMap();
const all = loadCases(CASES_DIR).cases;
const pick = (...ids: string[]) => ids.map((id) => all.find((c) => c.id === id)!) as EvalCase[];

const T1_REPLY =
  "Sure. This one shows a rate moving from 2% to 3%. The three numbers under the line each answer a different question.\nWhich of the three numbers is the move in basis points?";
const yesTo = (n: number) => JSON.stringify({ answers: Array.from({ length: n }, (_, i) => ({ n: i + 1, answer: "yes", why: "ok" })) });

/** Suite dependencies on a scripted model; `reply` says what the Tutor writes for this pair. */
function suiteDeps(pair: { model: string; effort: string }, budget: Budget, reply: string, graderCost: number): SuiteDeps {
  return {
    map,
    settings: { model: pair.model, effort: pair.effort, widgetEngine: "off" },
    graderModel: "claude-opus-5-5",
    fingerprint: "test",
    budget,
    newDb: testDb,
    tutorClient: () =>
      scriptedClient([
        { content: [{ type: "tool_use", id: `toolu_${Math.random().toString(36).slice(2)}`, name: "open_widget", input: { id: "rate-change-three-ways" } }] },
        { content: [{ type: "text", text: reply }] },
      ]).client,
    grade: async (_s, prompt) => ({ text: yesTo((prompt.match(/^\d+\. /gm) ?? []).length), costUsd: graderCost }),
    courseCheck: async () => ({ passed: true, output: "" }),
    concurrency: 1,
  };
}

describe("parsePairs", () => {
  it("reads model:effort pairs, trimming spaces and dropping repeats", () => {
    expect(parsePairs(" claude-opus-5-5:low, claude-sonnet-5-5:medium ,claude-opus-5-5:low")).toEqual([
      { model: "claude-opus-5-5", effort: "low" },
      { model: "claude-sonnet-5-5", effort: "medium" },
    ]);
  });
  it("defaults to the ticket's three settings", () => {
    expect(parsePairs(undefined).map((p) => `${p.model}:${p.effort}`)).toEqual(DEFAULT_PAIRS.split(","));
    expect(parsePairs("  ").length).toBe(3);
  });
  it("refuses a pair with no effort, an unknown effort or a model with no price", () => {
    expect(() => parsePairs("claude-opus-5-5")).toThrow(/model:effort/);
    expect(() => parsePairs("claude-opus-5-5:huge")).toThrow(/effort/);
    expect(() => parsePairs("claude-nope-1:low")).toThrow(/no price/);
  });
});

describe("a sweep", () => {
  it("runs the suite once per pair on its own budget and reports a pass rate and a cost per pair", async () => {
    const seen: string[] = [];
    const report = await runSweep(pick("T1"), parsePairs("claude-opus-5-5:low,claude-sonnet-5-5:medium"), {
      capUsd: 5,
      suiteDeps: (pair, budget) => {
        seen.push(`${pair.model}:${pair.effort}`);
        return suiteDeps(pair, budget, T1_REPLY, pair.model.includes("sonnet") ? 0.02 : 0.08);
      },
    });
    expect(seen).toEqual(["claude-opus-5-5:low", "claude-sonnet-5-5:medium"]);
    const [opus, sonnet] = report.pairs.map(summarisePair);
    expect(opus).toMatchObject({ runsPassed: 3, runsTotal: 3, passed: true, turns: 3 });
    expect(opus.spentUsd).toBeCloseTo(0.24);
    expect(opus.costPerTurn).toBeCloseTo(0.08);
    expect(sonnet.costPerTurn).toBeCloseTo(0.02);
    // The cheapest pair that passes everything is the choice.
    expect(chooseSetting(report.pairs.map(summarisePair))?.model).toBe("claude-sonnet-5-5");
    const text = renderSweep(report);
    expect(text).toMatch(/claude-sonnet-5-5.*medium.*3 of 3/);
    expect(text).toMatch(/Chosen setting: claude-sonnet-5-5, effort medium/);
  });

  it("stops a pair at its own cap and does not let it win, and says so", async () => {
    const report = await runSweep(pick("T1"), parsePairs("claude-opus-5-5:low,claude-sonnet-5-5:medium"), {
      capUsd: 0.5,
      suiteDeps: (pair, budget) => suiteDeps(pair, budget, T1_REPLY, pair.model.includes("opus") ? 0.3 : 0.01),
    });
    const [opus, sonnet] = report.pairs.map(summarisePair);
    expect(opus.passed).toBe(false);
    expect(opus.budgetStop).toMatch(/cap/);
    expect(opus.spentUsd).toBeLessThanOrEqual(0.5);
    expect(sonnet.passed).toBe(true);
    expect(renderSweep(report)).toMatch(/Stopped: spent/);
  });

  it("names no setting when nothing passes everything, and puts every failure in full", async () => {
    const report = await runSweep(pick("T1"), parsePairs("claude-opus-5-5:low"), {
      capUsd: 5,
      suiteDeps: (pair, budget) => suiteDeps(pair, budget, "## Heading\nBad reply with no ask.", 0.01),
    });
    const [s] = report.pairs.map(summarisePair);
    expect(s.passed).toBe(false);
    expect(s.runsPassed).toBe(0);
    expect(chooseSetting([s])).toBeNull();
    const text = renderSweep(report);
    expect(text).toMatch(/No setting passed everything/);
    expect(text).toMatch(/### T1, run 1/);
  });

  it("keeps going when one pair throws, and records why", async () => {
    const report = await runSweep(pick("T1"), parsePairs("claude-opus-5-5:low,claude-sonnet-5-5:medium"), {
      capUsd: 5,
      suiteDeps: (pair, budget) => {
        if (pair.model.includes("opus")) throw new Error("no key");
        return suiteDeps(pair, budget, T1_REPLY, 0.01);
      },
    });
    const [a, b] = report.pairs.map(summarisePair);
    expect(a).toMatchObject({ passed: false, error: "no key" });
    expect(b.passed).toBe(true);
  });

  it("treats pending cases as neither passed nor failed, and lists them", () => {
    const base: EvalReport = {
      startedAt: "2026-11-04T10:00:00.000Z",
      finishedAt: "2026-11-04T10:05:00.000Z",
      tutor: { model: "claude-opus-5-5", effort: "low", widgetEngine: "off" },
      graderModel: "claude-opus-5-5",
      fingerprint: "x",
      capUsd: 5,
      spentUsd: 0.3,
      budgetStop: null,
      cases: [
        { id: "T1", title: "a", kind: "live", status: "pass", runs: [1, 2, 3].map((run) => ({ run, status: "pass" as const, reasons: [], costUsd: 0.1 })) },
        { id: "T3", title: "b", kind: "live", status: "pending", pending: "later", runs: [] },
      ],
    };
    const s = summarisePair({ pair: { model: "claude-opus-5-5", effort: "low" }, report: base });
    expect(s).toMatchObject({ passed: true, runsPassed: 3, runsTotal: 3, pending: ["T3"] });
  });

  it("writes a dated report and a latest copy, in Markdown and JSON", async () => {
    const report = await runSweep(pick("T1"), parsePairs("claude-sonnet-5-5:medium"), { capUsd: 5, suiteDeps: (p, b) => suiteDeps(p, b, T1_REPLY, 0.01) });
    expect(Object.keys(sweepFiles(report)).sort()).toEqual(["sweep-latest.json", "sweep-latest.md", expect.stringMatching(/^sweep-.*\.json$/), expect.stringMatching(/^sweep-.*\.md$/)].sort());
  });
});
