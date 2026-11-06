import { eq } from "drizzle-orm";
import type { Learner } from "@/auth/learners";
import { user } from "@/db/schema";
import type { Db } from "@/db/types";
import type { HeaderAccount } from "./ui";

/**
 * Who the header's account menu and the Settings Account card name (A5): the Learner's name and, for a Google-linked
 * Learner, the email of their Better Auth user (learners.auth_user_id -> user.email). A passcode Learner has no linked
 * user, so no email, and Settings says "Signed in with a passcode". Reads no database for a passcode Learner.
 */
export async function accountFor(db: Db, learner: Pick<Learner, "name" | "authUserId">): Promise<HeaderAccount> {
  if (!learner.authUserId) return { name: learner.name };
  const [found] = await db.select({ email: user.email }).from(user).where(eq(user.id, learner.authUserId)).limit(1);
  return found?.email ? { name: learner.name, email: found.email } : { name: learner.name };
}
