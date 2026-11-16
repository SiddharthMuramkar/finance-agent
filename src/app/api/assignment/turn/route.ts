import { checkBotId } from "botid/server";
import { z } from "zod";
import { currentTurnTaker } from "@/auth/session";
import { loadCourseMap } from "@/course/map";
import { getDb } from "@/db/client";
import { runAssignmentTurn } from "@/tutor/assignment-turn";
import { tutorClient } from "@/tutor/tutor-client";

export const runtime = "nodejs";
export const maxDuration = 120;

const body = z.object({ message: z.string().trim().min(1).max(2000) });

/**
 * One Tutor Turn in the Assignment (spec #68, ticket #110): the Learner's message about their Own Case, answered in one
 * checked reply. 403 before the Spine is passed, 409 while another turn runs, 429 past a daily Spend cap (quota.ts).
 * A turn BotID calls a bot gets a 403 `{ error: "bot" }` and never starts, as on /api/turn.
 */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Write a message for the Tutor." }, { status: 400 });
  if ((await checkBotId({ developmentOptions: { bypass: "HUMAN" } })).isBot) return Response.json({ error: "bot" }, { status: 403 });
  const { learnerId, admin } = await currentTurnTaker();
  const result = await runAssignmentTurn({ db: getDb(), client: tutorClient(), learnerId, admin, map: loadCourseMap() }, parsed.data.message);
  return result.ok ? Response.json({ reply: result.reply }) : Response.json({ error: result.error, ...(result.status === 429 && { limit: true }) }, { status: result.status });
}
