import { LADDER, nextMove, type AnswerEvent, type Method, type SkillState } from "@/teaching/ladder";
import type { ReplyKind } from "./reply-checks";
import { isCodeWritten } from "./turn-status";

/**
 * What code does on the repair ladder after a code-marked answer (spec #229, "Repair ladder and Reply kinds"; ticket
 * #245). `src/teaching/ladder.ts` decides the move; this turns it into code's action and the plain-words note the Tutor
 * gets. No database: callers record the method with `noteMethodUsed` and store the items.
 *
 * The note is written and read back here, side by side. A turn's note (turns.input) is the only record of the method
 * and Reply kind code chose for it: code reads them back for the Reply kind the turn's facts give and the reply checks
 * record, for the items it posts after a re-teach, and on a Retry. Old turns hold these exact words (ladder-notes.test.ts
 * pins them), so they never change.
 */

export type LadderAction =
  /** Right, or a first miss: the usual feedback. */
  | { kind: "feedback" }
  /** Second miss in a row: code starts a follow-up turn that teaches the Skill again with `method`. */
  | { kind: "reteach"; method: Method; replyKind: RungKind; note: string }
  /** Third miss in a row, and every one after: code shows the park offer, with no Tutor turn. */
  | { kind: "park_offer" };

/** The Reply kind of a re-teach rung: a worked example (the long cap), a drill, or a re-teach. */
export type RungKind = Extract<ReplyKind, "reteach" | "drill" | "worked_example">;

/** The Reply kinds a note names in one line with no method: feedback after a miss, and the park offer after a third. */
export type LineKind = Extract<ReplyKind, "feedback" | "offer_park">;

/** Every Reply kind a ladder note can name. */
export type NoteKind = RungKind | LineKind;

const LINE_KINDS: readonly LineKind[] = ["feedback", "offer_park"];

/**
 * Each rung of the ladder: its Reply kind; its plain name, which the Tutor's context gives ("Method for this reply");
 * the name its note gives; and what to do, in plain words. The Tutor never sees an id.
 */
const RUNGS: Record<Method, { replyKind: RungKind; name: string; noteName: string; words: string }> = {
  restate: {
    replyKind: "reteach",
    name: "restate the rule",
    noteName: "restate",
    words: "restate the rule in new words, with new numbers. No new analogy.",
  },
  worked: {
    replyKind: "worked_example",
    name: "a worked example",
    noteName: "worked example",
    words: "a worked example with new numbers, step by step. No new analogy.",
  },
  boxes: {
    replyKind: "reteach",
    name: "a half-done choice",
    noteName: "boxes",
    words:
      "a half-done choice. Code posts a half-done try after your reply, with its first step shown and the last step a tap. In your reply, name the slip in one sentence and write no question of your own. Explain nothing else.",
  },
  widget: {
    replyKind: "reteach",
    name: "the Widget in practice mode",
    noteName: "widget",
    words: "the Widget. Code has opened it in practice mode; say in one sentence what to move and what to watch.",
  },
  drill5: {
    replyKind: "drill",
    name: "a choice drill of five",
    noteName: "drill",
    words: "a choice drill of five. Code posts five tap-to-choose tries one at a time; add one sentence and no question of your own.",
  },
};

/** The plain name of a method, as the Tutor's context gives it. */
export const methodName = (method: Method): string => RUNGS[method].name;

/** The note lines for a re-teach: "Reply kind: …" and "Method: …", in plain words (a worked example's kind is written "worked example"). */
export function reteachNote(method: Method): string {
  const { replyKind, noteName, words } = RUNGS[method];
  return `Reply kind: ${replyKind.replace("_", " ")}\nMethod: ${noteName}, ${words}`;
}

/** The note line for feedback or the park offer: "Reply kind: feedback." */
export const kindLine = (kind: LineKind): string => `Reply kind: ${kind}.`;

/** What a turn's note names: the Reply kind, and for a re-teach its method. */
export type NoteRead = { replyKind: RungKind; method: Method } | { replyKind: LineKind; method?: undefined };

/**
 * The Reply kind and method a turn's note names, or null when it names none. A re-teach's lines are found wherever they
 * are (a quiz note carries them after its own); a one-line kind only in a note code wrote, since a Learner could type it.
 */
export function readNote(note: string | null | undefined): NoteRead | null {
  if (!note) return null;
  for (const m of LADDER) if (note.includes(reteachNote(m))) return { replyKind: RUNGS[m].replyKind, method: m };
  if (!isCodeWritten(note)) return null;
  const kind = LINE_KINDS.find((k) => new RegExp(`Reply kind: ${k}\\b`).test(note));
  return kind ? { replyKind: kind } : null;
}

/** The method a re-teach note names, read back from the turn's note. */
export function methodInNote(note: string | null | undefined): Method | null {
  return readNote(note)?.method ?? null;
}

/** Code's action for the state after the answer (what `recordAnswer` returns) and the answer itself. */
export function ladderAction(after: SkillState, event: AnswerEvent): LadderAction {
  const move = nextMove(after, event);
  if (move.offerPark) return { kind: "park_offer" };
  if (move.method) return { kind: "reteach", method: move.method, replyKind: RUNGS[move.method].replyKind, note: reteachNote(move.method) };
  return { kind: "feedback" };
}
