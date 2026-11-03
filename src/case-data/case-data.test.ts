import { beforeEach, describe, expect, it } from "vitest";
import { parseCourseMap } from "@/course/map";
import type { Progress } from "@/course/navigator";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";
import { saveCheckResult, saveFinishedStep } from "@/learner/memory";
import { caseDataResponse, loadCaseData } from "./case-data";
import { importCaseData, type CaseDatasetInput } from "./import";

const map = parseCourseMap([
  {
    name: "pv.yaml",
    text: `
id: pv
title: PV
stage: foundation
path: 1
cases:
  - { id: jackpot, title: A jackpot, asOf: 2018-10-24, story: Then., reveal: Later. }
concept: Idea.
principle: Lesson.
checks:
  - { id: pv-check, kind: conversation, prompt: Explain., passCriteria: Explains. }
`,
  },
]).map!;

const progress = (revealShown: boolean): Progress =>
  ({ currentTopicId: null, topics: { pv: { step: revealShown ? "reveal" : "story", passedChecks: [], revealShown, status: "in_progress" } } }) as Progress;

const dataset = (id: string, points: [string, number][], extra: Partial<CaseDatasetInput> = {}): CaseDatasetInput => ({
  caseId: "jackpot",
  id,
  label: `Label ${id}`,
  unit: "USD",
  source: "A source",
  sourceUrl: "https://example.org/source",
  checkedOn: "2026-11-02",
  checkNote: "Compared with the source.",
  points: points.map(([date, value]) => ({ date, value })),
  ...extra,
});

describe("Case Data under the as-of rule", () => {
  let db: Db;
  beforeEach(async () => {
    db = await testDb();
    await importCaseData(db, [
      dataset("cash-option", [["2018-10-23", 877_800_000]]),
      dataset("yield", [
        ["2018-10-23", 3.37],
        ["2018-10-24", 3.33],
        ["2018-10-25", 3.35],
        ["2019-03-04", 3.05],
      ], { unit: "percent" }),
      dataset("winner-choice", [["2019-03-04", 877_784_124]]),
    ]);
  });

  it("before the reveal, a request returns nothing dated after the as-of date, and no dataset that is all hindsight", async () => {
    const data = (await loadCaseData(db, map, progress(false), "jackpot"))!;
    expect(data.revealed).toBe(false);
    expect(data.asOf).toBe("2018-10-24");
    expect(data.datasets.map((d) => d.id)).toEqual(["cash-option", "yield"]);
    const dates = data.datasets.flatMap((d) => d.points.map((p) => p.date));
    expect(dates.every((d) => d <= "2018-10-24")).toBe(true);
    expect(data.datasets[1].points).toEqual([
      { date: "2018-10-23", value: 3.37 },
      { date: "2018-10-24", value: 3.33 },
    ]);
  });

  it("a Learner with no progress yet is before the reveal", async () => {
    const data = (await loadCaseData(db, map, { currentTopicId: null, topics: {} } as unknown as Progress, "jackpot"))!;
    expect(data.datasets.flatMap((d) => d.points).every((p) => p.date <= "2018-10-24")).toBe(true);
  });

  it("after the reveal has been shown, returns every dataset in full, each with its source", async () => {
    const data = (await loadCaseData(db, map, progress(true), "jackpot"))!;
    expect(data.revealed).toBe(true);
    expect(data.datasets.map((d) => [d.id, d.points.length])).toEqual([
      ["cash-option", 1],
      ["winner-choice", 1],
      ["yield", 4],
    ]);
    expect(data.datasets[1]).toMatchObject({ source: "A source", sourceUrl: "https://example.org/source", unit: "USD" });
  });

  it("returns undefined for a Case that is not on the Course Map", async () => {
    expect(await loadCaseData(db, map, progress(true), "nope")).toBeUndefined();
  });

  it("re-importing a dataset replaces its points instead of adding to them", async () => {
    await importCaseData(db, [dataset("cash-option", [["2018-10-22", 878_000_000]], { source: "Corrected source" })]);
    const data = (await loadCaseData(db, map, progress(true), "jackpot"))!;
    expect(data.datasets.find((d) => d.id === "cash-option")).toMatchObject({
      source: "Corrected source",
      points: [{ date: "2018-10-22", value: 878_000_000 }],
    });
  });

  it("refuses a dataset without a source URL or with a repeated date", async () => {
    await expect(importCaseData(db, [dataset("bad", [["2018-10-23", 1]], { sourceUrl: "" })])).rejects.toThrow();
    await expect(importCaseData(db, [dataset("bad", [["2018-10-23", 1], ["2018-10-23", 2]])])).rejects.toThrow(/repeated/);
  });
});

describe("the Case Data route", () => {
  it("before the reveal returns nothing dated after the as-of date, and everything once the reveal is shown", async () => {
    const db = await testDb();
    await importCaseData(db, [dataset("yield", [["2018-10-23", 3.37], ["2018-11-01", 3.4]], { unit: "percent" }), dataset("winner-choice", [["2019-03-04", 877_784_124]])]);
    const before = await caseDataResponse(db, map, "jackpot");
    expect(before.status).toBe(200);
    expect(before.headers.get("Cache-Control")).toBe("no-store");
    const body = await before.json();
    expect(body.revealed).toBe(false);
    expect(body.datasets.flatMap((d: { points: { date: string }[] }) => d.points.map((p) => p.date))).toEqual(["2018-10-23"]);

    // Walk the Learner to the reveal through Learner Memory, as the Tutor's tools do.
    const now = new Date("2026-11-02T10:00:00Z");
    await saveFinishedStep(db, map, "story", now);
    await saveFinishedStep(db, map, "concept", now);
    await saveFinishedStep(db, map, "your_turn", now);
    await saveCheckResult(db, map, { checkId: "pv-check", passed: true }, now);
    const after = await (await caseDataResponse(db, map, "jackpot")).json();
    expect(after.revealed).toBe(true);
    expect(after.datasets.map((d: { id: string }) => d.id)).toEqual(["winner-choice", "yield"]);
  });

  it("answers 404 for an unknown Case", async () => {
    expect((await caseDataResponse(await testDb(), map, "nope")).status).toBe(404);
  });
});
