import { z } from "zod";
import { loadCourseMap } from "@/course/map";
import { currentLearnerId } from "@/auth/session";
import { getDb } from "@/db/client";
import { openQuiz, submitQuiz } from "@/learner/quiz";

export const runtime = "nodejs";

const body = z.object({ attemptId: z.number().int(), answers: z.record(z.string(), z.string()) });

/**
 * The quiz to show now (or null), as the workspace page shows it. No model call. Like the page, it
 * saves the attempt (its chosen questions) the first time the quiz is opened. Lets a script drive the quiz over HTTP.
 */
export async function GET() {
  return Response.json({ quiz: await openQuiz(getDb(), loadCourseMap(), new Date(), await currentLearnerId()) }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Marks one of the current Learner's quiz attempts on the server; another Learner's attempt answers 404.
 * No model call: code marks, saves the result and returns the key with the marking.
 */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Send an attempt ID and the answers." }, { status: 400 });
  const result = await submitQuiz(getDb(), loadCourseMap(), parsed.data.attemptId, parsed.data.answers, new Date(), await currentLearnerId());
  if (result.ok) return Response.json(result);
  return Response.json({ error: result.reason }, { status: result.saveFailed ? 503 : result.notFound ? 404 : 409 });
}
