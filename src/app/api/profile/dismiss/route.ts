import { getDb } from "@/db/client";
import { dismissProfileOffer } from "@/learner/profile";

export const runtime = "nodejs";

/** "Not now" on the first-visit card: the card is never offered again. No model call. */
export async function POST() {
  await dismissProfileOffer(getDb());
  return Response.json({ ok: true });
}
