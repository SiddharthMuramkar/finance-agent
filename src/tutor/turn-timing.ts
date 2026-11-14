import { eq } from "drizzle-orm";
import { turns } from "@/db/schema";
import type { Db } from "@/db/types";

/**
 * Turn timing (spec 2026-11-12, A9): each turn records, in milliseconds from when its run started, the time to the
 * first event from the model, the time to the first word the Learner could see, and the total time, with its Reply
 * kind, so the usage report can hold the Tutor to its budget (speed.ts). Writing them fails soft: a database without
 * migration 0037's columns logs once, and the turn it describes never fails for it.
 */

/**
 * The Reply kind a streamed own-question turn's times are saved under (A5, A9): its budget is the first visible word, so
 * the speed report tells it apart from step-led replies, whatever Reply kind its record in reply_checks names.
 */
export const OWN_QUESTION_KIND = "own_question";

/** The times of one run of a turn, as it goes. */
export class TurnClock {
  firstEventMs: number | null = null;
  firstWordMs: number | null = null;
  totalMs: number | null = null;
  replyKind: string | null = null;

  constructor(private readonly start: number = performance.now()) {}

  /** An event came from the model (a thinking, text or tool block, or the message's start): the first one is timed. */
  modelEvent(): void {
    this.firstEventMs ??= this.since();
  }

  /** An event went to the browser: the first one with words the Learner can read is timed. */
  shown(event: { type: string; text?: unknown }): void {
    if ((event.type === "text" || event.type === "replay") && typeof event.text === "string" && event.text.trim()) this.firstWordMs ??= this.since();
  }

  /** The run ended (finished, failed, cut off or stopped). */
  end(): void {
    this.totalMs ??= this.since();
  }

  private since(): number {
    return Math.max(0, Math.round(performance.now() - this.start));
  }
}

let warned = false;

/** Saves a run's times and Reply kind on its turns row. A failure is logged (once, for missing columns) and never thrown. */
export async function saveTurnTiming(db: Db, turnId: number, clock: TurnClock): Promise<void> {
  try {
    await db
      .update(turns)
      .set({ firstEventMs: clock.firstEventMs, firstWordMs: clock.firstWordMs, totalMs: clock.totalMs, replyKind: clock.replyKind })
      .where(eq(turns.id, turnId));
  } catch (error) {
    if (!warned) {
      warned = true;
      console.warn("Turn times could not be saved (migration 0037 not applied yet?): the usage report will not show them.", error);
    }
  }
}
