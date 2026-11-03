import { beforeEach, describe, expect, it } from "vitest";
import { importCaseData, type CaseDatasetInput } from "@/case-data/import";
import { loadCourseMap } from "@/course/map";
import { learners, topicProgress } from "@/db/schema";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";
import { loadHomeWidget, signedOutCases } from "./home-widget-data";

// Home's Widget's Case Data, read on the server under the signed-out as-of rule (spec #119, "Widgets › Home's copy").

const map = loadCourseMap();

const dataset = (id: string, unit: string, points: [string, number][]): CaseDatasetInput => ({
  caseId: "mega-millions-2018",
  id,
  label: `Label ${id}`,
  unit,
  source: "A source",
  sourceUrl: "https://example.org/source",
  checkedOn: "2026-11-02",
  checkNote: "Compared with the source.",
  points: points.map(([date, value]) => ({ date, value })),
});

describe("Home's Widget's Case Data", () => {
  let db: Db;
  beforeEach(async () => {
    db = await testDb();
    await importCaseData(db, [
      dataset("cash-option", "USD", [["2018-10-23", 877_800_000]]),
      dataset("treasury-30-year", "percent", [
        ["2018-10-24", 3.33],
        ["2018-10-25", 3.38],
      ]),
      dataset("winner-choice", "USD", [["2019-03-04", 877_784_124]]),
    ]);
  });

  it("is the Present value Case's data with nothing after its as-of date, even when a Learner has seen the reveal", async () => {
    const [learner] = await db.select().from(learners);
    await db.insert(topicProgress).values({ learnerId: learner.id, topicId: "present-value", step: "principle", revealShown: true, status: "in_progress" });
    const widget = await loadHomeWidget(map, (m) => signedOutCases(db, m));
    expect(widget?.code).toMatch(/^root = Widget\("What the annuity is worth today"/);
    expect(widget?.cases).toHaveLength(1);
    const [data] = widget!.cases;
    expect(data).toMatchObject({ caseId: "mega-millions-2018", asOf: "2018-10-24", revealed: false });
    expect(data.datasets.map((d) => d.id)).toEqual(["cash-option", "treasury-30-year"]);
    expect(data.datasets.flatMap((d) => d.points.map((p) => p.date))).toEqual(["2018-10-23", "2018-10-24"]);
  });

  it("is no Widget when the Topic file has none", async () => {
    const without = { ...map, topic: () => undefined } as typeof map;
    expect(await loadHomeWidget(without, (m) => signedOutCases(db, m))).toBeNull();
  });
});
