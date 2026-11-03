import { currentLearnerId } from "@/auth/session";
import { getDb } from "@/db/client";
import { openCurrentTopic } from "@/learner/memory";
import { turnRunning } from "@/tutor/turn-status";

export const runtime = "nodejs";

/**
 * Home's Resume (or Start): a plain form post, so it works without scripts. It opens the Learner's current
 * Topic, whose Session then shows at once, and goes to the Study Workspace. While a turn is running nothing is
 * chosen: the Study Workspace says a turn is in progress.
 */
export async function POST(request: Request) {
  const db = getDb();
  const learnerId = await currentLearnerId();
  if (!(await turnRunning(db, new Date(), learnerId))) await openCurrentTopic(db, learnerId);
  return Response.redirect(new URL("/study", request.url), 303);
}
