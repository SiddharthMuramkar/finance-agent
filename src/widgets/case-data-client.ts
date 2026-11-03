import type { CaseData } from "@/case-data/case-data";
import { CASE_DATA_REFERENCE } from "./tool-specs";

/** Splits a Case Data reference, "caseId/datasetId"; null when it is not one. */
export function splitReference(reference: string): { caseId: string; datasetId: string } | null {
  if (!CASE_DATA_REFERENCE.test(reference)) return null;
  const [caseId, datasetId] = reference.split("/");
  return { caseId, datasetId };
}

/**
 * One Case's data from the browser, through the server's as-of rule (nothing dated after the
 * Case's as-of date until its reveal has been shown). Null for an unknown Case or a failed request.
 */
export async function fetchCaseData(caseId: string, fetchImpl: typeof fetch = fetch): Promise<CaseData | null> {
  try {
    const response = await fetchImpl(`/api/case-data/${encodeURIComponent(caseId)}`);
    return response.ok ? ((await response.json()) as CaseData) : null;
  } catch {
    return null;
  }
}
