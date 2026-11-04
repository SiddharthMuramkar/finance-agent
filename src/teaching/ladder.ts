/**
 * The repair ladder (spec #229, "Repair ladder and Reply kinds" and "Parking"; ticket #232). A pure policy: it maps a
 * Skill's state and the Learner's latest answer to what comes next, so code chooses the Reply kind and the teaching
 * method, never the Tutor. It reads and writes nothing; `src/learner/skill-state.ts` stores the state.
 *
 * The ladder runs only on answers code marks (Quick tries and quiz questions), never on conversation Checks.
 */

/** A way of teaching one Skill again: restate the rule, a worked example, fill-in boxes, the Skill's Widget, a drill of five. */
export type Method = "restate" | "worked" | "boxes" | "widget" | "drill5";

/** The methods in the order the ladder climbs them, the same for every Topic. */
export const LADDER: readonly Method[] = ["restate", "worked", "boxes", "widget", "drill5"];

/** One Learner's progress on one Skill of a Topic. */
export interface SkillState {
  tries: number;
  right: number;
  /** Right answers in a row. */
  streak: number;
  /** Misses in a row, across Quick tries and quiz questions alike; a right answer sets it back to 0. */
  missesInRow: number;
  /** The tag of the last Known mistake the Learner made on this Skill, kept after later answers. */
  lastMistake: string | null;
  /** The methods used to teach it again, oldest first. */
  methodsUsed: Method[];
  /** Set when the Learner parks the Skill: the drill of five comes back after this time. */
  parkedUntil: Date | null;
}

/** A marked answer: right, a Known mistake (with its tag), or some other wrong answer. */
export type AnswerEvent = { verdict: "right" } | { verdict: "known_mistake"; tag: string } | { verdict: "wrong" };

/**
 * What comes next. `replyKind` is the Reply kind code sends; `method` is set when it re-teaches (`reteach`, or
 * `drill` for the drill-of-five rung). `quick_try` is never chosen here: it is the Reply kind for "One more short
 * try", which the Learner picks after a park offer.
 */
export interface NextMove {
  replyKind: "feedback" | "quick_try" | "reteach" | "offer_park" | "drill";
  method: Method | null;
  offerPark: boolean;
  /** The Skill is fluent after this answer (two right in a row). */
  fluent: boolean;
}

/** How long a parked Skill waits before it comes back as a drill. */
export const PARK_HOURS = 20;

/** A Skill the Learner has not answered yet. */
export function freshSkillState(): SkillState {
  return { tries: 0, right: 0, streak: 0, missesInRow: 0, lastMistake: null, methodsUsed: [], parkedUntil: null };
}

/** The state after one more answer. A right answer adds to the streak and resets misses in a row; a miss does the opposite. */
export function applyAnswer(s: SkillState, e: AnswerEvent): SkillState {
  const next = { ...s, methodsUsed: [...s.methodsUsed], tries: s.tries + 1 };
  if (e.verdict === "right") return { ...next, right: s.right + 1, streak: s.streak + 1, missesInRow: 0 };
  return { ...next, streak: 0, missesInRow: s.missesInRow + 1, lastMistake: e.verdict === "known_mistake" ? e.tag : s.lastMistake };
}

/** Two right in a row. */
export function isFluent(s: SkillState): boolean {
  return s.streak >= 2;
}

/**
 * Your turn is done once every Skill of the Check is fluent. Pass a state for every Skill of the Check
 * (`freshSkillState()` for one not answered yet). A Check with no Skills is not decided here, so it is never done.
 */
export function yourTurnDone(states: SkillState[]): boolean {
  return states.length > 0 && states.every(isFluent);
}

/**
 * The method for the next re-teach: the first ladder method not used yet. Once all five are used, the one after the
 * method used last, round the ladder, so the same method never comes twice in a row.
 */
function nextMethod(used: readonly Method[]): Method {
  const unused = LADDER.find((m) => !used.includes(m));
  if (unused) return unused;
  const last = LADDER.indexOf(used[used.length - 1]);
  return LADDER[(last + 1) % LADDER.length];
}

/**
 * What comes next, given the Skill's state after the answer was applied (what `applyAnswer` and `recordAnswer`
 * return) and the answer itself:
 * - right: feedback (and whether the Skill is now fluent);
 * - first miss: feedback, that is one slip, one fix and one new try;
 * - second miss in a row: re-teach with the next method on the ladder (a drill for the drill-of-five rung);
 * - third miss in a row, and every one after it: offer to park.
 * The caller records the method once the Tutor has used it (`noteMethodUsed`).
 */
export function nextMove(s: SkillState, e: AnswerEvent): NextMove {
  const fluent = isFluent(s);
  if (e.verdict === "right" || s.missesInRow <= 1) return { replyKind: "feedback", method: null, offerPark: false, fluent };
  if (s.missesInRow === 2) {
    const method = nextMethod(s.methodsUsed);
    return { replyKind: method === "drill5" ? "drill" : "reteach", method, offerPark: false, fluent };
  }
  return { replyKind: "offer_park", method: null, offerPark: true, fluent };
}

/** When a Skill parked now comes back: 20 hours later. */
export function parkUntil(now: Date): Date {
  return new Date(now.getTime() + PARK_HOURS * 60 * 60 * 1000);
}

/** The Skill is parked and its time has passed, so the Topic opens on a drill of five. */
export function drillDue(s: SkillState, now: Date): boolean {
  return s.parkedUntil !== null && now.getTime() >= s.parkedUntil.getTime();
}
