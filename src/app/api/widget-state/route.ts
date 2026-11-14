import { after } from "next/server";
import { currentLearnerId } from "@/auth/session";
import { getDb } from "@/db/client";
import { oneWriteDb } from "@/db/one-write";
import { recordSaveTime, saveOverBudget } from "@/learner/widget-save-timing";
import { saveWidgetState, type WidgetStateRequest } from "@/learner/widget-state";

export const runtime = "nodejs";

/**
 * Saves one Widget's state (its slider values and ticked Guided Tasks) in one of the current Learner's Sessions,
 * under its Widget key; another Learner's Session answers 404. Behind the passcode (the proxy); no model call.
 * The write is one statement on its own connection path (oneWriteDb), so it never waits for a Tutor turn (A9).
 *
 * Each save is timed from the request's arrival to its answer (A9: 0.5 s at the median, 1 s at the 95th percentile). The
 * time goes back in a Server-Timing header, and a save over 0.5 s is recorded after the answer is sent (`after`), so
 * recording never slows the save it measures.
 */
export async function POST(request: Request) {
  const start = performance.now();
  const body = (await request.json().catch(() => null)) as WidgetStateRequest | null;
  if (!body || typeof body !== "object") return Response.json({ error: "Send a Widget's state." }, { status: 400 });
  const learnerId = await currentLearnerId();
  const result = await saveWidgetState(oneWriteDb(), body, learnerId);
  const ms = performance.now() - start;
  const headers = { "Server-Timing": `save;dur=${ms.toFixed(1)}` };
  if (!result.ok) return Response.json({ error: result.reason }, { status: result.status, headers });
  if (saveOverBudget(ms) !== "none") {
    const record = () => recordSaveTime(getDb(), { learnerId, sessionId: Number(body.sessionId), widgetKey: String(body.widgetKey), ms });
    // After the answer is sent; outside a request (a test calling the handler) there is no `after`, so it just runs.
    try {
      after(record);
    } catch {
      void record().catch(() => {});
    }
  }
  return Response.json({ ok: true }, { headers });
}
