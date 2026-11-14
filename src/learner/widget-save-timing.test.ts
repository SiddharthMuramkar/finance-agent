import { describe, expect, it } from "vitest";
import { OWNER_LEARNER_ID, sessions, tutorIncidents } from "@/db/schema";
import { testDb } from "@/test/pglite";
import { recordSaveTime, saveOverBudget, WIDGET_SAVE_BUDGET, WIDGET_SAVE_SLOW } from "./widget-save-timing";

/**
 * Spec 2026-11-12 A9: a Widget state save's budget is 0.5 s at the median and 1 s at the 95th percentile. The 10.9 s save
 * of 11 November breaks both lines; the 0.5 s save of the same Session breaks neither.
 */
describe("Widget state save timing (A9)", () => {
  it("holds the spec's budget lines: 0.5 s and 1 s", () => {
    expect(WIDGET_SAVE_BUDGET).toEqual({ medianMs: 500, p95Ms: 1000 });
    expect(saveOverBudget(500)).toBe("none");
    expect(saveOverBudget(501)).toBe("median");
    expect(saveOverBudget(1000)).toBe("median");
    expect(saveOverBudget(1001)).toBe("p95");
    expect(saveOverBudget(10_900)).toBe("p95");
  });

  it("records a save over 0.5 s as one incident with its time, and nothing for a save within budget", async () => {
    const db = await testDb();
    const [s] = await db.insert(sessions).values({ learnerId: OWNER_LEARNER_ID, instructions: "i", tools: [], model: "gpt-6.1-sol", effort: "medium", fingerprint: "f" }).returning();
    expect(await recordSaveTime(db, { learnerId: OWNER_LEARNER_ID, sessionId: s.id, widgetKey: "rates", ms: 500 })).toBe(false);
    expect(await recordSaveTime(db, { learnerId: OWNER_LEARNER_ID, sessionId: s.id, widgetKey: "rates", ms: 10_900.4 })).toBe(true);
    const rows = await db.select().from(tutorIncidents);
    expect(rows).toEqual([expect.objectContaining({ kind: WIDGET_SAVE_SLOW, sessionId: s.id, turnId: null, detail: { ms: 10_900, over: "p95", widgetKey: "rates" } })]);
  });
});
