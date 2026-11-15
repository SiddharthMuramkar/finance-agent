import { count, eq } from "drizzle-orm";
import { tutorIncidents } from "@/db/schema";
import type { Db } from "@/db/types";
import { isMissingTable } from "./reply-records";

/**
 * Tutor incidents (spec 2026-11-12, A2; ADR 0007): one `tutor_incidents` row each time code repaired a Session instead
 * of failing the turn. Each one is a bug in what is sent to the model (A1), so every one is counted. Like the reply
 * checks' records, writes fail soft: until migration 0037 is applied a missing table is logged once, and a record that
 * cannot be written never fails the turn it would describe.
 */

/** The kinds a row can have: the API refused replayed output items and the turn healed (replay-heal.ts). */
export { REPLAY_STRIPPED } from "./replay-heal";

export type Incident = {
  learnerId: number;
  sessionId: number;
  turnId: number | null;
  kind: string;
  requestId: string | null;
  detail: Record<string, unknown>;
};

let warned = false;

export async function recordIncident(db: Db, incident: Incident, now = new Date()): Promise<void> {
  try {
    // Its own transaction (a savepoint inside a caller's), so a failed insert leaves nothing aborted.
    await db.transaction(async (tx) => void (await tx.insert(tutorIncidents).values({ ...incident, createdAt: now })));
  } catch (error) {
    if (!isMissingTable(error)) {
      console.error(`A Tutor incident (${incident.kind}) could not be recorded`, error);
      return;
    }
    if (!warned) {
      warned = true;
      console.warn("tutor_incidents is missing (migration 0037 not applied yet): incidents are logged, not counted.");
    }
    console.warn(`Tutor incident (${incident.kind})`, incident);
  }
}

/** How many incidents of a kind are recorded; 0 with no table. */
export async function incidentCount(db: Db, kind: string): Promise<number> {
  try {
    const [row] = await db.select({ n: count() }).from(tutorIncidents).where(eq(tutorIncidents.kind, kind));
    return row?.n ?? 0;
  } catch (error) {
    if (isMissingTable(error)) return 0;
    throw error;
  }
}
