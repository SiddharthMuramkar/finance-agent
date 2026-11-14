import { eq } from "drizzle-orm";
import { isOwnerLearner, waitingCount } from "@/auth/access";
import type { Learner } from "@/auth/learners";
import { user } from "@/db/schema";
import type { Db } from "@/db/types";
import type { HeaderAccount } from "./ui";

/**
 * Who the header's account menu and the Settings Account card name (A5): the Learner's name and, for a Learner linked
 * to a Google or email-link account, that account's email (learners.auth_user_id -> user.email). A passcode Learner has
 * no linked user, so no email, and Settings says "Signed in with a passcode". Reads no database for a passcode Learner.
 * The owner's Learner also gets `admin`, the number of people waiting, for the menu's Admin row (ADR 0014): one count,
 * read beside the email, and only for the owner. The row is only a hint; /admin checks the owner's session itself.
 */
export async function accountFor(db: Db, learner: Pick<Learner, "name" | "authUserId" | "archivedAt">): Promise<HeaderAccount> {
  if (!learner.authUserId) return { name: learner.name };
  const [[found], waiting] = await Promise.all([
    db.select({ email: user.email }).from(user).where(eq(user.id, learner.authUserId)).limit(1),
    isOwnerLearner(learner) ? waitingCount(db) : null,
  ]);
  return {
    name: learner.name,
    ...(found?.email ? { email: found.email } : {}),
    ...(waiting !== null ? { admin: { waiting } } : {}),
  };
}
