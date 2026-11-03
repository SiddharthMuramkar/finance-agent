// How the owner's test tools (scripts/simulated-learner.mjs and the live runs) drive the app as a Learner now does:
// choosing a Topic (the page then starts the opener), Next, Finish this reply, or a typed message. Nothing here
// sends Continue: that button is gone. No imports, so Node can load this file straight from a script.

/** What the Learner does next. */
export type LearnerMove =
  /** Chose the Topic: its Session shows, and the page starts the opener (a Tutor turn with no Learner message). */
  | { kind: "opener" }
  /** Pressed Finish this reply under a reply cut off at its length limit. */
  | { kind: "finish" }
  /** Pressed the Next chip; `step` is the step it is tried with first (a refusal names the one on offer). */
  | { kind: "next"; step: string }
  /** Typed a reply to the Tutor. */
  | { kind: "message" };

/** Where the Learner stands after the last turn. */
export type LearnerView = {
  /** No turn has run yet in this run. */
  first: boolean;
  /** The last reply was cut off at its length limit. */
  cutShort: boolean;
  /** A quiz was just taken (code marked it; the Tutor has not spoken since). */
  afterQuiz: boolean;
  /** The Tutor's last reply. */
  tutorText: string;
  /** The Learner's current Teaching Step. */
  step: string;
};

/** The Learner's next move: the opener first, Finish this reply after a cut-off, Next when there is nothing to answer, else a reply. */
export function nextMove(view: LearnerView): LearnerMove {
  if (view.first) return { kind: "opener" };
  if (view.cutShort) return { kind: "finish" };
  if (view.afterQuiz || !view.tutorText.trim()) return { kind: "next", step: view.step };
  return { kind: "message" };
}

/** The /api/turn body for a move; a message move sends the Learner's typed words. */
export function turnBody(move: LearnerMove, message = ""): Record<string, unknown> {
  if (move.kind === "opener") return { opener: true };
  if (move.kind === "finish") return { finish: true };
  if (move.kind === "next") return { next: move.step };
  return { message };
}

/** A reply that only says to go on: a Learner now presses Next instead of typing it. */
export const saysGoOn = (reply: string) => /^ok(ay)?[,.]?\s+go on[.!]?$/i.test(reply.trim());

/** The step a refused Next says is on offer (`Next names "concept", not "story".`), or null when no Next is on offer. */
export function nextNamedIn(refusal: string): string | null {
  return /Next names "([a-z_]+)"/.exec(refusal)?.[1] ?? null;
}
