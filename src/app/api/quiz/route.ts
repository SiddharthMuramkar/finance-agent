import { z } from "zod";
import { loadCourseMap } from "@/course/map";
import { currentLearnerId } from "@/auth/session";
import { getDb } from "@/db/client";
import { openQuiz, retryQuiz } from "@/learner/quiz";
import { submitQuizAnswers } from "@/tutor/check-results";

export const runtime = "nodejs";

const submission = z.object({ attemptId: z.number().int(), answers: z.record(z.string(), z.string()) });
const retry = z.object({ retry: z.literal(true) });

/**
 * The quiz open now (or null). No model call. It saves the attempt (its chosen questions) when none is open, so
 * a script driving the quiz over HTTP gets the next attempt after a miss here; the page makes it only on Try again.
 */
export async function GET() {
  return Response.json({ quiz: await openQuiz(getDb(), loadCourseMap(), new Date(), await currentLearnerId()) }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Marks one of the current Learner's quiz attempts on the server; another Learner's attempt answers 404.
 * No model call: code marks, saves the result and its result card (`item`, for the page to draw), and returns
 * the key with the marking. `{ retry: true }` is Try Check <k> again: it makes and returns the next attempt.
 */
export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const learnerId = await currentLearnerId();
  if (retry.safeParse(json).success) {
    const quiz = await retryQuiz(getDb(), loadCourseMap(), new Date(), learnerId);
    return quiz ? Response.json({ quiz }) : Response.json({ error: "No quiz Check is open." }, { status: 409 });
  }
  const parsed = submission.safeParse(json);
  if (!parsed.success) return Response.json({ error: "Send an attempt ID and the answers." }, { status: 400 });
  const result = await submitQuizAnswers(getDb(), loadCourseMap(), parsed.data.attemptId, parsed.data.answers, new Date(), learnerId);
  if (result.ok) return Response.json(result);
  return Response.json({ error: result.reason }, { status: result.saveFailed ? 503 : result.notFound ? 404 : 409 });
}
