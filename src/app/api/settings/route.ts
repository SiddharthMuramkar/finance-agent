import { setShowDeveloperDetails } from "@/auth/learners";
import { currentLearnerId } from "@/auth/session";
import { getDb } from "@/db/client";

export const runtime = "nodejs";

/**
 * Saves the signed-in Learner's Settings choice: `{ showDeveloperDetails: true | false }`, whether
 * each Tutor reply shows its "Under the hood" line. No model call. The passcode check is the proxy's.
 */
export async function PUT(request: Request) {
  const body = (await request.json().catch(() => null)) as { showDeveloperDetails?: unknown } | null;
  if (typeof body?.showDeveloperDetails !== "boolean") {
    return Response.json({ error: "Send showDeveloperDetails as true or false." }, { status: 400 });
  }
  await setShowDeveloperDetails(getDb(), await currentLearnerId(), body.showDeveloperDetails);
  return Response.json({ ok: true });
}
