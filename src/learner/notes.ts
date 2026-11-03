import { and, asc, eq, inArray } from "drizzle-orm";
import type { CourseMap, Topic } from "@/course/map";
import { insightAttempts, misconceptions, noteItems, topicProgress } from "@/db/schema";
import type { Db } from "@/db/types";
import { splitMarkers } from "@/finance/formula-markers";
import { formulaById } from "@/finance/formulas";
import { loadSaved, type SavedItem } from "./saved";

/**
 * Topic Notes. The filled-in part of a note is built on read, by code with no model call, from the
 * current Topic file and the Learner's records, and only once the Topic is passed. The Learner's own
 * lines are the only thing stored (table note_items).
 */

export const MAX_LINE_LENGTH = 2000;

/** One Formula Card on a note: the registry formula with its example numbers. */
export type NoteFormula = { formulaId: string; values: Record<string, number> };

/** What the Learner's records say about a Topic's Insight, once it is settled. */
export type NoteInsight = {
  /** The Learner's exact words from the attempt that settled it. */
  ownWords: string;
  /** Set only when the Tutor had to tell it: the written Insight, shown beside the Learner's words. */
  written?: string;
};

export type FilledNote = {
  formulas: NoteFormula[];
  insight?: NoteInsight;
  principle: string;
  connections: { text: string; titles: string[] }[];
  mistakes: string[];
};

export type TopicNote = {
  topicId: string;
  title: string;
  stage: Topic["stage"];
  passed: boolean;
  /** Present only once the Topic is passed. */
  filled?: FilledNote;
  lines: NoteLine[];
  /** Replies and Widgets the Learner saved from a lesson; shown whether or not the Topic is passed. */
  saved: SavedItem[];
};

export type NoteLine = { id: number; text: string; createdAt: Date; updatedAt: Date };

/** The Learner's records a note is built from. */
export type NoteRecords = {
  passed: boolean;
  /** The attempt that settled the Insight, if one did. */
  settled?: { released: "found" | "told"; words: string };
  mistakes: string[];
};

/** A formula's example numbers for a note: the first marker in the Topic's own text that names it, else the registry's working example. */
function exampleValues(topic: Topic, formulaId: string): Record<string, number> {
  const texts = [topic.concept, topic.principle, ...topic.cases.flatMap((c) => [c.story, c.reveal]), ...topic.connections.map((c) => c.text)];
  for (const text of texts) {
    for (const s of splitMarkers(text)) if (s.kind === "formula" && s.formulaId === formulaId) return s.values;
  }
  return formulaById(formulaId)?.example ?? {};
}

/** The filled-in part of a Topic Note. Pure: the same Topic file and records always give the same note. */
export function buildFilledNote(topic: Topic, records: NoteRecords): FilledNote {
  const insight: NoteInsight | undefined =
    topic.insight && records.settled
      ? { ownWords: records.settled.words, ...(records.settled.released === "told" ? { written: topic.insight.written } : {}) }
      : undefined;
  return {
    formulas: topic.formulas.map((formulaId) => ({ formulaId, values: exampleValues(topic, formulaId) })),
    insight,
    principle: topic.principle,
    connections: topic.connections.map((c) => ({ text: c.text, titles: c.titles })),
    mistakes: records.mistakes,
  };
}

/** Every Topic in course order with its note: the filled-in part for a passed Topic, and the Learner's own lines. */
export async function loadNotes(db: Db, map: CourseMap): Promise<TopicNote[]> {
  const [progress, attempts, noticed, items, saved] = await Promise.all([
    db.select().from(topicProgress),
    db.select().from(insightAttempts).where(inArray(insightAttempts.released, ["found", "told"])).orderBy(asc(insightAttempts.id)),
    db.select().from(misconceptions).orderBy(asc(misconceptions.id)),
    db.select().from(noteItems).where(eq(noteItems.kind, "line")).orderBy(asc(noteItems.id)),
    loadSaved(db, map),
  ]);
  return map.topics.map((topic) => {
    const passed = progress.find((p) => p.topicId === topic.id)?.status === "passed";
    const settledRow = attempts.find((a) => a.topicId === topic.id);
    const records: NoteRecords = {
      passed,
      settled: settledRow ? { released: settledRow.released as "found" | "told", words: settledRow.words } : undefined,
      mistakes: noticed.filter((m) => m.topicId === topic.id).map((m) => m.description),
    };
    return {
      topicId: topic.id,
      title: topic.title,
      stage: topic.stage,
      passed,
      filled: passed ? buildFilledNote(topic, records) : undefined,
      lines: items
        .filter((i) => i.topicId === topic.id && i.text !== null)
        .map((i) => ({ id: i.id, text: i.text as string, createdAt: i.createdAt, updatedAt: i.updatedAt })),
      saved: saved.get(topic.id) ?? [],
    };
  });
}

export type LineResult = { ok: true; line: NoteLine } | { ok: false; reason: string; status: 400 | 404 };

function cleanLine(text: string): { ok: true; text: string } | { ok: false; reason: string; status: 400 } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: "Write something first.", status: 400 };
  if (trimmed.length > MAX_LINE_LENGTH) return { ok: false, reason: `A line can be at most ${MAX_LINE_LENGTH} characters.`, status: 400 };
  return { ok: true, text: trimmed };
}

/** Adds the Learner's own line to a Topic's note. Any Topic of the Course Map takes lines, passed or not. */
export async function addLine(db: Db, map: CourseMap, topicId: string, text: string, now = new Date()): Promise<LineResult> {
  if (!map.topic(topicId)) return { ok: false, reason: "That Topic is not on the Course Map.", status: 404 };
  const clean = cleanLine(text);
  if (!clean.ok) return clean;
  const [row] = await db.insert(noteItems).values({ topicId, kind: "line", text: clean.text, createdAt: now, updatedAt: now }).returning();
  return { ok: true, line: { id: row.id, text: clean.text, createdAt: row.createdAt, updatedAt: row.updatedAt } };
}

/** Changes the words of one of the Learner's own lines. Only a line can be edited. */
export async function editLine(db: Db, id: number, text: string, now = new Date()): Promise<LineResult> {
  const clean = cleanLine(text);
  if (!clean.ok) return clean;
  const [row] = await db
    .update(noteItems)
    .set({ text: clean.text, updatedAt: now })
    .where(and(eq(noteItems.id, id), eq(noteItems.kind, "line")))
    .returning();
  if (!row) return { ok: false, reason: "That line does not exist.", status: 404 };
  return { ok: true, line: { id: row.id, text: clean.text, createdAt: row.createdAt, updatedAt: row.updatedAt } };
}

/** Deletes one of the Learner's own lines. Returns false when there was no such line. */
export async function removeLine(db: Db, id: number): Promise<boolean> {
  const rows = await db
    .delete(noteItems)
    .where(and(eq(noteItems.id, id), eq(noteItems.kind, "line")))
    .returning({ id: noteItems.id });
  return rows.length > 0;
}
