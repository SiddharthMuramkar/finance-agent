import { loadCourseMap } from "@/course/map";
import { currentLearnerId } from "@/auth/session";
import { getDb } from "@/db/client";
import type { Db } from "@/db/types";
import { openCurrentTopic, saveJump } from "@/learner/memory";
import { liveSession, saveShownSession } from "@/tutor/session-log";
import { turnRunning } from "@/tutor/turn-status";

export const runtime = "nodejs";

/**
 * A Progress row: an unpassed Topic becomes the current Topic and its Session shows at once; a passed
 * Topic (read-only, it can't be chosen) has its own Session shown, as after the turn that passed it, and
 * the current Topic stays as it was. A passed Topic with no Session of its own (passed in an Older session,
 * before one Session per Topic) goes to the Notebook, as its Course Map row does, and nothing changes.
 * Returns where the Learner goes.
 */
async function openTopic(db: Db, learnerId: number, topicId: string): Promise<"/study" | "/notebook"> {
  const map = loadCourseMap();
  const jump = await saveJump(db, map, topicId, new Date(), learnerId);
  if (jump.ok || !map.topic(topicId)) return "/study";
  const session = await liveSession(db, learnerId, topicId);
  if (!session) return "/notebook";
  await saveShownSession(db, learnerId, session.id);
  return "/study";
}

/**
 * Home's Resume (or Start), and Progress rows: plain form posts, so they work without scripts. With no
 * `topic` field it opens the Learner's current Topic; with one it opens that Topic. Either way the Session
 * then shows at once and the Learner goes to the Study Workspace (or, for a Topic passed in an Older session,
 * to the Notebook). While a turn is running nothing is chosen: the Study Workspace says a turn is in progress.
 */
export async function POST(request: Request) {
  const db = getDb();
  const learnerId = await currentLearnerId();
  const form = await request.formData().catch(() => null);
  const topic = form?.get("topic");
  let to: "/study" | "/notebook" = "/study";
  if (!(await turnRunning(db, new Date(), learnerId))) {
    if (typeof topic === "string" && topic) to = await openTopic(db, learnerId, topic);
    else await openCurrentTopic(db, learnerId);
  }
  return Response.redirect(new URL(to, request.url), 303);
}
