import { z } from "zod";
import { loadCourseMap } from "@/course/map";
import { currentLearnerId } from "@/auth/session";
import { getDb } from "@/db/client";
import { openCurrentTopic, saveJump, saveReturnToDefaultPath } from "@/learner/memory";
import { BUSY_MESSAGE, turnRunning } from "@/tutor/turn-status";

export const runtime = "nodejs";

/** A Topic ID to choose, null to go back to the default path, or `next: true` for what comes next (the current Topic). */
const body = z.union([z.object({ topicId: z.string().min(1).nullable() }), z.object({ next: z.literal(true) })]);

/**
 * The Learner chooses a Topic (the Course Map's Study this Topic), goes back to the default path, or takes
 * What comes next. No model call: code saves the current Topic and shows its Session at once; the page then
 * starts the opener if that Session has no messages. Refused while a turn is running for this Learner
 * ("turn in progress"), so the Tutor's tools never act on a Topic that changed under them.
 */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Send a topicId, null to go back to the default path, or next: true." }, { status: 400 });
  const db = getDb();
  const learnerId = await currentLearnerId();
  if (await turnRunning(db, new Date(), learnerId)) return Response.json({ error: BUSY_MESSAGE }, { status: 409 });
  const map = loadCourseMap();
  if ("next" in parsed.data) {
    await openCurrentTopic(db, learnerId);
    return Response.json({ ok: true });
  }
  if (parsed.data.topicId === null) {
    await saveReturnToDefaultPath(db, map, new Date(), learnerId);
    return Response.json({ ok: true });
  }
  const jump = await saveJump(db, map, parsed.data.topicId, new Date(), learnerId);
  if (!jump.ok) return Response.json({ error: jump.reason }, { status: 409 });
  return Response.json({ ok: true, unmetPrerequisites: jump.unmetPrerequisites });
}
