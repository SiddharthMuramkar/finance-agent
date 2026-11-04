import { and, asc, eq, inArray } from "drizzle-orm";
import { isConverted, type CourseMap, type Topic } from "@/course/map";
import { practiceAnswers } from "@/db/schema";
import type { Db } from "@/db/types";
import { isFluent } from "@/teaching/ladder";
import { skillStates } from "./skill-state";

/**
 * Known-mistake hits (spec #229, "Known mistakes"): a marked answer that matched a slip the Topic file predicts is logged
 * in `practice_answers` with the slip's tag. The Topic Note lists each distinct slip once, with its fix line, and the
 * Learner summary says in plain words which slips a Skill has had. Both read only converted Topics, and skip the query
 * when the Course Map has none, so nothing touches the practice tables before they exist in production.
 */

/** One distinct Known mistake a Learner made in a Topic. */
export type MistakeHit = { topicId: string; skillId: string; tag: string; times: number; fix: string | null };

/** How each engine slip reads in a sentence. Any other tag reads as its words with the underscores taken out. */
const PLAIN: Record<string, string> = {
  stopped_at_points: "stopped at points",
  used_x10: "multiplied by 10 instead of 100",
  divided_by_10: "divided by 10 instead of 100",
  divided_by_1000: "divided by 1,000 instead of 100",
  forgot_to_convert: "forgot to convert",
  mixed_percent_points: "mixed up percent and points",
};

/** A slip's tag in plain words, never the tag id itself. */
export const plainSlip = (tag: string): string => PLAIN[tag] ?? tag.replace(/[_-]+/g, " ");

/** The fix line the Topic file gives a Known mistake tag: a template's, a quiz choice's or a fixed Quick try's. */
export function fixLineFor(topic: Topic, tag: string): string | null {
  for (const t of topic.templates) for (const m of t.mistakes) if (m.tag === tag) return m.fix;
  for (const q of topic.questions) for (const c of q.choices) if (c.mistake?.tag === tag) return c.mistake.fix;
  for (const check of topic.checks) for (const q of check.quickTries) if ("mistakes" in q) for (const m of q.mistakes ?? []) if (m.tag === tag) return m.fix;
  return null;
}

/** Whether any Topic on the map is converted: the only case in which the practice tables are read at all. */
export const anyConverted = (map: CourseMap): boolean => map.topics.some(isConverted);

/** The distinct Known mistakes this Learner has made, per Topic, in the order they first happened. Converted Topics only. */
export async function mistakeHits(db: Db, map: CourseMap, learnerId: number, topicIds?: string[]): Promise<MistakeHit[]> {
  const converted = map.topics.filter((t) => isConverted(t) && (!topicIds || topicIds.includes(t.id)));
  if (!converted.length) return [];
  const rows = await db
    .select({ topicId: practiceAnswers.topicId, skillId: practiceAnswers.skillId, tag: practiceAnswers.mistakeTag })
    .from(practiceAnswers)
    .where(and(eq(practiceAnswers.learnerId, learnerId), eq(practiceAnswers.verdict, "known_mistake"), inArray(practiceAnswers.topicId, converted.map((t) => t.id))))
    .orderBy(asc(practiceAnswers.id));
  const hits = new Map<string, MistakeHit>();
  for (const r of rows) {
    if (!r.tag) continue;
    const key = `${r.topicId}\u0000${r.skillId}\u0000${r.tag}`;
    const seen = hits.get(key);
    if (seen) seen.times += 1;
    else hits.set(key, { topicId: r.topicId, skillId: r.skillId, tag: r.tag, times: 1, fix: fixLineFor(map.topic(r.topicId)!, r.tag) });
  }
  return [...hits.values()];
}

const times = (n: number) => (n === 1 ? "" : n === 2 ? "twice " : `${n} times `);

/**
 * One plain line per Skill that has hits: the Skill's rule, what the slips were, and whether the Skill is fluent now.
 * Never a tag id, so the Tutor cannot repeat one to the Learner.
 */
export async function mistakeAccounts(db: Db, map: CourseMap, learnerId: number, topicIds: string[]): Promise<string[]> {
  const hits = await mistakeHits(db, map, learnerId, topicIds);
  const lines: string[] = [];
  const done = new Set<string>();
  for (const { topicId, skillId } of hits) {
    if (done.has(`${topicId}/${skillId}`)) continue;
    done.add(`${topicId}/${skillId}`);
    const topic = map.topic(topicId)!;
    const rule = topic.skills.find((s) => s.id === skillId)?.rule.replace(/\.$/, "") ?? skillId.replace(/[_-]+/g, " ");
    const slips = hits.filter((h) => h.topicId === topicId && h.skillId === skillId).map((h) => `${times(h.times)}${plainSlip(h.tag)}`);
    const state = (await skillStates(db, learnerId, topicId))[skillId];
    lines.push(`${rule}: ${slips.join(", ")}; ${state && isFluent(state) ? "fluent now" : "still practising"}`);
  }
  return lines;
}
