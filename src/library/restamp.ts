import { sql } from "drizzle-orm";
import { latestYear, librarySourceInput, type Executor, type LibraryFile } from "./ingest.ts";
import { rowsOf } from "./search.ts";

// Packages and .ts-suffixed relative imports only, so scripts/library/restamp.mjs runs it from the laptop.

/** Passages read per page when re-dating. */
const PAGE = 1000;

export type RestampResult = {
  /** Source rows whose licence, licence link or credit differ from the load file. */
  sources: string[];
  /** Passages, per source, that carried the source's old licence or credit. */
  credits: Record<string, number>;
  /** Passages, per source, whose stored latest_year differs from latestYear(text). */
  years: Record<string, number>;
};

/**
 * Brings the stored Library up to date without a reload: each source's licence, licence link and
 * credit from its load-file record (scripts/library/sources.json), the passages that carried the
 * source's old licence or credit (a passage with its own keeps it), and every passage's latest_year,
 * read again from its text by latestYear(). With `write` false it only counts what would change.
 * Sources not in the database are skipped; passage text and embeddings are never touched.
 */
export async function restampLibrary(db: Executor, input: LibraryFile["source"][], { write }: { write: boolean }): Promise<RestampResult> {
  const result: RestampResult = { sources: [], credits: {}, years: {} };
  for (const s of input.map((x) => librarySourceInput.parse(x))) {
    const changedPassages = sql`p.source_id = s.id and ((p.credit = s.credit and p.credit <> ${s.credit}) or (p.licence = s.licence and p.licence <> ${s.licence}))`;
    const [{ n }] = await rowsOf<{ n: number }>(db, sql`select count(*)::integer as n from library_passages p join library_sources s on s.id = ${s.id} where ${changedPassages}`);
    const [differs] = await rowsOf<{ id: string }>(
      db,
      sql`select id from library_sources where id = ${s.id} and (licence <> ${s.licence} or licence_url <> ${s.licenceUrl} or credit <> ${s.credit})`,
    );
    if (n) result.credits[s.id] = n;
    if (differs) result.sources.push(s.id);
    if (!write) continue;
    // Passages first: they are matched on the source's old values, which the second statement replaces.
    if (n) {
      await db.execute(sql`
        update library_passages p set
          credit = case when p.credit = s.credit then ${s.credit}::text else p.credit end,
          licence = case when p.licence = s.licence then ${s.licence}::text else p.licence end
        from library_sources s where s.id = ${s.id} and ${changedPassages}`);
    }
    if (differs) await db.execute(sql`update library_sources set licence = ${s.licence}, licence_url = ${s.licenceUrl}, credit = ${s.credit} where id = ${s.id}`);
  }
  for (let last = 0; ; ) {
    const rows = await rowsOf<{ id: number; sourceId: string; text: string; year: number | null }>(
      db,
      sql`select id, source_id as "sourceId", text, latest_year as year from library_passages where id > ${last} order by id limit ${PAGE}`,
    );
    if (!rows.length) break;
    last = rows[rows.length - 1].id;
    const fixes = rows.flatMap((r) => {
      const year = latestYear(r.text);
      return year === r.year ? [] : [{ id: r.id, sourceId: r.sourceId, year }];
    });
    for (const f of fixes) result.years[f.sourceId] = (result.years[f.sourceId] ?? 0) + 1;
    if (write && fixes.length) {
      const values = sql.join(
        fixes.map((f) => sql`(${f.id}::integer, ${f.year}::integer)`),
        sql`, `,
      );
      await db.execute(sql`update library_passages p set latest_year = v.year from (values ${values}) as v(id, year) where p.id = v.id`);
    }
  }
  return result;
}
