import { NextResponse } from "next/server";
import { sameOrigin } from "@/auth/same-origin";
import { currentLearner } from "@/auth/session";
import { loadCourseMap } from "@/course/map";
import { getDb } from "@/db/client";
import { saveJump } from "@/learner/memory";
import { RESTART_CONFIRM, restartTopic } from "@/learner/restart";
import { turnRunning } from "@/tutor/turn-status";

export const runtime = "nodejs";

const text = (message: string, status: number) => new NextResponse(message, { status, headers: { "content-type": "text/plain" } });

/**
 * Start this Topic over, after its confirmation: snapshots and clears the signed-in Learner's progress for
 * the Topic, turns its live Session into an Earlier attempt, makes the Topic current and opens the Study
 * Workspace (303). The Learner comes only from the sign-in cookie, never from the request, so a Learner can
 * restart only their own Topic. A second submit finds nothing to restart and changes nothing. A plain form
 * post, only from this site, never a GET.
 */
export async function POST(request: Request, { params }: { params: Promise<{ topicId: string }> }) {
  if (!sameOrigin(request)) return text("Start a Topic over must come from this site.", 403);
  const learner = await currentLearner();
  if (!learner) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const form = await request.formData().catch(() => null);
  if (form?.get("confirm") !== RESTART_CONFIRM) return NextResponse.json({ error: "Confirm starting this Topic over first." }, { status: 400 });
  const { topicId } = await params;
  const map = loadCourseMap();
  if (!map.topic(topicId)) return NextResponse.json({ error: "No such Topic." }, { status: 404 });
  const db = getDb();
  if (await turnRunning(db, new Date(), learner.id)) return NextResponse.json({ error: "A turn is running" }, { status: 409 });
  const result = await restartTopic(db, map, learner.id, topicId);
  if (result.restarted) console.info(`Restart: Learner ${learner.id} started Topic ${topicId} over (restart ${result.restartId})`);
  await saveJump(db, map, topicId, new Date(), learner.id);
  return NextResponse.redirect(new URL("/study", request.url), 303);
}

/** Starting a Topic over is never a GET, so link prefetching or a crawler can't do it. */
export async function GET() {
  return new NextResponse(null, { status: 405, headers: { allow: "POST" } });
}
