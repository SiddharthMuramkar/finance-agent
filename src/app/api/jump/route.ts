import { z } from "zod";
import { loadCourseMap } from "@/course/map";
import { currentLearnerId } from "@/auth/session";
import { getDb } from "@/db/client";
import { saveJump, saveReturnToDefaultPath } from "@/learner/memory";
import { BUSY_MESSAGE, latestTurn, STALE_RUN_MS } from "@/tutor/turn-status";

export const runtime = "nodejs";

/** A Topic ID to jump to, or null to go back to the default path. */
const body = z.object({ topicId: z.string().min(1).nullable() });

/**
 * The Learner chooses a Topic on the Course Map page, or goes back to the default path. No model
 * call: code saves the current Topic, and the next turn picks up there. Refused while a turn is
 * running for this Learner, so the Tutor's tools never act on a Topic that changed under them.
 */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Send a topicId, or null to go back to the default path." }, { status: 400 });
  const db = getDb();
  const learnerId = await currentLearnerId();
  const turn = await latestTurn(db, learnerId);
  if (turn?.status === "running" && Date.now() - turn.startedAt.getTime() < STALE_RUN_MS) return Response.json({ error: BUSY_MESSAGE }, { status: 409 });
  const map = loadCourseMap();
  if (parsed.data.topicId === null) {
    await saveReturnToDefaultPath(db, map, new Date(), learnerId);
    return Response.json({ ok: true });
  }
  const jump = await saveJump(db, map, parsed.data.topicId, new Date(), learnerId);
  if (!jump.ok) return Response.json({ error: jump.reason }, { status: 409 });
  return Response.json({ ok: true, unmetPrerequisites: jump.unmetPrerequisites });
}
