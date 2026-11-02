import { describe, expect, it } from "vitest";
import { caseData } from "./case-data";
import { loadCourseMap, parseCourseMap } from "./map";
import type { Progress } from "./navigator";

const file = {
  name: "pv.yaml",
  text: `
id: pv
title: PV
stage: foundation
path: 1
cases:
  - id: jackpot
    title: A jackpot
    asOf: 2018-10-24
    story: Then.
    reveal: Later.
    data:
      - { id: cash-option, label: Cash option, date: 2018-10-23, value: 877800000, unit: USD, source: "CNBC, 24 Oct 2018" }
      - { id: claimed, label: Prize claimed, date: 2019-03-08, value: 877800000, unit: USD, source: "Later report" }
concept: Idea.
principle: Lesson.
checks:
  - { id: pv-check, kind: conversation, prompt: Explain., passCriteria: Explains. }
`,
};
const map = parseCourseMap([file]).map!;
const progress = (revealShown: boolean): Progress =>
  ({ currentTopicId: null, topics: { pv: { step: revealShown ? "reveal" : "story", passedChecks: [], revealShown, status: "in_progress" } } }) as Progress;

describe("Case Data and the hindsight rule", () => {
  it("before the reveal, returns nothing dated after the Case's as-of date", () => {
    expect(caseData(map, progress(false), "jackpot")?.map((d) => d.id)).toEqual(["cash-option"]);
    expect(caseData(map, { currentTopicId: null, topics: {} } as unknown as Progress, "jackpot")?.map((d) => d.id)).toEqual(["cash-option"]);
  });

  it("after the reveal has been shown, returns every figure", () => {
    expect(caseData(map, progress(true), "jackpot")?.map((d) => d.id)).toEqual(["cash-option", "claimed"]);
  });

  it("returns undefined for an unknown Case", () => {
    expect(caseData(map, progress(false), "nope")).toBeUndefined();
  });

  it("the present value Case carries its sourced headline figures", () => {
    const figures = caseData(loadCourseMap(), progress(false), "mega-millions-2018")!;
    expect(figures.map((d) => [d.id, d.value])).toEqual([
      ["advertised-annuity", 1_537_000_000],
      ["cash-option", 877_800_000],
    ]);
  });
});
