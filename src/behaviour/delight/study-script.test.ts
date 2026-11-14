import type { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
// @ts-expect-error the Delight eval's browser set-up is a plain .mjs script with no types
import { openAtStep, openStudy, waitForOpener } from "../../../scripts/delight-study.mjs";
import { learners, learnerState, topicProgress } from "@/db/schema";
import { testDb } from "@/test/pglite";

/**
 * Seam S3: how the Delight eval puts the tools Learner at a prompt's step and opens the Study Workspace. The page
 * starts the Tutor's opener as a streaming POST at once, so "network idle" only comes once the whole opener has
 * streamed; a goto that waits for it outlives Playwright's 30 s navigation timeout on a slow opener (finding E4b-R1).
 */

/** A page whose opener streams for as long as the test says: network idle never comes while it streams. */
function streamingPage() {
  const calls: string[] = [];
  let finish!: () => void;
  const opener = new Promise<void>((r) => (finish = r));
  const page = {
    calls,
    finishOpener: () => finish(),
    goto: async (url: string, o: { waitUntil?: string; timeout?: number } = {}) => {
      calls.push(`goto ${url} ${o.waitUntil ?? "load"}`);
      if (o.waitUntil === "networkidle") {
        // Playwright's default navigation timeout, cut short: the streaming opener keeps the network busy past it.
        await Promise.race([opener, new Promise((r) => setTimeout(r, 50))]);
        throw Object.assign(new Error("page.goto: Timeout 30000ms exceeded."), { name: "TimeoutError" });
      }
      return null;
    },
    locator: (sel: string) => ({
      first: () => ({
        waitFor: async (o: { timeout: number }) => {
          calls.push(`wait ${sel} ${o.timeout}`);
        },
      }),
    }),
    getByRole: (role: string, o: { name: string }) => ({
      waitFor: async (w: { timeout: number }) => {
        calls.push(`wait ${role} ${o.name} ${w.timeout}`);
        await opener;
      },
    }),
    waitForTimeout: async (ms: number) => {
      calls.push(`pause ${ms}`);
    },
  };
  return page;
}

describe("[S3] the Delight eval opens the Study Workspace without waiting for network idle", () => {
  it("returns from the navigation while the opener is still streaming", async () => {
    const page = streamingPage();
    await expect(openStudy(page, "http://localhost:3101")).resolves.toBeUndefined();
    expect(page.calls).toEqual(["goto http://localhost:3101/study domcontentloaded"]);
    page.finishOpener();
  });

  it("then waits for the opener with the long waits: 120 s for the first Tutor message, the turn timeout for Send", async () => {
    const page = streamingPage();
    await openStudy(page, "http://localhost:3101");
    const waited = waitForOpener(page, 180_000);
    setTimeout(() => page.finishOpener(), 20);
    await waited;
    expect(page.calls).toEqual([
      "goto http://localhost:3101/study domcontentloaded",
      'wait [data-testid="assistant-message"] 120000',
      "wait button Send 180000",
      "pause 1500",
    ]);
  });
});

async function withTools(): Promise<{ db: Awaited<ReturnType<typeof testDb>>; pool: PGlite; learnerId: number }> {
  const db = await testDb();
  const [l] = await db.insert(learners).values({ name: "tools" }).returning({ id: learners.id });
  return { db, pool: (db as unknown as { $client: PGlite }).$client, learnerId: l.id };
}

describe("[S3] openAtStep writes the tools Learner's place, on the real migrations", () => {
  it("puts a fresh tools Learner in the prompt's Topic at its step, reveal not shown before the reveal", async () => {
    const { db, pool, learnerId } = await withTools();
    await openAtStep(pool, learnerId, { topic: "num-percent-bps", step: "story" });
    expect(await db.select({ topic: topicProgress.topicId, step: topicProgress.step, reveal: topicProgress.revealShown, status: topicProgress.status }).from(topicProgress).where(eq(topicProgress.learnerId, learnerId))).toEqual([
      { topic: "num-percent-bps", step: "story", reveal: false, status: "in_progress" },
    ]);
    expect(await db.select({ id: learnerState.id, topic: learnerState.currentTopicId }).from(learnerState).where(eq(learnerState.learnerId, learnerId))).toEqual([{ id: learnerId, topic: "num-percent-bps" }]);
  });

  it("moves an existing row to the new step with the reveal shown from the reveal on, and keeps one row each", async () => {
    const { db, pool, learnerId } = await withTools();
    await openAtStep(pool, learnerId, { topic: "num-percent-bps", step: "story" });
    await db.update(topicProgress).set({ status: "passed" }).where(eq(topicProgress.learnerId, learnerId));
    await openAtStep(pool, learnerId, { topic: "num-percent-bps", step: "principle" });
    await openAtStep(pool, learnerId, { topic: "ltcm", step: "reveal" });
    const rows = await db.select({ topic: topicProgress.topicId, step: topicProgress.step, reveal: topicProgress.revealShown, status: topicProgress.status }).from(topicProgress).where(eq(topicProgress.learnerId, learnerId)).orderBy(topicProgress.topicId);
    expect(rows).toEqual([
      { topic: "ltcm", step: "reveal", reveal: true, status: "in_progress" },
      { topic: "num-percent-bps", step: "principle", reveal: true, status: "in_progress" },
    ]);
    expect(await db.select({ topic: learnerState.currentTopicId }).from(learnerState).where(eq(learnerState.learnerId, learnerId))).toEqual([{ topic: "ltcm" }]);
  });

  it("refuses any Learner but the tools Learner and writes nothing", async () => {
    const { db, pool } = await withTools();
    const [owner] = await db.insert(learners).values({ name: "someone" }).returning({ id: learners.id });
    await expect(openAtStep(pool, owner.id, { topic: "num-percent-bps", step: "story" })).rejects.toThrow(/Refusing/);
    expect(await db.select().from(topicProgress).where(eq(topicProgress.learnerId, owner.id))).toEqual([]);
  });
});
