import { currentLearnerId } from "@/auth/session";
import { getDb } from "@/db/client";
import { loadProfile, profileInput, saveProfile } from "@/learner/profile";

export const runtime = "nodejs";

/** The current Learner's saved Learner Profile. No model call. The passcode check is the proxy's. */
export async function GET() {
  return Response.json(await loadProfile(getDb(), await currentLearnerId()), { headers: { "Cache-Control": "no-store" } });
}

/**
 * Saves the Learner Profile (all four answers; an empty one means "not shared"). The next turn sends
 * the Tutor the changed profile in a new Where the Learner stands block; nothing already sent changes.
 */
export async function PUT(request: Request) {
  const parsed = profileInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Send work, location, loan and savingFor as text." }, { status: 400 });
  }
  await saveProfile(getDb(), parsed.data, new Date(), await currentLearnerId());
  return Response.json({ ok: true });
}
