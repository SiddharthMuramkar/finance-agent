import { eq } from "drizzle-orm";
import { learnerState } from "@/db/schema";
import { isConverted, type CourseMap } from "@/course/map";
import { finishFromWidget, navigate, nextOffer, practiceStep, STEP_NAMES, stepSetting, takeNext, type NextOffer, type ParkedSkills, type Place, type Progress, type TeachingStep } from "@/course/navigator";
import type { Db } from "@/db/types";
import { loadProgress, saveFinishedStep } from "@/learner/memory";
import { parkedSkills } from "@/learner/skill-state";
import { loadWidgetStates } from "@/learner/widget-state";
import { topicCompleteContext } from "./context";
import { comingBackItems, storeComingBack } from "./coming-back";
import { liveSession } from "./session-log";
import type { SessionItem } from "./session-items";
import { stepTaught } from "./pacing";
import { NEXT_PREFIX, updateTurn } from "./turn-status";
import { storeStepDivider } from "./practice";

/**
 * The Learner's Next: the chip under the latest Tutor reply, and what pressing it does. Code checks the
 * move against the Course Navigator's rules (never past a Check without a saved pass, never past an
 * unsettled Explore), advances, stores the step divider and saves a code-written note as the turn's input;
 * the Tutor Turn then teaches the new step from that note, freshly (the pacing rule keeps the step open).
 */

/** What a Next names: the step on its chip, or "complete" for Complete this Topic. */
export type NextName = TeachingStep | "complete";

/** The Next chip the Learner is offered now, or null (a Check is open, or every Topic is passed). */
export async function nextOfferNow(db: Db, map: CourseMap, learnerId: number, now: Date): Promise<NextOffer | null> {
  const progress = await loadProgress(db, learnerId);
  const place = navigate(map, progress);
  if (!place) return null;
  const comingBack = await comingBackItems(db, map, learnerId, now);
  return nextOffer(map, progress, { begun: await stepTaught(db, map, learnerId, place.topic.id, comingBack) }, await parkedIn(db, map, learnerId, progress));
}

/**
 * The parked Skills of the Learner's current Topic, so no Next is offered or taken while one of its Check's Skills is
 * parked (ticket #245). Only a converted Topic reads skill_state.
 */
async function parkedIn(db: Db, map: CourseMap, learnerId: number, progress: Progress): Promise<ParkedSkills> {
  const topic = navigate(map, progress)?.topic;
  return topic && isConverted(topic) ? parkedSkills(db, learnerId, [topic.id]) : {};
}

/**
 * Takes a row lock on the Learner's state for the rest of the transaction, so two writers that move the same Learner's
 * progress (a Next, and the study page finishing a step from a Widget) run one after the other. The second then reads the
 * progress the first saved and finds its step already finished, so a step divider is never stored twice.
 */
async function lockLearner(tx: Db, learnerId: number): Promise<void> {
  await tx.select({ id: learnerState.id }).from(learnerState).where(eq(learnerState.learnerId, learnerId)).for("update");
}

/** `items` are what it stored, in order: a coming-back divider the page drew (if any), then the step's divider and what entering the step shows. */
export type TakenNext = { ok: true; note: string; sessionId: number; items: SessionItem[] } | { ok: false; reason: string };

/**
 * Takes the Learner's Next inside their turn's lock, all in one transaction: checks it is the Next on offer,
 * advances (or, for a step not yet begun, stays), stores the divider after the Session's latest message, and
 * saves the turn's note, Session and fresh pacing. Nothing is saved when it is refused.
 */
export async function takeLearnersNext(db: Db, map: CourseMap, learnerId: number, turnId: number, named: NextName, now: Date): Promise<TakenNext> {
  return db.transaction(async (transaction) => {
    const tx = transaction as unknown as Db;
    await lockLearner(tx, learnerId);
    const progress = await loadProgress(tx, learnerId);
    const place = navigate(map, progress);
    // Next is offered only under a Tutor reply, so the Topic's Session already exists.
    const session = place ? await liveSession(tx, learnerId, place.topic.id) : undefined;
    if (!place || !session) return { ok: false, reason: "There is no Next to take." };
    // The Picking up or Due Check divider the page drew, worked out before the move: it is stored with this Next, first.
    const comingBack = await comingBackItems(tx, map, learnerId, now);
    const begun = await stepTaught(tx, map, learnerId, place.topic.id, comingBack);
    const parked = await parkedIn(tx, map, learnerId, progress);
    const move = takeNext(map, progress, named, { begun }, parked);
    if (!move.ok) return move;
    // takeNext accepted it, so the offer is a Next or Complete this Topic, never Just tell me.
    const offer = nextOffer(map, progress, { begun }, parked) as Exclude<NextOffer, { kind: "just_tell_me" }>;
    const advances = offer.kind === "complete" || offer.advances;
    if (advances) {
      const saved = await saveFinishedStep(tx, map, place.step, now, learnerId);
      if (!saved.ok) return saved;
    }
    await storeComingBack(tx, learnerId, session.id, comingBack, now);
    // Complete this Topic passes it: no next step, so no divider (its Topic complete card marks that). The step that
    // begins opens its Widget by itself (the Topic's `steps[].opens`), and a converted step shows what code shows on
    // entering it: the Concept card and its Widget, or the first Quick try.
    const items = [...comingBack, ...(move.teach ? await storeStepDivider(tx, map, learnerId, session.id, place.topic.id, now, { opensWidget: true }) : [])];
    // Entering can finish a converted Your turn at once (its Skills are already fluent), so the note reads the progress after it.
    const entered = await loadProgress(tx, learnerId);
    const note =
      offer.kind === "complete"
        ? `${NEXT_PREFIX} the Learner pressed Complete this Topic. ${topicCompleteContext(place.topic.title)}`
        : nextNote(offer.step, offer.advances, navigate(map, entered));
    // The Session is pinned on the turn, so a Retry of Complete this Topic still runs in the passed Topic's Session.
    await updateTurn(tx, turnId, { input: note, sessionId: session.id, freshStep: true });
    return { ok: true, note, sessionId: session.id, items };
  });
}

/**
 * A step that finishes from what the Learner did in a Widget: when the saved Widget state of the current Topic's Session
 * meets the current step's `doneWhen`, the Course Navigator finishes the step, and code stores the new step's divider and
 * opens its Widget. Returns the items it stored (none when the condition is not met). Called by the Study Workspace page
 * (src/app/study/page.tsx) on each render, from the Widget state saved so far, not when that state is saved. No Tutor
 * reply follows the divider yet, so Pacing (pacing.ts) reads the new step as not taught until one does.
 * Never finishes explore, a Check or the principle (finishFromWidget), so no Widget can settle the Insight early (ADR 0001).
 */
export async function finishStepFromWidget(db: Db, map: CourseMap, learnerId: number, now: Date): Promise<SessionItem[]> {
  // Most steps have no Widget condition: leave them without opening a transaction.
  const here = navigate(map, await loadProgress(db, learnerId));
  if (!here || !stepSetting(here.topic, here.step, here.check)?.doneWhen) return [];
  return db.transaction(async (transaction) => {
    const tx = transaction as unknown as Db;
    await lockLearner(tx, learnerId);
    const progress = await loadProgress(tx, learnerId);
    const place = navigate(map, progress);
    const session = place ? await liveSession(tx, learnerId, place.topic.id) : undefined;
    if (!place || !session) return [];
    const move = finishFromWidget(map, progress, await loadWidgetStates(tx, session.id, learnerId));
    if (!move.ok) return [];
    const saved = await saveFinishedStep(tx, map, place.step, now, learnerId);
    if (!saved.ok) return [];
    return storeStepDivider(tx, map, learnerId, session.id, place.topic.id, now, { opensWidget: true });
  });
}

/** The note for a Next that names a step: what code did, and that the Tutor teaches the step now and can't finish it in this reply. */
function nextNote(step: TeachingStep, advanced: boolean, place: Place | null): string {
  const name = STEP_NAMES[step];
  const onward = place && place.step !== step && advanced ? place.step : null;
  const how = onward
    ? `Code moved them on to the ${name} step, and it finished on entry because their Skills are already fluent, so they are now at the ${STEP_NAMES[onward]} step.`
    : advanced
    ? `Code moved them on to the ${name} step.`
    : `They reached the ${name} step outside a Tutor turn (after a quiz pass, or a Check added to a Topic they had passed), so it has not begun; code did not move them on.`;
  step = onward ?? step;
  const converted = place && place.step === step && isConverted(place.topic) ? place : null;
  const teach =
    converted && step === "concept" && converted.check?.card
      ? "Code has shown this step's Concept card and its Widget: add one sentence and one ask, then stop and wait for the Learner."
      : converted && practiceStep(converted.topic, step, converted.check)
        ? "Code shows the Quick tries: point the Learner to the first one in a sentence, then stop."
        : "Nothing of this step has been taught yet: teach it now, then stop and wait for the Learner.";
  return `${NEXT_PREFIX} the Learner pressed Next: ${name}, and has written nothing. ${how} ${teach} You cannot finish this step, record a Check verdict or record an Insight attempt in this reply.`;
}
