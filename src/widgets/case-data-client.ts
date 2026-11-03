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

/** Loads one Case's data, as fetchCaseData does; null when there is none. */
export type CaseLoad = (caseId: string) => Promise<CaseData | null>;

/**
 * Case loads shared by everything one widget draws (its Queries and its Sourced strip): each Case is fetched
 * once however many read it, and a failed load is forgotten, so a later read tries again. Never rejects.
 * `load` defaults to the browser fetch of /api/case-data; tests pass a fake.
 */
export function caseLoader(load: CaseLoad = (caseId) => fetchCaseData(caseId)): CaseLoad {
  const cases = new Map<string, Promise<CaseData | null>>();
  return (caseId) => {
    const loaded = cases.get(caseId);
    if (loaded) return loaded;
    const loading = new Promise<CaseData | null>((resolve) => resolve(load(caseId))).then(
      (data) => data ?? null,
      () => null,
    );
    cases.set(caseId, loading);
    void loading.then((data) => {
      if (!data && cases.get(caseId) === loading) cases.delete(caseId);
    });
    return loading;
  };
}
