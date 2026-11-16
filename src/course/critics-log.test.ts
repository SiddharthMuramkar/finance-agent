import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CRITICS_LOG_PATH, criticsLogErrors } from "./critics-log";
import { loadCourseMap } from "./map";

// Spec 2026-11-12 C8: a Spine Topic ships only when the course check and the critics pass. The course check holds the
// critics' record: every written Spine Topic read by the four critics C8 names, with no confirmed finding left open.

const topics = [
  { id: "s1", stage: "spine" as const },
  { id: "e1", stage: "foundation" as const },
];
const entry = (over = "") => `    lenses: [beginner-persona, math-police, historian, widget-fit]\n    rounds: 2\n    lastRound: "abc1234"\n    open: 0\n${over}`;
const log = (body: string) => `topics:\n${body}`;

describe("the critics' record for the Spine (C8)", () => {
  it("passes a Spine Topic read by all four critics with nothing left open", () => {
    expect(criticsLogErrors(topics, log(`  s1:\n${entry()}`))).toEqual([]);
  });

  it("fails a written Spine Topic with no record, or no log at all", () => {
    expect(criticsLogErrors(topics, "topics: {}\n")).toEqual([`Spine Topic "s1" has no critics' record in ${CRITICS_LOG_PATH}: run the four critics and log the round (spec C8)`]);
    expect(criticsLogErrors(topics, null)).toEqual([`${CRITICS_LOG_PATH} is missing: every written Spine Topic needs its critics' record (spec C8)`]);
  });

  it("fails a record that misses a critic, or still has confirmed findings open", () => {
    const noHistorian = log(`  s1:\n${entry().replace("historian, ", "")}`);
    expect(criticsLogErrors(topics, noHistorian)).toEqual(['Spine Topic "s1" has not been read by historian (spec C8)']);
    const open = log(`  s1:\n${entry().replace("open: 0", "open: 2")}`);
    expect(criticsLogErrors(topics, open)).toEqual(['Spine Topic "s1" has 2 confirmed critic finding(s) open: fix them before it ships (spec C8)']);
  });

  it("fails a record with no rounds or no commit, and an entry for a Topic that is not a written Spine Topic", () => {
    const bad = log(`  s1:\n${entry().replace("rounds: 2", "rounds: 0").replace('lastRound: "abc1234"', "lastRound: 7756465")}  e1:\n${entry()}`);
    expect(criticsLogErrors(topics, bad)).toEqual([
      'Spine Topic "s1": rounds must be a whole number of critic rounds, at least 1',
      `Spine Topic "s1": lastRound must name the commit that fixed the last round's findings`,
      `${CRITICS_LOG_PATH} logs "e1", which is not a written Spine Topic`,
    ]);
  });

  it("asks nothing of a course with no Spine Topic written", () => {
    expect(criticsLogErrors([{ id: "e1", stage: "foundation" }], null)).toEqual([]);
  });

  it("holds for the real course: all sixteen Spine Topics have a passing record", () => {
    const map = loadCourseMap();
    expect(map.topics.filter((t) => t.stage === "spine")).toHaveLength(16);
    expect(criticsLogErrors(map.topics, readFileSync(CRITICS_LOG_PATH, "utf8"))).toEqual([]);
  });
});
