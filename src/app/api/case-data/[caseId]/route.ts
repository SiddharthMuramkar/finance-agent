import { caseData } from "@/course/case-data";
import { loadCourseMap } from "@/course/map";
import { getDb } from "@/db/client";
import { loadProgress } from "@/learner/memory";

export const runtime = "nodejs";

/** A Case's sourced figures for widgets, under the hindsight rule. No model call. */
export async function GET(_request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const figures = caseData(loadCourseMap(), await loadProgress(getDb()), caseId);
  if (!figures) return Response.json({ error: "Unknown Case" }, { status: 404 });
  return Response.json(figures, { headers: { "Cache-Control": "no-store" } });
}
