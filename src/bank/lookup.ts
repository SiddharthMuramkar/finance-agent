import { and, eq, inArray } from "drizzle-orm";
import { isBankId, type CourseMap } from "@/course/map";
import type { KeyedQuestion, QuestionLookup } from "@/course/quiz";
import { questionBank } from "@/db/schema";
import type { Db } from "@/db/types";

/**
 * Bank questions by ID, ready to mark: only multiple-choice ones (numeric ones cannot be answered
 * from a quiz Check yet), with their credit and whether the key has been checked.
 */
export async function loadBankQuestions(db: Db, ids: string[]): Promise<Map<string, KeyedQuestion>> {
  const wanted = [...new Set(ids.filter(isBankId))];
  if (!wanted.length) return new Map();
  const rows = await db
    .select()
    .from(questionBank)
    .where(and(inArray(questionBank.id, wanted), eq(questionBank.kind, "choice")));
  return new Map(
    rows.flatMap((r) =>
      r.choices ? [[r.id, { id: r.id, prompt: r.prompt, choices: r.choices, answer: r.answer, explanation: r.explanation, credit: r.credit, verified: r.verified } satisfies KeyedQuestion] as const] : [],
    ),
  );
}

/** The Course Map's own questions plus the bank questions among `ids`, found by one lookup. */
export async function questionLookup(db: Db, map: CourseMap, ids: string[]): Promise<QuestionLookup> {
  const bank = await loadBankQuestions(db, ids);
  return { question: (id) => map.question(id) ?? bank.get(id) };
}
