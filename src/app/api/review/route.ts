import { z } from "zod";
import { loadCourseMap } from "@/course/map";
import { getDb } from "@/db/client";
import { answerReview, reviewState } from "@/learner/review";

export const runtime = "nodejs";

const body = z.object({ questionId: z.string(), choiceId: z.string() });

/** The review to show now (or none). No model call. */
export async function GET() {
  return Response.json(await reviewState(getDb(), loadCourseMap()), { headers: { "Cache-Control": "no-store" } });
}

/** Marks a review on the server, reschedules the question and returns the key. No model call. */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Send a question and a choice." }, { status: 400 });
  const result = await answerReview(getDb(), loadCourseMap(), parsed.data.questionId, parsed.data.choiceId);
  return result.ok ? Response.json(result) : Response.json({ error: result.reason }, { status: 409 });
}
