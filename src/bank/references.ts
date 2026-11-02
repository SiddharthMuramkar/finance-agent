import { sql, type SQL } from "drizzle-orm";
import { isBankId, type CourseMap } from "../course/map.ts";

// Imports only packages and relative `.ts` files, so `scripts/check-references.mjs` can run it from the
// laptop with Node's type stripping. It reads with plain SQL for the same reason.

export type CourseReferences = {
  bankQuestions: { checkId: string; id: string }[];
  caseData: { caseId: string; datasetId: string }[];
};

/** Everything the Course Map points at that lives in the database rather than in the files. Pure. */
export function courseReferences(map: CourseMap): CourseReferences {
  const bankQuestions = map.topics.flatMap((t) =>
    t.checks.flatMap((c) => (c.kind === "quiz" ? c.questions.filter(isBankId).map((id) => ({ checkId: c.id, id })) : [])),
  );
  const caseData = map.topics.flatMap((t) => t.cases.flatMap((c) => c.data.map((datasetId) => ({ caseId: c.id, datasetId }))));
  return { bankQuestions, caseData };
}

type Executor = { execute(query: SQL): PromiseLike<unknown> };
const rowsOf = <T>(result: unknown): T[] => (Array.isArray(result) ? result : ((result as { rows?: T[] }).rows ?? [])) as T[];

export type ReferenceReport = { problems: string[]; bankQuestions: number; caseData: number; unverified: number };

/**
 * The laptop check: every Question Bank ID a quiz Check lists exists (and can be answered in a quiz),
 * and every Case Data dataset a Case lists exists. Reads the database; changes nothing.
 */
export async function checkReferences(db: Executor, map: CourseMap): Promise<ReferenceReport> {
  const refs = courseReferences(map);
  const problems: string[] = [];

  const ids = [...new Set(refs.bankQuestions.map((r) => r.id))];
  const found = new Map<string, { kind: string; verified: boolean }>();
  if (ids.length) {
    const list = sql.join(ids.map((i) => sql`${i}`), sql`, `);
    for (const r of rowsOf<{ id: string; kind: string; verified: boolean }>(await db.execute(sql`select id, kind, verified from question_bank where id in (${list})`))) found.set(r.id, r);
  }
  for (const r of refs.bankQuestions) {
    const q = found.get(r.id);
    if (!q) problems.push(`Check "${r.checkId}" lists ${r.id}, which is not in the Question Bank`);
    else if (q.kind !== "choice") problems.push(`Check "${r.checkId}" lists ${r.id}, which is a ${q.kind} question and cannot be answered in a quiz Check`);
  }

  const have = new Set(rowsOf<{ case_id: string; dataset_id: string }>(await db.execute(sql`select case_id, dataset_id from case_datasets`)).map((r) => `${r.case_id}/${r.dataset_id}`));
  for (const r of refs.caseData) if (!have.has(`${r.caseId}/${r.datasetId}`)) problems.push(`Case "${r.caseId}" lists Case Data "${r.datasetId}", which is not in the database`);

  return { problems, bankQuestions: ids.length, caseData: refs.caseData.length, unverified: [...found.values()].filter((q) => !q.verified).length };
}
