import { describe, expect, it } from "vitest";
import type { CaseDataset } from "@/case-data/case-data";
import { TUTOR_INSTRUCTIONS } from "./instructions";
import { quotedDatasets } from "./sources";

const yields: CaseDataset = {
  id: "long-yield",
  label: "30-year yield",
  unit: "percent",
  source: "US Treasury",
  sourceUrl: "https://example.org/y",
  checkedOn: "2026-11-02",
  points: [
    { date: "2018-10-23", value: 3.37 },
    { date: "2018-10-24", value: 3.33 },
  ],
};

describe("which Case Data figures a reply quotes", () => {
  it("finds a figure written out whole, with or without its unit", () => {
    expect(quotedDatasets("It closed at 3.33% that day.", [yields])).toEqual([yields]);
    expect(quotedDatasets("It closed at 3.37.", [yields])).toEqual([yields]);
  });

  it("ignores part of a longer number, citation links and widget code", () => {
    expect(quotedDatasets("About 13.337 billion.", [yields])).toEqual([]);
    expect(quotedDatasets("A claim[3](/passages/3.33?blocks=1-2).", [yields])).toEqual([]);
    expect(quotedDatasets('Try it.\n\n```openui-lang\nroot = Widget("3.33", [])\n```', [yields])).toEqual([]);
  });

  it("finds nothing when no figure is quoted or no Case Data is allowed", () => {
    expect(quotedDatasets("Yields were low.", [yields])).toEqual([]);
    expect(quotedDatasets("It closed at 3.33%.", [])).toEqual([]);
  });
});

describe("the Tutor's instructions on naming sources", () => {
  it("say not to name sources in sentences, but to name the writer when the writer is the subject and to answer a direct question", () => {
    expect(TUTOR_INSTRUCTIONS).toContain("do not name sources in your sentences");
    expect(TUTOR_INSTRUCTIONS).toContain("when the writer is the subject");
    expect(TUTOR_INSTRUCTIONS).toContain("when the Learner asks where a figure or idea comes from");
  });
});
