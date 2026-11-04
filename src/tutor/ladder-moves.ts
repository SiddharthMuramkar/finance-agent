import { nextMove, type AnswerEvent, type Method, type SkillState } from "@/teaching/ladder";

/**
 * What code does on the repair ladder after a code-marked answer (spec #229, "Repair ladder and Reply kinds"; ticket
 * #245). `src/teaching/ladder.ts` decides the move; this turns it into code's action and the plain-words note the Tutor
 * gets. No database: callers record the method with `noteMethodUsed` and store the items.
 */

export type LadderAction =
  /** Right, or a first miss: the usual feedback. */
  | { kind: "feedback" }
  /** Second miss in a row: code starts a follow-up turn that teaches the Skill again with `method`. */
  | { kind: "reteach"; method: Method; replyKind: "reteach" | "drill"; note: string }
  /** Third miss in a row, and every one after: code shows the park offer, with no Tutor turn. */
  | { kind: "park_offer" };

/** Each rung in plain words, for the Tutor. The Tutor never sees an id. */
const METHOD_WORDS: Record<Method, string> = {
  restate: "restate the rule in new words, with new numbers. No new analogy.",
  worked: "a worked example with new numbers, step by step. No new analogy.",
  boxes: "fill-in boxes. Code has posted a half-done try with the first step shown; help the Learner fill the next box, no new explanation.",
  widget: "the Widget. Code has opened it in practice mode; say in one sentence what to move and what to watch.",
  drill5: "a drill of five. Code posts five short tries one at a time; add one sentence and one ask.",
};

/** The note lines for a re-teach: "Reply kind: reteach" and "Method: …", in plain words. */
export function reteachNote(method: Method): string {
  const kind = method === "drill5" ? "drill" : "reteach";
  const name = method === "drill5" ? "drill" : method === "worked" ? "worked example" : method;
  return `Reply kind: ${kind}\nMethod: ${name}, ${METHOD_WORDS[method]}`;
}

/** Code's action for the state after the answer (what `recordAnswer` returns) and the answer itself. */
export function ladderAction(after: SkillState, event: AnswerEvent): LadderAction {
  const move = nextMove(after, event);
  if (move.offerPark) return { kind: "park_offer" };
  if (move.method) return { kind: "reteach", method: move.method, replyKind: move.method === "drill5" ? "drill" : "reteach", note: reteachNote(move.method) };
  return { kind: "feedback" };
}
