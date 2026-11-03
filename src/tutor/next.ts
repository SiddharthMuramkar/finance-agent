import type { CourseMap } from "@/course/map";
import { navigate, nextOffer, STEP_NAMES, takeNext, type NextOffer, type TeachingStep } from "@/course/navigator";
import type { Db } from "@/db/types";
import { loadProgress, saveFinishedStep } from "@/learner/memory";
import { pendingQuizNote } from "@/learner/quiz";
import { topicCompleteContext } from "./context";
import { comingBackItems, DUE_CHECK, storeComingBack } from "./coming-back";
import { liveSession } from "./session-log";
import { stepDivider, type SessionItem } from "./session-items";
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
 * waits until the Tutor next hears of the pass; and a Due Check reopening a passed Topic (its divider not yet
 * stored) starts a step nothing has taught. `comingBack` is what `comingBackItems` gives now.
 */
async function stepBegun(db: Db, map: CourseMap, learnerId: number, topicId: string, comingBack: SessionItem[]): Promise<boolean> {
  if (comingBack.some((i) => i.kind === DUE_CHECK)) return false;
  return !(await pendingQuizNote(db, map, learnerId, topicId))?.passed;
}

/** The Next chip the Learner is offered now, or null (a Check is open, or every Topic is passed). */
export async function nextOfferNow(db: Db, map: CourseMap, learnerId: number, now: Date): Promise<NextOffer | null> {
  const progress = await loadProgress(db, learnerId);
  const place = navigate(map, progress);
  if (!place) return null;
  const comingBack = await comingBackItems(db, map, learnerId, now);
  return nextOffer(map, progress, { begun: await stepBegun(db, map, learnerId, place.topic.id, comingBack) });
}

/** `items` are the dividers it stored, in order: a coming-back divider the page drew (if any), then the step's. */
export type TakenNext = { ok: true; note: string; sessionId: number; items: SessionItem[] } | { ok: false; reason: string };

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
    // The Picking up or Due Check divider the page drew, worked out before the move: it is stored with this Next, first.
    const comingBack = await comingBackItems(tx, map, learnerId, now);
    const begun = await stepBegun(tx, map, learnerId, place.topic.id, comingBack);
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
    const items = [...comingBack, ...(item ? [item] : [])];
    await storeComingBack(tx, learnerId, session.id, items, now);
    const note =
      offer.kind === "complete"
        ? `${NEXT_PREFIX} the Learner pressed Complete this Topic. ${topicCompleteContext(place.topic.title)}`
        : nextNote(offer.step, offer.advances);
    // The Session is pinned on the turn, so a Retry of Complete this Topic still runs in the passed Topic's Session.
    await updateTurn(tx, turnId, { input: note, sessionId: session.id, freshStep: true });
    return { ok: true, note, sessionId: session.id, items };
  });
}

/** The note for a Next that names a step: what code did, and that the Tutor teaches the step now and can't finish it in this reply. */
function nextNote(step: TeachingStep, advanced: boolean): string {
  const name = STEP_NAMES[step];
  const how = advanced
    ? `Code moved them on to the ${name} step.`
    : `They reached the ${name} step outside a Tutor turn (after a quiz pass, or a Check added to a Topic they had passed), so it has not begun; code did not move them on.`;
  return `${NEXT_PREFIX} the Learner pressed Next: ${name}, and has written nothing. ${how} Nothing of this step has been taught yet: teach it now, then stop and wait for the Learner. You cannot finish this step, record a Check verdict or record an Insight attempt in this reply.`;
}
