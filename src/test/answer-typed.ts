import { and, eq, sql } from "drizzle-orm";
import type { CourseMap } from "@/course/map";
import { sessionItems } from "@/db/schema";
import type { Db } from "@/db/types";
import { answerQuickTry, quickTryItem } from "@/tutor/practice";
import { QUICK_TRY, type QuickTryData } from "@/tutor/session-item-kinds";
import { choiceForTyped } from "@/teaching/typed-to-choice";

/**
 * Test helper: answers a Quick try the way an older test wrote it, with a typed number, by tapping the choice that
 * number stands for. The app only takes taps; this keeps sequencing tests (ladder, park, drill) about sequencing.
 */
export async function answerTyped(db: Db, map: CourseMap, learnerId: number, key: string, typed: string, now: Date) {
  const [row] = await db
    .select({ data: sessionItems.data })
    .from(sessionItems)
    .where(and(eq(sessionItems.learnerId, learnerId), eq(sessionItems.kind, QUICK_TRY), sql`${sessionItems.data}->>'key' = ${key}`));
  const shown = row?.data as unknown as QuickTryData | undefined;
  const topic = shown ? map.topic(map.check(shown.checkId)?.topicId ?? "") : undefined;
  const found = topic ? quickTryItem(topic, key) : null;
  return answerQuickTry(db, map, learnerId, key, found ? choiceForTyped(found.item, typed) : typed, now);
}
