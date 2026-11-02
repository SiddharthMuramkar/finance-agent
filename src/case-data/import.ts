import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";

// This module imports only packages (no "@/" paths), so `scripts/import-case-data.mjs` can run it
// with Node's type stripping from the laptop. It writes with plain SQL for the same reason.

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "lowercase words joined by hyphens");

/** One checked dataset of a Case, as the laptop import file holds it. */
export const caseDatasetInput = z
  .object({
    caseId: slug,
    id: slug,
    label: z.string().min(1),
    unit: z.string().min(1),
    /** The credit line shown beside the data. */
    source: z.string().min(1),
    sourceUrl: z.url(),
    checkedOn: z.iso.date(),
    /** How the figures were checked against the source. */
    checkNote: z.string().min(1),
    points: z.array(z.object({ date: z.iso.date(), value: z.number().finite() })).min(1),
  })
  .refine((d) => new Set(d.points.map((p) => p.date)).size === d.points.length, {
    message: "a date is repeated in points",
  });

export type CaseDatasetInput = z.input<typeof caseDatasetInput>;

type Executor = { execute(query: SQL): PromiseLike<unknown> };

/**
 * Writes checked datasets into the database. Re-importing a dataset replaces its
 * description and all of its points, so an import file can be corrected and run again.
 */
export async function importCaseData(db: Executor, input: CaseDatasetInput[]): Promise<{ datasets: number; points: number }> {
  const datasets = z.array(caseDatasetInput).parse(input);
  let points = 0;
  for (const d of datasets) {
    await db.execute(sql`
      insert into case_datasets (case_id, dataset_id, label, unit, source, source_url, checked_on, check_note)
      values (${d.caseId}, ${d.id}, ${d.label}, ${d.unit}, ${d.source}, ${d.sourceUrl}, ${d.checkedOn}, ${d.checkNote})
      on conflict (case_id, dataset_id) do update set
        label = excluded.label, unit = excluded.unit, source = excluded.source, source_url = excluded.source_url,
        checked_on = excluded.checked_on, check_note = excluded.check_note`);
    await db.execute(sql`delete from case_data_points where case_id = ${d.caseId} and dataset_id = ${d.id}`);
    const rows = d.points.map((p) => sql`(${d.caseId}, ${d.id}, ${p.date}, ${p.value})`);
    await db.execute(sql`insert into case_data_points (case_id, dataset_id, date, value) values ${sql.join(rows, sql`, `)}`);
    points += d.points.length;
  }
  return { datasets: datasets.length, points };
}
