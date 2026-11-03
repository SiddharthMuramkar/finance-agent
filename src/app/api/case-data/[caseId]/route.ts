import { caseDataResponse } from "@/case-data/case-data";
import { loadCourseMap } from "@/course/map";
import { getDb } from "@/db/client";

export const runtime = "nodejs";

/** A Case's sourced datasets for widgets, under the as-of rule. No model call. */
export async function GET(_request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  return caseDataResponse(getDb(), loadCourseMap(), caseId);
}
