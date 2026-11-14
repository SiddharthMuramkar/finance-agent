import { eq } from "drizzle-orm";
import { learnerState, sessions } from "@/db/schema";
import type { Db } from "@/db/types";

/**
 * Whether the Learner still gets the Welcome (spec #119, "Pages › Welcome"): only while they have no
 * Sessions, Older ones included, and have not yet chosen a Topic. Choosing one (Start this Topic on the
 * Welcome, or the Course Map) opens it in the Study Workspace, whose opener then makes the first Session;
 * from then on the Welcome never shows again.
 */
export async function showsWelcome(db: Db, learnerId: number): Promise<boolean> {
  const [session] = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.learnerId, learnerId)).limit(1);
  if (session) return false;
  const [state] = await db.select({ currentTopicId: learnerState.currentTopicId }).from(learnerState).where(eq(learnerState.learnerId, learnerId));
  return !state?.currentTopicId;
}
