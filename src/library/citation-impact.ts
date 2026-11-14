import { sql } from "drizzle-orm";
import { rowsOf, type Executor } from "./search.ts";

// Before a reload, which stored Citations point at blog passages the reload will change or remove?
// A Citation names a passage by ID and the sentences it rests on by number, so a passage whose text
// changes (a picture's text placed in it, say) can leave an old Citation marking the wrong sentence.
// Packages and `.ts` imports only, so the laptop command can run it.

export type AtRisk = {
  passageId: number;
  ref: string;
  heading: string;
  change: "changed" | "removed";
  /** The saved messages that cite this passage: the Session and the message's place in it. */
  citedBy: { sessionId: number; seq: number }[];
};

/**
 * The stored Citations whose passages the incoming passages of `sourceId` will change or remove.
 * A passage nobody has cited is left out of the list: it can change freely.
 */
export async function citationsAtRisk(db: Executor, sourceId: string, incoming: { ref: string; text: string }[]): Promise<AtRisk[]> {
  const next = new Map(incoming.map((p) => [p.ref, p.text]));
  const stored = await rowsOf<{ id: number; ref: string; heading: string; text: string }>(db, sql`select id, ref, heading, text from library_passages where source_id = ${sourceId} order by id`);
  const touched: ((typeof stored)[number] & { change: AtRisk["change"] })[] = [];
  for (const p of stored) {
    if (!next.has(p.ref)) touched.push({ ...p, change: "removed" });
    else if (next.get(p.ref) !== p.text) touched.push({ ...p, change: "changed" });
  }
  const out: AtRisk[] = [];
  for (const p of touched) {
    // The citation's source is the passage path, stored inside the message's JSON as "/passages/<id>".
    const citedBy = await rowsOf<{ sessionId: number; seq: number }>(
      db,
      sql`select session_id as "sessionId", seq from messages where content::text like ${`%"/passages/${p.id}"%`} order by session_id, seq`,
    );
    if (citedBy.length) out.push({ passageId: p.id, ref: p.ref, heading: p.heading, change: p.change, citedBy });
  }
  return out;
}
