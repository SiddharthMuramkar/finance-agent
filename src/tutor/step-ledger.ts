import type { Db } from "@/db/types";
import { lastStepNumber, saveStepUsage, type StepUsage } from "./usage";

/**
 * The Step ledger (decision #30): one turn's model steps, counted once across all its runs, and how many it has left
 * under the step limit (decision #13). Every saved step counts: the Tutor's loop steps, the reply retry's, and a fold
 * or compaction. The Tool Runner asks `left` before each step, so a step saved in the middle of a run counts at once. Two adapters: the limited one for a Learner's turn, and one with
 * no limit for the evals.
 */
export type StepLedger = {
  /** Saves one step's usage under the turn's next step number. */
  save(model: string, make: (n: number) => StepUsage): Promise<void>;
  /** How many more steps the turn may take (0 when none). */
  left(): Promise<number>;
};

/** Where a turn's steps are saved: its Session and turn seq. */
export type LedgerAt = { db: Db; sessionId: number; turnSeq: number; now: () => Date };

/** The ledger for a turn of at most `limit` steps. Steps a resumed turn saved in earlier runs count. */
export function stepLedger({ db, sessionId, turnSeq, now }: LedgerAt, limit: number): StepLedger {
  // The last step number an earlier run saved, read once. The read is shared, so two steps saved at the same moment
  // (tools run side by side) never both take the next number.
  let before: Promise<number> | undefined;
  const earlier = () => (before ??= lastStepNumber(db, sessionId, turnSeq));
  // The steps this ledger has numbered: a step takes its number before its row is written.
  let added = 0;
  return {
    async save(model, make) {
      const own = ++added;
      const n = (await earlier()) + own;
      await saveStepUsage(db, sessionId, turnSeq, model, make(n), now());
    },
    async left() {
      return Math.max(0, limit - (await earlier()) - added);
    },
  };
}

/** The evals' ledger: steps are saved and numbered the same, and none is ever refused. */
export function noLimitLedger(at: LedgerAt): StepLedger {
  return stepLedger(at, Infinity);
}
