import { z } from "zod";
import { loadCourseMap } from "@/course/map";
import { getDb } from "@/db/client";
import { openQuiz, submitQuiz } from "@/learner/quiz";

export const runtime = "nodejs";

const body = z.object({ attemptId: z.number().int(), answers: z.record(z.string(), z.string()) });

/** The quiz to show now (or null), as the workspace page shows it. Reads only; no model call. Lets a script drive the quiz over HTTP. */
export async function GET() {
  return Response.json({ quiz: await openQuiz(getDb(), loadCourseMap()) }, { headers: { "Cache-Control": "no-store" } });
}

/** Marks a quiz attempt on the server. No model call: code marks, saves the result and returns the key with the marking. */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Send an attempt ID and the answers." }, { status: 400 });
  const result = await submitQuiz(getDb(), loadCourseMap(), parsed.data.attemptId, parsed.data.answers);
  return result.ok ? Response.json(result) : Response.json({ error: result.reason }, { status: 409 });
}
