import { sql, type SQL } from "drizzle-orm";
import type { BankQuestion } from "./normalise.ts";

// This module imports only packages and `normalise.ts` (with its extension), so the laptop scripts can
// run it with Node's type stripping. It writes with plain SQL for the same reason.

type Executor = { execute(query: SQL): PromiseLike<unknown> };
type Rows = { rows?: { id: string }[] } | { id: string }[];
const idsOf = (result: unknown): string[] => {
  const r = result as Rows;
  return (Array.isArray(r) ? r : (r.rows ?? [])).map((x) => x.id);
};

const BATCH = 50;

/**
 * Writes questions into the Question Bank. Re-importing an ID corrects its text and keeps it
 * verified, unless the answer key itself changed: then the earlier check no longer applies, so it is unverified again.
 */
export async function importBank(db: Executor, questions: BankQuestion[]): Promise<{ imported: number }> {
  for (let i = 0; i < questions.length; i += BATCH) {
    const rows = questions.slice(i, i + BATCH).map(
      (q) =>
        sql`(${q.id}, ${q.source}, ${q.bankTitle}, ${q.topic}, ${q.kind}, ${q.prompt}, ${q.context}, ${q.choices ? JSON.stringify(q.choices) : null}::jsonb, ${q.answer}, ${q.explanation}, ${q.licence}, ${q.credit}, ${q.sourceUrl}, ${q.upstreamReview})`,
    );
    await db.execute(sql`
      insert into question_bank (id, source, bank_title, topic, kind, prompt, context, choices, answer, explanation, licence, credit, source_url, upstream_review)
      values ${sql.join(rows, sql`, `)}
      on conflict (id) do update set
        source = excluded.source, bank_title = excluded.bank_title, topic = excluded.topic, kind = excluded.kind,
        prompt = excluded.prompt, context = excluded.context, choices = excluded.choices, explanation = excluded.explanation,
        licence = excluded.licence, credit = excluded.credit, source_url = excluded.source_url, upstream_review = excluded.upstream_review,
        verified = question_bank.verified and question_bank.answer = excluded.answer,
        verified_note = case when question_bank.answer = excluded.answer then question_bank.verified_note else null end,
        answer = excluded.answer`);
  }
  return { imported: questions.length };
}

/** Marks questions as checked by a person, with a note of how. Refuses (changing nothing) if any ID is not in the bank. */
export async function verifyBankQuestions(db: Executor, ids: string[], note: string): Promise<{ verified: number }> {
  if (!note.trim()) throw new Error("Say how the key was checked.");
  const found = new Set(idsOf(await db.execute(sql`select id from question_bank where id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`)));
  const missing = ids.filter((i) => !found.has(i));
  if (missing.length) throw new Error(`Not in the Question Bank: ${missing.join(", ")}`);
  await db.execute(sql`update question_bank set verified = true, verified_note = ${note} where id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`);
  return { verified: ids.length };
}
