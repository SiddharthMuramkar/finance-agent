import { and, eq, isNull } from "drizzle-orm";
import { learners } from "@/db/schema";
import type { Db } from "@/db/types";
import { inviteFor } from "./invites";
import type { Learner } from "./learners";

/** The fields of a Better Auth `user` this module reads. */
export type AuthUser = { id: string; email: string; name: string };

async function linkedLearner(db: Db, userId: string): Promise<Learner | null> {
  const [found] = await db
    .select()
    .from(learners)
    .where(and(eq(learners.authUserId, userId), isNull(learners.archivedAt)))
    .limit(1);
  return found ?? null;
}

/**
 * The Learner a Google user signs in as (ADR 0011), made or linked on first use; null when this
 * user may not have one (not invited and sign-up closed).
 */
export async function learnerForAuthUser(db: Db, user: AuthUser): Promise<Learner | null> {
  const linked = await linkedLearner(db, user.id);
  if (linked) return linked;
  const invite = await inviteFor(db, user.email);
  if (!invite) return null;
  const [made] = await db.insert(learners).values({ name: user.name, authUserId: user.id }).returning();
  return made;
}
