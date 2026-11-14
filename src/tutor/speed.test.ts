import { describe, expect, it } from "vitest";
import { replyChecks, sessions, turns, tutorIncidents } from "@/db/schema";
import type { Db } from "@/db/types";
import { testDb, testDbThrough } from "@/test/pglite";
import { overBudget, percentile, seconds, summariseSpeed, tutorSpeed } from "./speed";

const NOW = new Date("2026-11-12T06:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY);

describe("percentile (nearest rank)", () => {
  it("matches the textbook nearest-rank example: 15, 20, 35, 40, 50", () => {
    // Worked by hand: rank = ceil(p / 100 * 5), 1-based, in the sorted list.
    const v = [50, 15, 40, 20, 35];
    expect(percentile(v, 5)).toBe(15); // rank ceil(0.25) = 1
    expect(percentile(v, 30)).toBe(20); // rank ceil(1.5) = 2
    expect(percentile(v, 40)).toBe(20); // rank ceil(2) = 2
    expect(percentile(v, 50)).toBe(35); // rank ceil(2.5) = 3
    expect(percentile(v, 95)).toBe(50); // rank ceil(4.75) = 5
    expect(percentile(v, 100)).toBe(50);
  });

  it("takes one of the values, never an average of two", () => {
    expect(percentile([4, 1, 3, 2], 50)).toBe(2); // rank 2, not 2.5
    const oneToTwenty = Array.from({ length: 20 }, (_, i) => 20 - i);
    expect(percentile(oneToTwenty, 50)).toBe(10); // rank 10
    expect(percentile(oneToTwenty, 95)).toBe(19); // rank ceil(19) = 19
    expect(percentile(Array.from({ length: 21 }, (_, i) => i + 1), 95)).toBe(20); // rank ceil(19.95) = 20
    expect(percentile([7], 50)).toBe(7);
    expect(percentile([7], 95)).toBe(7);
  });

  it("is null with no values, refuses a p outside (0, 100], and leaves its input unsorted", () => {
    expect(percentile([], 50)).toBeNull();
    expect(() => percentile([1], 0)).toThrow(RangeError);
    expect(() => percentile([1], 101)).toThrow(RangeError);
    const v = [3, 1, 2];
    percentile(v, 50);
    expect(v).toEqual([3, 1, 2]);
  });
});

describe("seconds", () => {
  it("reads milliseconds as seconds with one decimal", () => {
    expect(seconds(2450)).toBe("2.5 s");
    expect(seconds(2449)).toBe("2.4 s");
    expect(seconds(1050)).toBe("1.1 s");
    expect(seconds(0)).toBe("0.0 s");
    expect(seconds(31400)).toBe("31.4 s");
  });
});

describe("summariseSpeed", () => {
  it("groups by Reply kind, ignores missing times, most turns first and the kind-less last", () => {
    const kinds = summariseSpeed([
      { replyKind: "feedback", firstEventMs: 300, firstWordMs: 900, totalMs: 4000 },
      { replyKind: null, firstWordMs: null, totalMs: 3000 },
      { replyKind: "answer_question", firstEventMs: 400, firstWordMs: 1200, totalMs: 5000 },
      { replyKind: "answer_question", firstEventMs: 700, firstWordMs: 3400, totalMs: 9000 },
      { replyKind: "answer_question", firstEventMs: 2000, firstWordMs: null, totalMs: 30000 },
      { replyKind: "answer_question", firstEventMs: 500, firstWordMs: 2100, totalMs: 7000 },
      { replyKind: "answer_question", firstEventMs: 600, firstWordMs: 8000, totalMs: 6000 },
    ]);
    expect(kinds.map((k) => k.kind)).toEqual(["answer_question", "feedback", null]);
    // First words 1200, 2100, 3400, 8000: median rank 2, 95th rank ceil(3.8) = 4.
    // Totals 5000, 6000, 7000, 9000, 30000: median rank 3, 95th rank ceil(4.75) = 5.
    // First events 400, 500, 600, 700, 2000: median rank 3, 95th rank 5.
    expect(kinds[0]).toEqual({
      kind: "answer_question",
      turns: 5,
      firstEvent: { n: 5, medianMs: 600, p95Ms: 2000 },
      firstWord: { n: 4, medianMs: 2100, p95Ms: 8000 },
      complete: { n: 5, medianMs: 7000, p95Ms: 30000 },
    });
    expect(kinds[2]).toEqual({ kind: null, turns: 1, firstEvent: { n: 0, medianMs: null, p95Ms: null }, firstWord: { n: 0, medianMs: null, p95Ms: null }, complete: { n: 1, medianMs: 3000, p95Ms: 3000 } });
  });
});

async function sessionFor(db: Db): Promise<number> {
  const [s] = await db.insert(sessions).values({ learnerId: 1, instructions: "i", tools: [], model: "gpt-6.1-sol", effort: "medium", fingerprint: "f" }).returning({ id: sessions.id });
  return s.id;
}

describe("tutorSpeed", () => {
  it("reports the last 30 days of turns by Reply kind, with incidents, soft-check slips and guard stops", async () => {
    const db = await testDb();
    const s = await sessionFor(db);
    const turn = (replyKind: string | null, firstWordMs: number | null, totalMs: number | null, at: Date, extra: Partial<typeof turns.$inferInsert> = {}) =>
      db.insert(turns).values({ learnerId: 1, sessionId: s, status: "finished", replyKind, firstWordMs, totalMs, startedAt: at, ...extra });
    await turn("answer_question", 1200, 5000, daysAgo(1), { firstEventMs: 800 });
    await turn("answer_question", 3400, 9000, daysAgo(2), { firstEventMs: 1500 });
    await turn("answer_question", 2100, 7000, daysAgo(29), { firstEventMs: 600 });
    await turn("answer_question", 100000, 100000, daysAgo(31)); // before the window
    await turn("feedback", 900, 4000, daysAgo(3));
    await turn(null, null, null, daysAgo(1), { status: "running" }); // not timed yet

    await db.insert(tutorIncidents).values([
      { learnerId: 1, sessionId: s, kind: "replay_stripped", createdAt: daysAgo(1) },
      { learnerId: 1, sessionId: s, kind: "replay_stripped", createdAt: daysAgo(5) },
      { learnerId: 1, sessionId: s, kind: "other_repair", createdAt: daysAgo(2) },
      { learnerId: 1, sessionId: s, kind: "replay_stripped", createdAt: daysAgo(40) },
      // Widget saves over budget (A9): two over 0.5 s only, one over 1 s, one before the window. Never "repaired".
      { learnerId: 1, sessionId: s, kind: "widget_save_slow", detail: { ms: 620, over: "median" }, createdAt: daysAgo(1) },
      { learnerId: 1, sessionId: s, kind: "widget_save_slow", detail: { ms: 900, over: "median" }, createdAt: daysAgo(2) },
      { learnerId: 1, sessionId: s, kind: "widget_save_slow", detail: { ms: 10900, over: "p95" }, createdAt: daysAgo(3) },
      { learnerId: 1, sessionId: s, kind: "widget_save_slow", detail: { ms: 1500, over: "p95" }, createdAt: daysAgo(45) },
    ]);

    const v1 = [{ rule: "V1", message: "too long" }];
    let seq = 100;
    const check = (r: Partial<typeof replyChecks.$inferInsert>) =>
      db.insert(replyChecks).values({ sessionId: s, turnSeq: ++seq, words: 80, cap: 120, shownText: "x", createdAt: daysAgo(1), ...r });
    await check({ draftProblems: v1 }); // a slip: shown as it was, no retry, no fallback
    await check({ draftProblems: [{ rule: "V8", message: "a number" }, { rule: "V2", message: "two asks" }] }); // another
    await check({ draftProblems: [{ rule: "guard", message: "stopped" }], fallback: true }); // a guard stop
    await check({ draftProblems: v1, retried: true }); // a held reply, retried
    await check({ draftProblems: v1, fallback: true }); // a held reply, replaced by the fallback
    await check({ draftProblems: v1, stopped: true }); // the Learner pressed Stop
    await check({}); // clean
    await check({ draftProblems: v1, createdAt: daysAgo(31) }); // before the window
    await check({ draftProblems: v1 }); // a refusal, below
    await turn("answer_question", null, null, daysAgo(1), { turnSeq: seq, stopReason: "refusal" });

    const report = await tutorSpeed(db, NOW);
    expect(report.available).toBe(true);
    if (!report.available) return;
    expect(report.since.toISOString()).toBe("2026-10-13T06:00:00.000Z");
    expect(report.kinds).toEqual([
      // First words 1200, 2100, 3400 and totals 5000, 7000, 9000: median rank 2, 95th rank ceil(2.85) = 3.
      // First events 600, 800, 1500: median 800, 95th 1500.
      { kind: "answer_question", turns: 3, firstEvent: { n: 3, medianMs: 800, p95Ms: 1500 }, firstWord: { n: 3, medianMs: 2100, p95Ms: 3400 }, complete: { n: 3, medianMs: 7000, p95Ms: 9000 } },
      { kind: "feedback", turns: 1, firstEvent: { n: 0, medianMs: null, p95Ms: null }, firstWord: { n: 1, medianMs: 900, p95Ms: 900 }, complete: { n: 1, medianMs: 4000, p95Ms: 4000 } },
    ]);
    expect(report.widgetSaves).toEqual({ overMedian: 3, overP95: 1 });
    expect(report.incidents).toEqual({ total: 3, byKind: [{ kind: "replay_stripped", n: 2 }, { kind: "other_repair", n: 1 }] });
    expect(report.softCheckSlips).toBe(2);
    expect(report.guardStops).toBe(1);
  });

  it("reports nothing measured on an empty database", async () => {
    const report = await tutorSpeed(await testDb(), NOW);
    expect(report).toMatchObject({ available: true, kinds: [], incidents: { total: 0, byKind: [] }, softCheckSlips: 0, guardStops: 0, widgetSaves: { overMedian: 0, overP95: 0 } });
  });

  it("says the numbers are not available on a database without migration 0037, instead of failing", async () => {
    const db = await testDbThrough("0036_session_items_turn");
    await expect(tutorSpeed(db, NOW)).resolves.toEqual({ available: false, since: daysAgo(30) });
  });

  it("still fails on any other error", async () => {
    const broken = { select: () => { throw Object.assign(new Error("connection refused"), { code: "08006" }); } } as unknown as Db;
    await expect(tutorSpeed(broken, NOW)).rejects.toThrow("connection refused");
  });
});

describe("the A9 budgets per kind", () => {
  const k = (kind: string, fw: [number, number], all: [number, number]) => ({
    kind,
    turns: 10,
    firstEvent: { n: 10, medianMs: 100, p95Ms: 200 },
    firstWord: { n: 10, medianMs: fw[0], p95Ms: fw[1] },
    complete: { n: 10, medianMs: all[0], p95Ms: all[1] },
  });
  it("holds an own question to its first word (2.5 s median, 5 s at the 95th) and every other kind to its complete reply (6 s, 12 s)", () => {
    expect(overBudget(k("own_question", [2400, 4900], [20000, 40000]))).toBe(false);
    expect(overBudget(k("own_question", [2600, 4900], [1000, 2000]))).toBe(true);
    expect(overBudget(k("own_question", [2000, 5100], [1000, 2000]))).toBe(true);
    expect(overBudget(k("hint", [9000, 11000], [6000, 12000]))).toBe(false);
    expect(overBudget(k("hint", [100, 200], [6100, 9000]))).toBe(true);
    expect(overBudget({ kind: "hint", turns: 1, firstEvent: { n: 0, medianMs: null, p95Ms: null }, firstWord: { n: 0, medianMs: null, p95Ms: null }, complete: { n: 0, medianMs: null, p95Ms: null } })).toBeNull();
  });
});
