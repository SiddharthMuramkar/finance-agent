import { and, eq, inArray } from "drizzle-orm";
import { isBankId, type CourseMap } from "@/course/map";
import { instanceQuestion, parseTemplateInstanceId, type KeyedQuestion, type QuestionLookup } from "@/course/quiz";
import { drawTemplate } from "@/teaching";
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

/**
 * The Course Map's own questions, the bank questions among `ids`, and the template instances among `ids`
 * (`<templateId>#<seed>`), found by one lookup. An instance is rebuilt from its seed, so open, marking, the note and
 * the Check tab all see the same numbers. A bare template ID is not an instance (the next attempt's numbers are not
 * drawn yet), and an instance whose template is gone is not found, like a removed question.
 */
export async function questionLookup(db: Db, map: CourseMap, ids: string[]): Promise<QuestionLookup> {
  const bank = await loadBankQuestions(db, ids);
  const instances = new Map<string, KeyedQuestion>();
  for (const id of new Set(ids)) {
    const parsed = parseTemplateInstanceId(id);
    const template = parsed && map.template(parsed.templateId);
    if (!parsed || !template) continue;
    try {
      instances.set(id, instanceQuestion(id, drawTemplate(template, parsed.seed, {})));
    } catch {
      // A template that can no longer be drawn counts as a removed question.
    }
  }
  return { question: (id) => map.question(id) ?? bank.get(id) ?? instances.get(id) };
}
