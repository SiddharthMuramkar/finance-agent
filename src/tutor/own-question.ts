/**
 * Own-question turns (spec 2026-11-12, A5; ADR 0006). No imports, so any layer can ask.
 */

/**
 * Whether a turn is an own-question turn: the Learner typed the message (not a chip, not a press of a Choice, not a
 * note code wrote), no quiz Check is open, and no conversation Check is waiting for its answer. Every other turn is
 * step-led: the Learner pressed Next, a Choice or a Quick try, or is answering a Check.
 */
export function isOwnQuestion(turn: { typed: boolean; quizOpen: boolean; conversationCheckWaiting: boolean }): boolean {
  return turn.typed && !turn.quizOpen && !turn.conversationCheckWaiting;
}

/**
 * The fallback of an own-question turn whose reply failed its checks (A4): one fixed line, followed by the open step
 * item. Never the Concept card's write-down line, which answers no question.
 */
export const OWN_QUESTION_FALLBACK = "I could not answer that properly just now. Try asking it another way.";
