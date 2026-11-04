import { z } from "zod";
import { currentLearnerId } from "@/auth/session";
import { loadCourseMap } from "@/course/map";
import { getDb } from "@/db/client";
import { answerQuickTry, oneMoreFromOffer, parkFromOffer } from "@/tutor/practice";

export const runtime = "nodejs";

const skill = z.string().min(1).max(100);
const body = z.union([
  z.object({ key: z.string().min(1).max(200), input: z.string().max(100) }),
  // The park offer's buttons (ticket #245): each works once.
  z.object({ park: skill }),
  z.object({ oneMore: skill }),
]);

/**
 * Marks the current Learner's answer to one of their Quick tries (spec #229, ticket #243), with no model call. It
 * answers 409 while one of their turns runs and 404 for a key that is not theirs. The reply is `{ ok, items, followUp }`:
 * the page appends the items, and with `followUp` starts a `{ quickTryFollowUp: true }` turn. It also takes the park
 * offer's two buttons (ticket #245): `{ park: skillId }` parks the Skill for 20 hours and `{ oneMore: skillId }` posts
 * one more Quick try on it now; each answers `{ ok, items, followUp: false }`, or 404 once the offer is used.
 */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Send the Quick try's key and an answer." }, { status: 400 });
  const db = getDb();
  const map = loadCourseMap();
  const learnerId = await currentLearnerId();
  const now = new Date();
  const data = parsed.data;
  const result =
    "park" in data
      ? await parkFromOffer(db, map, learnerId, data.park, now)
      : "oneMore" in data
        ? await oneMoreFromOffer(db, map, learnerId, data.oneMore, now)
        : await answerQuickTry(db, map, learnerId, data.key, data.input, now);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json("followUp" in result ? result : { ...result, followUp: false });
}
