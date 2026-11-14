import { and, eq, sql } from "drizzle-orm";
import type { Check, CourseMap, Primer, Topic } from "@/course/map";
import { navigate } from "@/course/navigator";
import { PRIMER, primerItem, primersAt, type PrimerData } from "@/course/primers";
import { sessionItems } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadProgress } from "@/learner/memory";
import { loadSessionItems, saveItemAfterLatest } from "./session-items";
import type { SessionItem } from "./session-item-kinds";

/**
 * Primers in a Session (spec 2026-11-12, C3): the database part of src/course/primers.ts. On entering a Teaching Step,
 * code stores each Primer the Topic file places there, once per Session, before what the step itself shows. Its Quick
 * try is answered through /api/quick-try like any other (answerQuickTry finds it by key), and "I know this" marks the
 * stored Primer passed over (/api/primer), so a reload draws it folded.
 */

/** A Primer stored now, with what is needed to store its Widget preset after it (practice.ts storePreset). */
export type StoredPrimer = { item: SessionItem; primer: Primer; topic: Topic; check: Check };

/**
 * Stores the Primers due at the Learner's step that this Session has not shown yet, in file order, and returns them.
 * Nothing for a step with no Primer, a passed Topic, or a Primer already stored in this Session.
 */
export async function storePrimerItems(db: Db, map: CourseMap, learnerId: number, sessionId: number, now: Date): Promise<StoredPrimer[]> {
  const place = navigate(map, await loadProgress(db, learnerId));
  const due = primersAt(place);
  if (!place || !due.length) return [];
  const shown = new Set(
    (await loadSessionItems(db, sessionId, learnerId)).filter((i) => i.kind === PRIMER).map((i) => (i.data as Partial<PrimerData>).primer?.id),
  );
  const check = place.check ?? place.topic.checks[0];
  const stored: StoredPrimer[] = [];
  for (const primer of due) {
    if (shown.has(primer.id)) continue;
    const item = primerItem(map, place.topic, primer, check.id, sessionId);
    if (!item) {
      console.error(`Primer "${primer.id}" of Topic "${place.topic.id}" cannot be shown: its term or Quick try does not make a card and choices.`);
      continue;
    }
    await saveItemAfterLatest(db, learnerId, sessionId, item, now);
    stored.push({ item, primer, topic: place.topic, check });
  }
  return stored;
}

/** The Learner's stored Primer whose Quick try has this key, or undefined. */
export async function primerByKey(db: Db, learnerId: number, key: string): Promise<{ id: number; sessionId: number; data: PrimerData } | undefined> {
  const [row] = await db
    .select({ id: sessionItems.id, sessionId: sessionItems.sessionId, data: sessionItems.data })
    .from(sessionItems)
    .where(and(eq(sessionItems.learnerId, learnerId), eq(sessionItems.kind, PRIMER), sql`${sessionItems.data}->>'key' = ${key}`))
    .limit(1);
  return row ? { id: row.id, sessionId: row.sessionId, data: row.data as unknown as PrimerData } : undefined;
}

/**
 * "I know this": marks the Learner's Primer passed over, so it draws folded from now on. It never blocks or moves the
 * Topic, and pressing it twice changes nothing. False when the Learner has no Primer with that key.
 */
export async function passPrimer(db: Db, learnerId: number, key: string): Promise<boolean> {
  const found = await primerByKey(db, learnerId, key);
  if (!found) return false;
  if (found.data.primer.passed) return true;
  const data: PrimerData = { ...found.data, primer: { ...found.data.primer, passed: true } };
  await db.update(sessionItems).set({ data }).where(and(eq(sessionItems.id, found.id), eq(sessionItems.learnerId, learnerId)));
  return true;
}
