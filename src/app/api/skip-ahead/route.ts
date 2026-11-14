import { z } from "zod";
import { currentLearnerId } from "@/auth/session";
import { loadCourseMap } from "@/course/map";
import { getDb } from "@/db/client";
import { startSkipAhead, submitSkipAhead } from "@/learner/skip-ahead";
import { BUSY_MESSAGE, turnRunning } from "@/tutor/turn-status";

export const runtime = "nodejs";

const start = z.object({ topicId: z.string().min(1).max(200) });
const submission = z.object({ attemptId: z.number().int(), answers: z.record(z.string(), z.string().max(40)) });

/**
 * Skip ahead (spec 2026-11-12 A8): the Topic Start card's "I know this: quiz me". `{ topicId }` opens today's quiz for the
 * current Learner's current Topic (or reopens it, unanswered) and returns its questions without their key; `{ attemptId,
 * answers }` marks it on the server and, with at most one miss, passes the whole Topic, returning the marking and What
 * comes next. No model call. Refused while a turn is running for this Learner, so the Tutor's tools never act on a Topic
 * that was passed under them; 409 after today's attempt, 404 for another Learner's attempt, 503 without its table.
 */
export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const opening = start.safeParse(json);
  const answering = submission.safeParse(json);
  if (!opening.success && !answering.success) return Response.json({ error: "Send a topicId, or an attempt ID and the answers." }, { status: 400 });
  const db = getDb();
  const learnerId = await currentLearnerId();
  const now = new Date();
  if (await turnRunning(db, now, learnerId)) return Response.json({ error: BUSY_MESSAGE }, { status: 409 });
  const map = loadCourseMap();
  const result = opening.success
    ? await startSkipAhead(db, map, opening.data.topicId, now, learnerId)
    : await submitSkipAhead(db, map, answering.data!.attemptId, answering.data!.answers, now, learnerId);
  if (!result.ok) return Response.json({ error: result.reason }, { status: result.status });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
