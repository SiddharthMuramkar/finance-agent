import { beforeEach, describe, expect, it } from "vitest";
import { parseCourseMap } from "@/course/map";
import { navigate, type Progress } from "@/course/navigator";
import { OWNER_LEARNER_ID } from "@/db/schema";
import type { Db } from "@/db/types";
import { stepContext } from "@/tutor/context";
import { testDb } from "@/test/pglite";
import { caseDataResponse, loadCaseData } from "./case-data";
import { importCaseData, type CaseDatasetInput } from "./import";
import { REFERENCE_CASE, REFERENCE_DATASET_IDS } from "./reference";

const topicText = (caseId: string, extra = "") => `
id: pv
title: PV
stage: foundation
path: 1
cases:
  - { id: ${caseId}, title: A crash, asOf: 1992-04-01, story: Then., reveal: Later. }
concept: Idea.
principle: Lesson.
${extra}
checks:
  - { id: pv-check, kind: conversation, prompt: Explain., passCriteria: Explains. }
`;
const map = parseCourseMap([{ name: "pv.yaml", text: topicText("crash") }]).map!;

const progress = (currentTopicId: string | null, revealShown = false): Progress =>
  ({ currentTopicId, topics: currentTopicId ? { pv: { step: "story", passedChecks: [], revealShown, status: "in_progress" } } : {} }) as Progress;

const series = (id: string, points: [string, number][]): CaseDatasetInput => ({
  caseId: REFERENCE_CASE,
  id,
  label: `Label ${id}`,
  unit: "INR",
  source: "A source",
  sourceUrl: "https://example.org/source",
  checkedOn: "2026-11-04",
  checkNote: "Compared with the source.",
  points: points.map(([date, value]) => ({ date, value })),
});

describe("reference data", () => {
  let db: Db;
  beforeEach(async () => {
    db = await testDb();
    await importCaseData(db, [
      series("usd-inr", [["1991-01-01", 18], ["1992-03-01", 30], ["2020-01-01", 71], ["2026-10-01", 88]]),
      series("ust-10y", [["2020-01-01", 1.8]]),
    ]);
  });

  it("the import accepts the reserved Case", async () => {
    const data = (await loadCaseData(db, map, progress(null), REFERENCE_CASE))!;
    expect(data.datasets.map((d) => d.id)).toEqual(["usd-inr", "ust-10y"]);
  });

  it("with no unrevealed Case in play, serves every point, revealed, with asOf the latest point", async () => {
    const data = (await loadCaseData(db, map, progress(null), REFERENCE_CASE))!;
    expect(data).toMatchObject({ caseId: "reference", revealed: true, asOf: "2026-10-01" });
    expect(data.datasets.find((d) => d.id === "usd-inr")!.points).toHaveLength(4);
  });

  it("clips to the as-of date of the current Topic's unrevealed Case, and drops a series that is all hindsight", async () => {
    const data = (await loadCaseData(db, map, progress("pv"), REFERENCE_CASE))!;
    expect(data.revealed).toBe(true);
    expect(data.asOf).toBe("1992-03-01");
    expect(data.datasets.map((d) => d.id)).toEqual(["usd-inr"]);
    expect(data.datasets[0].points.map((p) => p.date)).toEqual(["1991-01-01", "1992-03-01"]);
  });

  it("serves everything again once the reveal has been shown", async () => {
    const data = (await loadCaseData(db, map, progress("pv", true), REFERENCE_CASE))!;
    expect(data.datasets.find((d) => d.id === "usd-inr")!.points).toHaveLength(4);
  });

  it("the case-data route serves it", async () => {
    const response = await caseDataResponse(db, map, REFERENCE_CASE, OWNER_LEARNER_ID);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.datasets.map((d: { id: string }) => d.id)).toContain("usd-inr");
  });

  it("the step context lists the reference datasets with their latest date", async () => {
    const reference = (await loadCaseData(db, map, progress(null), REFERENCE_CASE))!;
    const place = navigate(map, progress("pv"));
    const context = stepContext(place, [reference]);
    expect(context).toContain('"reference/usd-inr": Label usd-inr (INR), latest 2026-10-01.');
    expect(stepContext(place, [])).not.toContain("reference/");
  });
});

describe("the Course Map and the reserved Case", () => {
  it("rejects a Topic Case named reference", () => {
    const { errors } = parseCourseMap([{ name: "pv.yaml", text: topicText("reference") }]);
    expect(errors.join("\n")).toMatch(/reserved for reference data/);
  });

  const widget = (ref: string) => `widgets:
  - id: fx
    code: |
      root = Widget("FX", [d])
      d = Query("case_data", {dataset: "${ref}"}, {rows: []})`;

  it("allows a written-ahead Widget to read a reference dataset that exists", () => {
    const { errors } = parseCourseMap([{ name: "pv.yaml", text: topicText("crash", widget(`reference/${REFERENCE_DATASET_IDS[2]}`)) }]);
    expect(errors).toEqual([]);
  });

  it("rejects a reference dataset that does not exist", () => {
    const { errors } = parseCourseMap([{ name: "pv.yaml", text: topicText("crash", widget("reference/nope")) }]);
    expect(errors.join("\n")).toMatch(/no reference dataset "nope"/);
  });
});

describe("importing reference datasets", () => {
  it("rejects an unknown reference dataset id, naming the allowed ids", async () => {
    const db = await testDb();
    await expect(importCaseData(db, [series("not-a-real-id", [["2020-01-01", 1]])])).rejects.toThrow(/not-a-real-id.*usd-inr/s);
  });

  it("accepts a listed reference dataset", async () => {
    const db = await testDb();
    await expect(importCaseData(db, [series("usd-inr", [["2020-01-01", 71]])])).resolves.toMatchObject({ datasets: 1 });
  });
});

describe("the reference clip across Topics", () => {
  const twoTopics = parseCourseMap([
    { name: "a.yaml", text: topicText("crash-a").replace("id: pv", "id: topic-a").replace("1992-04-01", "2012-01-01") },
    {
      name: "b.yaml",
      text: topicText("crash-b").replace("id: pv", "id: topic-b").replace("path: 1", "path: 2").replace("pv-check", "b-check").replace("1992-04-01", "2008-01-01"),
    },
  ]).map!;
  const prog = (a: boolean, b?: boolean): Progress =>
    ({
      currentTopicId: "topic-a",
      topics: {
        "topic-a": { step: "reveal", passedChecks: [], revealShown: a, status: "in_progress" },
        ...(b === undefined ? {} : { "topic-b": { step: "story", passedChecks: [], revealShown: b, status: "in_progress" } }),
      },
    }) as Progress;

  it("clips to another started, unrevealed Topic even when the current Topic is revealed", async () => {
    const db = await testDb();
    await importCaseData(db, [series("usd-inr", [["2007-01-01", 40], ["2008-01-01", 39], ["2010-01-01", 45], ["2020-01-01", 71]])]);
    const clipped = (await loadCaseData(db, twoTopics, prog(true, false), REFERENCE_CASE))!;
    const dates = clipped.datasets.flatMap((d) => d.points.map((p) => p.date));
    expect(dates.length).toBeGreaterThan(0);
    expect(dates.every((d) => d <= "2008-01-01")).toBe(true);
    expect(clipped.revealed).toBe(true);
    expect(clipped.clip).toBe("2008-01-01");
    const full = (await loadCaseData(db, twoTopics, prog(true, true), REFERENCE_CASE))!;
    expect(full.datasets[0].points).toHaveLength(4);
    expect(full.clip).toBeNull();
  });
});
