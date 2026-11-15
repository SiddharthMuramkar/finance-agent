import { describe, expect, it } from "vitest";
import { bestWeights, parseShardLog, shardTimes } from "../../scripts/ui-shard-weights.mjs";

describe("parseShardLog: test times from a ui shard's log", () => {
  it("reads project, file, line and time from the list reporter's lines, as `gh run view --log` prints them", () => {
    const log = [
      "ui shard 4/6\tUNKNOWN STEP\t2026-11-15T07:09:48.4654494Z Running 333 tests using 1 worker, shard 4 of 6",
      "ui shard 4/6\tUNKNOWN STEP\t2026-11-15T07:11:59.1405465Z   ✓  136 [w1920] › e2e/skip-ahead.spec.ts:18:1 › I know this: quiz me (5.2s)",
      "ui shard 4/6\tUNKNOWN STEP\t2026-11-15T07:12:02.4727728Z   -  138 [w1920] › e2e/spine-01.spec.ts:115:1 › [Part C] Spine Topic 1 is played whole",
      "ui shard 4/6\tUNKNOWN STEP\t2026-11-15T07:12:03.0000000Z   ✘  139 [mbp14] › e2e/header.spec.ts:7:3 › the header (A1b, GLOSSARY Story scene) (1.1m)",
      "ui shard 4/6\tUNKNOWN STEP\t2026-11-15T07:12:04.0000000Z   \u001b[32m✓\u001b[39m  140 [p390] › e2e/home.spec.ts:30:1 › Home (850ms)",
      "ui shard 4/6\tUNKNOWN STEP\t2026-11-15T07:13:41.0697819Z   86 passed (4.5m)",
    ].join("\n");
    expect(parseShardLog(log)).toEqual([
      { project: "w1920", file: "e2e/skip-ahead.spec.ts", line: 18, seconds: 5.2 },
      { project: "w1920", file: "e2e/spine-01.spec.ts", line: 115, seconds: 0 },
      { project: "mbp14", file: "e2e/header.spec.ts", line: 7, seconds: 66 },
      { project: "p390", file: "e2e/home.spec.ts", line: 30, seconds: 0.85 },
    ]);
  });
});

describe("shardTimes: the split Playwright makes", () => {
  it("gives each shard its weight's share of the tests, counted in run order", () => {
    const groups = [1, 2, 3, 4].map((seconds) => ({ count: 2, seconds }));
    expect(shardTimes(groups, [1, 1])).toEqual([3, 7]);
  });

  it("sends a file whole to the shard where it starts, however many tests it has", () => {
    const groups = [
      { count: 1, seconds: 1 },
      { count: 4, seconds: 10 },
      { count: 1, seconds: 1 },
    ];
    expect(shardTimes(groups, [1, 1])).toEqual([11, 1]);
  });

  it("puts a file whose tests are all skipped up front with the file before it", () => {
    const groups = [
      { count: 2, seconds: 1 },
      { count: 0, seconds: 5 },
      { count: 2, seconds: 1 },
    ];
    expect(shardTimes(groups, [1, 1])).toEqual([6, 1]);
  });
});

describe("bestWeights", () => {
  it("gives a slow file a shard of its own", () => {
    const groups = [
      { count: 10, seconds: 100 },
      { count: 10, seconds: 10 },
      { count: 10, seconds: 10 },
    ];
    const weights = bestWeights(groups, 2);
    expect(weights).toEqual([10, 20]);
    expect(shardTimes(groups, weights)).toEqual([100, 20]);
  });

  it("splits files of equal time evenly", () => {
    const groups = Array.from({ length: 6 }, () => ({ count: 1, seconds: 5 }));
    expect(bestWeights(groups, 3)).toEqual([2, 2, 2]);
  });
});
