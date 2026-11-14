import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { REFERENCE_CASE, REFERENCE_DATASET_IDS } from "./reference.ts";

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

/** Rows per insert: 4 parameters each, far under the driver's 65,535-parameter limit. */
const CHUNK = 2000;

/**
 * Writes checked datasets into the database. Re-importing a dataset replaces its description and its points, so an
 * import file can be corrected and run again. Points are upserted first, in chunks, and only then are the dates
 * missing from the new set deleted, so a failure part-way leaves the old points in place.
 */
export async function importCaseData(db: Executor, input: CaseDatasetInput[]): Promise<{ datasets: number; points: number }> {
  const datasets = z.array(caseDatasetInput).parse(input);
  const unknown = datasets.filter((d) => d.caseId === REFERENCE_CASE && !REFERENCE_DATASET_IDS.includes(d.id));
  if (unknown.length) {
    throw new Error(
      `Unknown reference dataset ${unknown.map((d) => `"${REFERENCE_CASE}/${d.id}"`).join(", ")}. The allowed ids are: ${REFERENCE_DATASET_IDS.join(", ")}.`,
    );
  }
  let points = 0;
  for (const d of datasets) {
    await db.execute(sql`
      insert into case_datasets (case_id, dataset_id, label, unit, source, source_url, checked_on, check_note)
      values (${d.caseId}, ${d.id}, ${d.label}, ${d.unit}, ${d.source}, ${d.sourceUrl}, ${d.checkedOn}, ${d.checkNote})
      on conflict (case_id, dataset_id) do update set
        label = excluded.label, unit = excluded.unit, source = excluded.source, source_url = excluded.source_url,
        checked_on = excluded.checked_on, check_note = excluded.check_note`);
    for (let i = 0; i < d.points.length; i += CHUNK) {
      const rows = d.points.slice(i, i + CHUNK).map((p) => sql`(${d.caseId}, ${d.id}, ${p.date}, ${p.value})`);
      await db.execute(sql`
        insert into case_data_points (case_id, dataset_id, date, value) values ${sql.join(rows, sql`, `)}
        on conflict (case_id, dataset_id, date) do update set value = excluded.value`);
    }
    // One parameter however many dates: the new set travels as a JSON array.
    const keep = JSON.stringify(d.points.map((p) => p.date));
    await db.execute(sql`
      delete from case_data_points where case_id = ${d.caseId} and dataset_id = ${d.id}
        and date not in (select (jsonb_array_elements_text(${keep}::jsonb))::date)`);
    points += d.points.length;
  }
  return { datasets: datasets.length, points };
}
