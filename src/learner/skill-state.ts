import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { practiceAnswers, skillState } from "@/db/schema";
import type { Db } from "@/db/types";
import { applyAnswer, freshSkillState, LADDER, parkUntil, type AnswerEvent, type Method, type SkillState } from "@/teaching/ladder";

/**
 * Skill state in Learner Memory (spec #229, ticket #232). Every Quick-try and typed quiz answer that code marks is
 * logged in `practice_answers`, and the Learner's state on that Skill (`skill_state`) is updated in the same
 * transaction, once per item key. The repair ladder (`src/teaching/ladder.ts`) decides what comes next from it.
 * Every row is one Learner's.
 */

/** One marked answer. `itemKey` names this showing of the item, so the same answer sent twice counts once. */
export type PracticeAnswer = {
  learnerId: number;
  topicId: string;
  skillId: string;
  sessionId?: number | null;
  itemKey: string;
  itemId: string;
  templateId?: string | null;
  /** The numbers the item was shown with. */
  params?: Record<string, unknown>;
  /** What the Learner gave, as typed or picked. */
  input: string;
  verdict: "right" | "known_mistake" | "wrong";
  /** The Known mistake's tag; required for a `known_mistake` verdict. */
  mistakeTag?: string | null;
  source: "quick_try" | "quiz";
  /**
   * False logs the answer but leaves the Skill's state as it is: a quiz attempt's second and later misses on one Skill
   * (one miss per Skill per attempt). Defaults to true.
   */
  countInState?: boolean;
};

type Row = typeof skillState.$inferSelect;

function toState(row: Row | undefined): SkillState {
  if (!row) return freshSkillState();
  return {
    tries: row.tries,
    right: row.right,
    streak: row.streak,
    missesInRow: row.missesInRow,
    lastMistake: row.lastMistake,
    methodsUsed: row.methodsUsed.filter((m): m is Method => (LADDER as readonly string[]).includes(m)),
    parkedUntil: row.parkedUntil,
  };
}

const ofSkill = (learnerId: number, topicId: string, skillId: string) =>
  and(eq(skillState.learnerId, learnerId), eq(skillState.topicId, topicId), eq(skillState.skillId, skillId));

function eventOf(a: PracticeAnswer): AnswerEvent {
  if (a.verdict === "known_mistake") {
    if (!a.mistakeTag) throw new Error(`Answer ${a.itemKey}: a Known mistake needs its tag.`);
    return { verdict: "known_mistake", tag: a.mistakeTag };
  }
  return { verdict: a.verdict };
}

/**
 * Logs one marked answer and updates the Learner's state on its Skill, in one transaction, and returns the state
 * after it. An item key already logged for this Learner changes nothing: the state as it stands is returned.
 */
export async function recordAnswer(db: Db, a: PracticeAnswer, now = new Date()): Promise<SkillState> {
  const event = eventOf(a);
  return db.transaction(async (transaction) => {
    const tx = transaction as unknown as Db;
    const logged = await tx
      .insert(practiceAnswers)
      .values({
        learnerId: a.learnerId,
        topicId: a.topicId,
        skillId: a.skillId,
        sessionId: a.sessionId ?? null,
        itemKey: a.itemKey,
        itemId: a.itemId,
        templateId: a.templateId ?? null,
        params: a.params ?? {},
        input: a.input,
        verdict: a.verdict,
        mistakeTag: event.verdict === "known_mistake" ? event.tag : null,
        source: a.source,
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: practiceAnswers.id });
    const where = ofSkill(a.learnerId, a.topicId, a.skillId);
    if (!logged.length || a.countInState === false) return toState((await tx.select().from(skillState).where(where))[0]);

    // The row is made first, then locked, so two answers on one Skill at the same moment are applied one after the other.
    await tx.insert(skillState).values({ learnerId: a.learnerId, topicId: a.topicId, skillId: a.skillId, updatedAt: now }).onConflictDoNothing();
    const [row] = await tx.select().from(skillState).where(where).for("update");
    const next = applyAnswer(toState(row), event);
    await tx
      .update(skillState)
      .set({ tries: next.tries, right: next.right, streak: next.streak, missesInRow: next.missesInRow, lastMistake: next.lastMistake, updatedAt: now })
      .where(where);
    return next;
  });
}

/** The Learner's state on every Skill of a Topic they have answered or been taught, by Skill id. A Skill missing here is fresh. */
export async function skillStates(db: Db, learnerId: number, topicId: string): Promise<Record<string, SkillState>> {
  const rows = await db
    .select()
    .from(skillState)
    .where(and(eq(skillState.learnerId, learnerId), eq(skillState.topicId, topicId)));
  return Object.fromEntries(rows.map((r) => [r.skillId, toState(r)]));
}

/** Writes some fields of one Skill's state, making its row if there is none yet, and returns the state. */
async function upsert(db: Db, learnerId: number, topicId: string, skillId: string, insert: Partial<Row>, update: PgUpdateSetSource<typeof skillState>, now: Date) {
  const [row] = await db
    .insert(skillState)
    .values({ learnerId, topicId, skillId, ...insert, updatedAt: now })
    .onConflictDoUpdate({ target: [skillState.learnerId, skillState.topicId, skillState.skillId], set: { ...update, updatedAt: now } })
    .returning();
  return toState(row);
}

/**
 * Parks the Skill: it comes back as a drill of five 20 hours from `now`. Misses in a row start again from 0, so the
 * drill climbs the ladder afresh. The Learner's place on the Course Map is not touched.
 */
export async function parkSkill(db: Db, learnerId: number, topicId: string, skillId: string, now: Date): Promise<SkillState> {
  const parked = { parkedUntil: parkUntil(now), missesInRow: 0 };
  return upsert(db, learnerId, topicId, skillId, parked, parked, now);
}

/** Ends the Skill's park, once its drill is done. */
export async function unparkSkill(db: Db, learnerId: number, topicId: string, skillId: string, now = new Date()): Promise<SkillState> {
  return upsert(db, learnerId, topicId, skillId, {}, { parkedUntil: null }, now);
}

/** Notes that the Tutor taught the Skill again with this method, after the ones used before. */
export async function noteMethodUsed(db: Db, learnerId: number, topicId: string, skillId: string, method: Method, now = new Date()): Promise<void> {
  await upsert(
    db,
    learnerId,
    topicId,
    skillId,
    { methodsUsed: [method] },
    { methodsUsed: sql`array_append(${skillState.methodsUsed}, ${method}::text)` },
    now,
  );
}

/**
 * The Learner's parked Skills in the given Topics, by Topic id and then Skill id: when each comes back. Pass only
 * converted Topics; with none, nothing is read, so a database without the skill_state table is never queried.
 */
export async function parkedSkills(db: Db, learnerId: number, topicIds: readonly string[]): Promise<Record<string, Record<string, Date>>> {
  if (!topicIds.length) return {};
  const rows = await db
    .select({ topicId: skillState.topicId, skillId: skillState.skillId, until: skillState.parkedUntil })
    .from(skillState)
    .where(and(eq(skillState.learnerId, learnerId), inArray(skillState.topicId, [...topicIds]), isNotNull(skillState.parkedUntil)));
  const out: Record<string, Record<string, Date>> = {};
  for (const r of rows) if (r.until) (out[r.topicId] ??= {})[r.skillId] = r.until;
  return out;
}
