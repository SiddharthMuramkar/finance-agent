import { currentLearnerId } from "@/auth/session";
import { getDb } from "@/db/client";
import { saveWidgetState, type WidgetStateRequest } from "@/learner/widget-state";

export const runtime = "nodejs";

/**
 * Saves one Widget's state (its slider values and ticked Guided Tasks) in one of the current Learner's Sessions,
 * under its Widget key; another Learner's Session answers 404. Behind the passcode (the proxy); no model call.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as WidgetStateRequest | null;
  if (!body || typeof body !== "object") return Response.json({ error: "Send a Widget's state." }, { status: 400 });
  const result = await saveWidgetState(getDb(), body, await currentLearnerId());
  return result.ok ? Response.json({ ok: true }) : Response.json({ error: result.reason }, { status: result.status });
}
