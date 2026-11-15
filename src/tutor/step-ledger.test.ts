import { describe, expect, it } from "vitest";
import { OWNER_LEARNER_ID, sessions } from "@/db/schema";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";
import { TUTOR_MODEL } from "./model";
import { noLimitLedger, stepLedger, type LedgerAt } from "./step-ledger";
import { loadStepUsages, stepUsage } from "./usage";

/** The Step ledger (decision #30): a turn's steps, numbered once across its runs, and how many are left under the step limit. */

async function at(db: Db): Promise<LedgerAt> {
  const [s] = await db
    .insert(sessions)
    .values({ learnerId: OWNER_LEARNER_ID, instructions: "i", tools: [], model: TUTOR_MODEL, effort: "medium", fingerprint: "f" })
    .returning({ id: sessions.id });
  return { db, sessionId: s.id, turnSeq: 3, now: () => new Date() };
}

const step = (tools: string[]) => (n: number) => stepUsage(TUTOR_MODEL, n, { input_tokens: 10, output_tokens: 5 }, tools, 1, "end_turn");

describe("the Step ledger", () => {
  it("numbers the steps it saves and counts down what is left, to 0 and never below", async () => {
    const where = await at(await testDb());
    const ledger = stepLedger(where, 3);
    expect(await ledger.left()).toBe(3);
    await ledger.save(TUTOR_MODEL, step(["calculate"]));
    await ledger.save(TUTOR_MODEL, step(["compose_widget"]));
    expect(await ledger.left()).toBe(1);
    await ledger.save(TUTOR_MODEL, step([]));
    await ledger.save(TUTOR_MODEL, step(["compaction"]));
    expect(await ledger.left()).toBe(0);
    expect((await loadStepUsages(where.db, where.sessionId, where.turnSeq)).map((s) => s.step)).toEqual([1, 2, 3, 4]);
  });

  it("counts the steps an earlier run of the turn saved: a resumed run goes on from there", async () => {
    const where = await at(await testDb());
    const first = stepLedger(where, 10);
    for (let i = 0; i < 4; i++) await first.save(TUTOR_MODEL, step([]));
    const resumed = stepLedger(where, 10);
    expect(await resumed.left()).toBe(6);
    await resumed.save(TUTOR_MODEL, step([]));
    expect((await loadStepUsages(where.db, where.sessionId, where.turnSeq)).map((s) => s.step)).toEqual([1, 2, 3, 4, 5]);
  });

  it("gives steps saved at the same moment their own numbers, each counted once", async () => {
    const where = await at(await testDb());
    const ledger = stepLedger(where, 10);
    await Promise.all([ledger.save(TUTOR_MODEL, step(["compose_widget"])), ledger.save(TUTOR_MODEL, step(["compose_widget"])), ledger.save(TUTOR_MODEL, step([]))]);
    expect(await ledger.left()).toBe(7);
    expect((await loadStepUsages(where.db, where.sessionId, where.turnSeq)).map((s) => s.step)).toEqual([1, 2, 3]);
  });

  it("the evals' ledger saves and numbers steps the same, and never runs out", async () => {
    const where = await at(await testDb());
    const ledger = noLimitLedger(where);
    for (let i = 0; i < 12; i++) await ledger.save(TUTOR_MODEL, step([]));
    expect(await ledger.left()).toBe(Infinity);
    expect(await loadStepUsages(where.db, where.sessionId, where.turnSeq)).toHaveLength(12);
  });
});
