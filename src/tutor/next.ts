import type { CourseMap } from "@/course/map";
import { navigate, nextOffer, STEP_NAMES, takeNext, type NextOffer, type TeachingStep } from "@/course/navigator";
import type { Db } from "@/db/types";
import { loadProgress, saveFinishedStep } from "@/learner/memory";
import { pendingQuizNote } from "@/learner/quiz";
import { topicCompleteContext } from "./context";
import { liveSession } from "./session-log";
import { saveItemAfterLatest, stepDivider, type SessionItem } from "./session-items";
import { NEXT_PREFIX, updateTurn } from "./turn-status";

/**
 * The Learner's Next: the chip under the latest Tutor reply, and what pressing it does. Code checks the
 * move against the Course Navigator's rules (never past a Check without a saved pass, never past an
 * unsettled Explore), advances, stores the step divider and saves a code-written note as the turn's input;
 * the Tutor Turn then teaches the new step from that note, freshly (the pacing rule keeps the step open).
 */

/** What a Next names: the step on its chip, or "complete" for Complete this Topic. */
export type NextName = TeachingStep | "complete";

/**
 * Whether the Learner's current step in a Topic has begun, i.e. a Tutor turn has taught it. A step reached
 * outside a Tutor turn has not: a quiz pass marked by code moves the Learner on, and the step it reached
 * waits until the Tutor next hears of the pass.
 */
export async function stepBegun(db: Db, map: CourseMap, learnerId: number, topicId: string): Promise<boolean> {
  return !(await pendingQuizNote(db, map, learnerId, topicId))?.passed;
}

/** The Next chip the Learner is offered now, or null (a Check is open, or every Topic is passed). */
export async function nextOfferNow(db: Db, map: CourseMap, learnerId: number): Promise<NextOffer | null> {
  const progress = await loadProgress(db, learnerId);
  const place = navigate(map, progress);
  if (!place) return null;
  return nextOffer(map, progress, { begun: await stepBegun(db, map, learnerId, place.topic.id) });
}

export type TakenNext = { ok: true; note: string; sessionId: number; item: SessionItem | null } | { ok: false; reason: string };

/**
 * Takes the Learner's Next inside their turn's lock, all in one transaction: checks it is the Next on offer,
 * advances (or, for a step not yet begun, stays), stores the divider after the Session's latest message, and
 * saves the turn's note, Session and fresh pacing. Nothing is saved when it is refused.
 */
export async function takeLearnersNext(db: Db, map: CourseMap, learnerId: number, turnId: number, named: NextName, now: Date): Promise<TakenNext> {
  return db.transaction(async (transaction) => {
    const tx = transaction as unknown as Db;
    const progress = await loadProgress(tx, learnerId);
    const place = navigate(map, progress);
    // Next is offered only under a Tutor reply, so the Topic's Session already exists.
    const session = place ? await liveSession(tx, learnerId, place.topic.id) : undefined;
    if (!place || !session) return { ok: false, reason: "There is no Next to take." };
    const begun = await stepBegun(tx, map, learnerId, place.topic.id);
    const move = takeNext(map, progress, named, { begun });
    if (!move.ok) return move;
    // takeNext accepted it, so the offer is a Next or Complete this Topic, never Just tell me.
    const offer = nextOffer(map, progress, { begun }) as Exclude<NextOffer, { kind: "just_tell_me" }>;
    const advances = offer.kind === "complete" || offer.advances;
    if (advances) {
      const saved = await saveFinishedStep(tx, map, place.step, now, learnerId);
      if (!saved.ok) return saved;
    }
    // Complete this Topic passes it: no next step, so no divider (its Topic complete card marks that).
    const item = move.teach ? stepDivider(map, await loadProgress(tx, learnerId), place.topic.id) : null;
    if (item) await saveItemAfterLatest(tx, learnerId, session.id, item, now);
    const note =
      offer.kind === "complete"
        ? `${NEXT_PREFIX} the Learner pressed Complete this Topic. ${topicCompleteContext(place.topic.title)}`
        : nextNote(offer.step, offer.advances);
    // The Session is pinned on the turn, so a Retry of Complete this Topic still runs in the passed Topic's Session.
    await updateTurn(tx, turnId, { input: note, sessionId: session.id, freshStep: true });
    return { ok: true, note, sessionId: session.id, item };
  });
}

/** The note for a Next that names a step: what code did, and that the Tutor teaches the step now and can't finish it in this reply. */
function nextNote(step: TeachingStep, advanced: boolean): string {
  const name = STEP_NAMES[step];
  const how = advanced
    ? `Code moved them on to the ${name} step.`
    : `They reached the ${name} step outside a Tutor turn (code recorded a quiz pass), so it has not begun; code did not move them on.`;
  return `${NEXT_PREFIX} the Learner pressed Next: ${name}, and has written nothing. ${how} Nothing of this step has been taught yet: teach it now, then stop and wait for the Learner. You cannot finish this step, record a Check verdict or record an Insight attempt in this reply.`;
}
