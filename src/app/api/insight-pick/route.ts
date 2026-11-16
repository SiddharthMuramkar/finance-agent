import { z } from "zod";
import { currentLearnerId } from "@/auth/session";
import { loadCourseMap } from "@/course/map";
import { getDb } from "@/db/client";
import { answerInsightPick } from "@/learner/insight";

export const runtime = "nodejs";

const body = z.object({ choice: z.string().min(1).max(100) });

/**
 * Marks the choice the current Learner tapped on the explore step's Insight question (`{ choice }`; ticket #88, ADR 0020),
 * with no model call. The reply is `{ ok, released, fix?, hint?, written? }`: the page shows the fix and the hint, or the
 * written Insight once it is found or told, and re-reads the Learner's place so Next can finish explore. 404 when no
 * Insight to tap is being explored, 409 once it is settled.
 */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Send the choice you tapped." }, { status: 400 });
  const result = await answerInsightPick(getDb(), loadCourseMap(), await currentLearnerId(), parsed.data.choice, new Date());
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result);
}
