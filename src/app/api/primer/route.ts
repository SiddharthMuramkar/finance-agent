import { z } from "zod";
import { currentLearnerId } from "@/auth/session";
import { getDb } from "@/db/client";
import { passPrimer } from "@/tutor/primer-items";

export const runtime = "nodejs";

const body = z.object({ key: z.string().min(1).max(200) });

/**
 * "I know this" on a Primer (spec 2026-11-12, C3): `{ key }`, its Quick try's key, marks the current Learner's Primer
 * passed over, so it draws folded from now on. No model call, and the Topic's place does not move. 404 for a key that
 * is not one of their Primers. The Primer's Quick try itself is answered through /api/quick-try like any other.
 */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Send the Primer's key." }, { status: 400 });
  const ok = await passPrimer(getDb(), await currentLearnerId(), parsed.data.key);
  return ok ? Response.json({ ok: true }) : Response.json({ error: "That Primer does not exist." }, { status: 404 });
}
