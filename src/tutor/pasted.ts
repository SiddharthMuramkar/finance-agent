import { and, asc, eq, isNull } from "drizzle-orm";
import { pastedTexts } from "@/db/schema";
import type { Db } from "@/db/types";

/**
 * Pasted text: what the Learner pastes into the workspace (the part of a piece being studied, such
 * as a Zitron article, which the Library never holds). It is saved with the turn that sent it and
 * that turn's Session, and reaches the Tutor only as a marked text block appended to the Learner's
 * message. Nothing here writes to the Library or to a file. Every paste belongs to the Learner who sent
 * it, and is listed for that Learner only.
 */

/** Starts the text block that carries a paste, so the Tutor, the transcript and tests can tell it apart. */
export const PASTE_PREFIX = "Pasted by the Learner (the text they are studying; you have seen only this):";

/** The most a single paste may hold, so one paste cannot swamp the conversation. */
export const MAX_PASTE_WORDS = 4000;

/** What the Learner's message says when they paste without typing anything. */
export const PASTE_MESSAGE = "Here is the passage we are studying.";

export type Paste = typeof pastedTexts.$inferSelect;

export const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** Saves the paste a Learner's turn carries. A retry of the same turn keeps the first one. */
export async function savePaste(db: Db, turnId: number, text: string, now: Date, learnerId: number): Promise<void> {
  await db.insert(pastedTexts).values({ learnerId, turnId, text, words: wordCount(text), createdAt: now }).onConflictDoNothing({ target: pastedTexts.turnId });
}

/** The paste a turn carries, if any; it is tied to the turn's Session the first time the turn picks one. */
export async function pasteForTurn(db: Db, turnId: number, sessionId: number, learnerId: number): Promise<Paste | undefined> {
  const thisTurn = and(eq(pastedTexts.learnerId, learnerId), eq(pastedTexts.turnId, turnId));
  await db
    .update(pastedTexts)
    .set({ sessionId })
    .where(and(thisTurn, isNull(pastedTexts.sessionId)));
  const [row] = await db.select().from(pastedTexts).where(thisTurn);
  return row;
}

/** Everything this Learner pasted in one Session, oldest first. */
export async function loadPastes(db: Db, sessionId: number, learnerId: number): Promise<Paste[]> {
  return db
    .select()
    .from(pastedTexts)
    .where(and(eq(pastedTexts.learnerId, learnerId), eq(pastedTexts.sessionId, sessionId)))
    .orderBy(asc(pastedTexts.id));
}

/** What the Tutor has seen pasted in a Session: how many passages and words. */
export type PasteSummary = { count: number; words: number };

export async function pasteSummary(db: Db, sessionId: number | null | undefined, learnerId: number): Promise<PasteSummary> {
  if (!sessionId) return { count: 0, words: 0 };
  const rows = await loadPastes(db, sessionId, learnerId);
  return { count: rows.length, words: rows.reduce((n, r) => n + r.words, 0) };
}

/** The text block that carries a paste in the Learner's message. */
export const pasteBlock = (text: string) => ({ type: "text" as const, text: `${PASTE_PREFIX}\n${text}` });

/** How a paste shows in the transcript: a short label, not the whole text. */
export function pasteLabel(blockText: string): string {
  const text = blockText.slice(PASTE_PREFIX.length).trim();
  const words = text.split(/\s+/).filter(Boolean);
  return `(Pasted passage, ${words.length} words: "${words.slice(0, 6).join(" ")} …")`;
}
