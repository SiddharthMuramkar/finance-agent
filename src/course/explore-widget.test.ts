import { beforeEach, describe, expect, it } from "vitest";
import { importCaseData, type CaseDatasetInput } from "@/case-data/import";
import { loadCaseData } from "@/case-data/case-data";
import type { Db } from "@/db/types";
import { presentValueOnly } from "@/test/present-value-map";
import { testDb } from "@/test/pglite";
import { widgetParts, widgetProblems } from "@/widgets/check";
import { exploreWidgetFor, exploreWidgetInSession } from "./explore-widget";
import { loadCourseMap, parseCourseMap } from "./map";
import { finishStep, recordCheckResult, type Progress } from "./navigator";

/** The Topic's own explore Widget: its code in the Topic file, and when code shows it. */

const map = presentValueOnly();
const topic = map.topic("present-value")!;
const code = topic.explore!.widget!;

function topicText(widgetLine: string, data = "[cash-option]") {
  return [
    "id: pv",
    "title: PV",
    "stage: foundation",
    "path: 1",
    "cases:",
    `  - { id: jackpot, title: A jackpot, asOf: 2018-10-24, data: ${data}, story: Then., reveal: After. }`,
    "concept: Idea.",
    "principle: Lesson.",
    "insight:",
    "  question: What do you notice?",
    "  written: Later payments shrink.",
    "  foundWhen: The Learner says later payments shrink.",
    "  hints: [Look at the far bars.]",
    "explore:",
    "  before: c1",
    "  widget: |",
    `    ${widgetLine}`,
    "checks:",
    "  - { id: c1, kind: conversation, prompt: Q, passCriteria: A }",
  ].join("\n");
}

describe("the explore Widget in a Topic file", () => {
  it("is present value's: an interest-rate slider and the annuity chart set against the sourced cash option", () => {
    expect(widgetProblems(code)).toEqual([]);
    expect(widgetParts(code).components).toEqual(["Slider", "AnnuityChart"]);
    expect(code).toContain('"mega-millions-2018/cash-option"');
  });

  it("reads only the cash option, nothing that leads to the reveal", () => {
    const refs = [...code.matchAll(/"([a-z0-9-]+\/[a-z0-9-]+)"/g)].map((m) => m[1]);
    expect(refs).toEqual(["mega-millions-2018/cash-option"]);
  });

  it("is checked by the course check: a reference to a Case or dataset the Topic lacks is rejected", () => {
    const ok = parseCourseMap([{ name: "pv.yaml", text: topicText('chart = AnnuityChart(1, 2, 3, 4, "jackpot/cash-option")') }]);
    expect(ok.errors).toEqual([]);
    const otherCase = parseCourseMap([{ name: "pv.yaml", text: topicText('chart = AnnuityChart(1, 2, 3, 4, "elsewhere/cash-option")') }]);
    expect(otherCase.errors.join("\n")).toMatch(/"elsewhere" is not one of the Topic's Cases/);
    const otherData = parseCourseMap([{ name: "pv.yaml", text: topicText('chart = AnnuityChart(1, 2, 3, 4, "jackpot/winner-choice")') }]);
    expect(otherData.errors.join("\n")).toMatch(/does not list dataset "winner-choice"/);
  });

  it("is optional: a Topic with an Insight can do without one", () => {
    const text = topicText("x").replace(/  widget: \|\n    x\n/, "");
    expect(text).not.toContain("widget:");
    expect(parseCourseMap([{ name: "pv.yaml", text }]).errors).toEqual([]);
    expect(loadCourseMap().topic("present-value")?.explore?.widget).toBe(code);
  });
});

const progressAt = (moves: (string | { pass: string })[], start: Progress = { currentTopicId: "present-value", topics: {} }) =>
  moves.reduce((p, m) => {
    const r = typeof m === "string" ? finishStep(map, p, m as never) : recordCheckResult(map, p, m.pass, true);
    if (!r.ok) throw new Error(r.reason);
    return r.progress;
  }, start);

const BEFORE_EXPLORE = ["story", "concept", "your_turn", { pass: "pv-quiz-discounting" }, "concept"] as const;
const withInsight = (p: Progress, insight: "found" | "told" = "found"): Progress => ({ ...p, topics: { ...p.topics, "present-value": { ...p.topics["present-value"], insight } } });

describe("when code shows the explore Widget", () => {
  it("not before the explore step begins", () => {
    expect(exploreWidgetFor(map, progressAt(["story"]))).toBeNull();
    expect(exploreWidgetFor(map, progressAt(["story", "concept"]))).toBeNull();
  });

  it("from the moment the explore step begins", () => {
    expect(exploreWidgetFor(map, progressAt([...BEFORE_EXPLORE]))).toEqual({ topicId: "present-value", code });
  });

  it("and keeps it through your turn and the Check, until the Topic is passed", () => {
    const explored = progressAt(["explore"], withInsight(progressAt([...BEFORE_EXPLORE])));
    expect(exploreWidgetFor(map, explored)?.code).toBe(code);
    const atCheck = progressAt(["your_turn"], explored);
    expect(exploreWidgetFor(map, atCheck)?.code).toBe(code);
    const passedCheck = progressAt([{ pass: "pv-jackpot-choice" }], atCheck);
    expect(exploreWidgetFor(map, passedCheck)?.code).toBe(code);
    const done = progressAt(["reveal", "principle"], passedCheck);
    expect(done.topics["present-value"].status).toBe("passed");
    expect(exploreWidgetFor(map, done)).toBeNull();
  });

  it("is the same on every visit: it depends on saved progress only", () => {
    const p = progressAt([...BEFORE_EXPLORE]);
    expect(exploreWidgetFor(map, p)).toEqual(exploreWidgetFor(map, structuredClone(p)));
  });

  it("is never shown for a Topic without one", () => {
    const bare = presentValueOnly({ withoutInsight: true });
    expect(exploreWidgetFor(bare, progressAt([...BEFORE_EXPLORE.slice(0, 2)], { currentTopicId: "present-value", topics: {} }))).toBeNull();
  });
});

describe("the explore Widget in an old Session", () => {
  const context = (step: string) => `Course Navigator: where the Learner is now.\nTopic: Present value (Foundation Stage).\nTeaching Step: ${step}.`;

  it("is the Topic's own when the Session stood at its explore step", () => {
    expect(exploreWidgetInSession(map, `${context("concept")}\n\n${context("explore")}`)).toEqual({ topicId: "present-value", code });
  });

  it("is absent from a Session that never reached explore", () => {
    expect(exploreWidgetInSession(map, `${context("story")}\n${context("concept")}`)).toBeNull();
  });
});

describe("what the explore Widget draws under the as-of rule", () => {
  let db: Db;
  const dataset = (id: string, points: [string, number][]): CaseDatasetInput => ({
    caseId: "mega-millions-2018",
    id,
    label: `Label ${id}`,
    unit: "USD",
    source: "A source",
    sourceUrl: "https://example.org/source",
    checkedOn: "2026-11-02",
    checkNote: "Compared with the source.",
    points: points.map(([date, value]) => ({ date, value })),
  });
  beforeEach(async () => {
    db = await testDb();
    await importCaseData(db, [
      dataset("cash-option", [["2018-10-23", 877_800_000]]),
      dataset("winner-cash-payment", [["2019-03-04", 877_784_124]]),
    ]);
  });

  it("is the sourced cash option and nothing dated after the as-of date", async () => {
    const data = await loadCaseData(db, map, progressAt([...BEFORE_EXPLORE]), "mega-millions-2018");
    expect(data!.revealed).toBe(false);
    expect(data!.datasets.map((d) => d.id)).toEqual(["cash-option"]);
    expect(data!.datasets.flatMap((d) => d.points).every((p) => p.date <= "2018-10-24")).toBe(true);
  });
});
