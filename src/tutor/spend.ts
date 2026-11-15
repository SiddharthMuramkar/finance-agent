import { eq, max, sql } from "drizzle-orm";
import { learners, sessions, turns, usageRows } from "@/db/schema";
import type { Db } from "@/db/types";

// Spend (GLOSSARY): the owner's estimated cost of the Tutor's model calls, per person, for the Spend
// section of /admin. Read from the `usage` step rows the turn already saves (usage.ts), each with the
// cost worked out from the price table when it was written (pricing.ts), so old rows keep their
// price. Only step rows are summed: the turn row repeats its steps' total, and a cut-off or failed
// turn has no turn row at all. Voyage embeddings, the weekly library refresh and the
// evals' own judge calls are not in `usage`, so they are not here either. A person is a Clerk user (issue #33); who
// they are (their email) is Clerk's to say, so /admin asks Clerk for that (src/auth/clerk-directory.ts), not this file.

/** India is UTC+05:30 all year (no daylight saving), the zone the app's dates use (past-sessions.tsx). */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** The start of `now`'s calendar month in India time: midnight on the 1st, as an instant. */
export function monthStartIst(now: Date): Date {
  const local = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - IST_OFFSET_MS);
}

/** One person's (or one bucket's) figures. Dollars are estimates at list prices. */
export type SpendFigures = {
  /** Tutor replies asked for: one per turn, by a message or by pressing Next; a retry or resume is the same turn. */
  turns: number;
  /** Since midnight on the 1st, India time. */
  monthUsd: number;
  allTimeUsd: number;
  /** Steps whose model has no price in the table, so their cost is missing from the dollars. */
  unpricedSteps: number;
  /** When their latest turn started; null with no turns. */
  lastActiveAt: Date | null;
};

/** A person: one Clerk user, with every Learner they have had (Start over archives one and makes another). */
export type PersonSpend = SpendFigures & {
  /** Their Clerk user id (`learners.clerk_user_id`). */
  userId: string;
  /** Their active Learner's name, or their newest Learner's when none is active. */
  name: string;
};

export type SpendReport = {
  /** Every Clerk user with a Learner, most spent this month first. */
  people: PersonSpend[];
  /**
   * Learners with no Clerk user (from before Clerk, the test tools, passcodes); null when none of them has a turn or a
   * step.
   */
  unlinked: SpendFigures | null;
  /** Everyone together, the unlinked Learners included. */
  total: SpendFigures;
};

const zero = (): SpendFigures => ({ turns: 0, monthUsd: 0, allTimeUsd: 0, unpricedSteps: 0, lastActiveAt: null });

function add(into: SpendFigures, from: Partial<SpendFigures>): void {
  into.turns += from.turns ?? 0;
  into.monthUsd += from.monthUsd ?? 0;
  into.allTimeUsd += from.allTimeUsd ?? 0;
  into.unpricedSteps += from.unpricedSteps ?? 0;
  const last = from.lastActiveAt ?? null;
  if (last && (!into.lastActiveAt || last > into.lastActiveAt)) into.lastActiveAt = last;
}

/**
 * Spend per person, as of `now` (passed in so the month boundary can be tested). Three grouped reads, by
 * Learner: whose each Learner is, what their steps cost, and their turns. They are folded into one row
 * per Clerk user here, since a user can hold several Learners. Ties fall back to the Clerk user id, so
 * the order is the same on every load.
 */
export async function spendByPerson(db: Db, now: Date): Promise<SpendReport> {
  const monthStart = monthStartIst(now).toISOString();
  const [whose, costs, turnCounts] = await Promise.all([
    db.select({ id: learners.id, name: learners.name, clerkUserId: learners.clerkUserId, archivedAt: learners.archivedAt }).from(learners).orderBy(learners.id),
    db
      .select({
        learnerId: sessions.learnerId,
        monthUsd: sql`coalesce(sum(${usageRows.costUsd}) filter (where ${usageRows.createdAt} >= ${monthStart}::timestamptz), 0)`.mapWith(Number),
        allTimeUsd: sql`coalesce(sum(${usageRows.costUsd}), 0)`.mapWith(Number),
        unpricedSteps: sql`count(*) filter (where ${usageRows.costUsd} is null)`.mapWith(Number),
      })
      .from(usageRows)
      .innerJoin(sessions, eq(usageRows.sessionId, sessions.id))
      .where(eq(usageRows.kind, "step"))
      .groupBy(sessions.learnerId),
    db
      .select({ learnerId: turns.learnerId, turns: sql`count(*)`.mapWith(Number), lastActiveAt: max(turns.startedAt) })
      .from(turns)
      .groupBy(turns.learnerId),
  ]);

  const byLearner = new Map<number, Partial<SpendFigures>>();
  for (const c of costs) byLearner.set(c.learnerId, { monthUsd: c.monthUsd, allTimeUsd: c.allTimeUsd, unpricedSteps: c.unpricedSteps });
  for (const t of turnCounts) byLearner.set(t.learnerId, { ...byLearner.get(t.learnerId), turns: t.turns, lastActiveAt: t.lastActiveAt });

  const people = new Map<string, PersonSpend>();
  const hasActive = new Set<string>();
  const unlinked = zero();
  let unlinkedSeen = false;
  // Oldest Learner first: the active Learner names the person, or else the newest one does.
  for (const learner of whose) {
    const figures = byLearner.get(learner.id) ?? {};
    if (learner.clerkUserId === null) {
      add(unlinked, figures);
      unlinkedSeen ||= byLearner.has(learner.id);
      continue;
    }
    let person = people.get(learner.clerkUserId);
    if (!person) {
      person = { ...zero(), userId: learner.clerkUserId, name: learner.name };
      people.set(learner.clerkUserId, person);
    }
    if (learner.archivedAt === null) hasActive.add(learner.clerkUserId);
    if (learner.archivedAt === null || !hasActive.has(learner.clerkUserId)) person.name = learner.name;
    add(person, figures);
  }

  const list = [...people.values()].sort((a, b) => b.monthUsd - a.monthUsd || b.allTimeUsd - a.allTimeUsd || a.userId.localeCompare(b.userId));
  const total = zero();
  for (const p of list) add(total, p);
  add(total, unlinked);
  return { people: list, unlinked: unlinkedSeen ? unlinked : null, total };
}
