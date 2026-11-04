import { z } from "zod";
import { currentLearnerId } from "@/auth/session";
import { loadCourseMap } from "@/course/map";
import { getDb } from "@/db/client";
import { answerQuickTry } from "@/tutor/practice";

export const runtime = "nodejs";

const body = z.object({ key: z.string().min(1).max(200), input: z.string().max(100) });

/**
 * Marks the current Learner's answer to one of their Quick tries (spec #229, ticket #243), with no model call. It
 * answers 409 while one of their turns runs and 404 for a key that is not theirs. The reply is `{ ok, items, followUp }`:
 * the page appends the items, and with `followUp` starts a `{ quickTryFollowUp: true }` turn.
 */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Send the Quick try's key and an answer." }, { status: 400 });
  const result = await answerQuickTry(getDb(), loadCourseMap(), await currentLearnerId(), parsed.data.key, parsed.data.input, new Date());
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result);
}
