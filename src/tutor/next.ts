import { and, eq, gt } from "drizzle-orm";
import { learnerState, messages } from "@/db/schema";
import { isConverted, type CourseMap } from "@/course/map";
import { finishFromWidget, navigate, nextOffer, practiceStep, STEP_NAMES, stepSetting, takeNext, type NextOffer, type ParkedSkills, type Place, type Progress, type TeachingStep } from "@/course/navigator";
import type { Db } from "@/db/types";
import { loadProgress, saveFinishedStep } from "@/learner/memory";
import { parkedSkills } from "@/learner/skill-state";
import { pendingQuizNote } from "@/learner/quiz";
import { loadWidgetStates } from "@/learner/widget-state";
import { topicCompleteContext } from "./context";
import { comingBackItems, DUE_CHECK, storeComingBack } from "./coming-back";
import { liveSession } from "./session-log";
import { loadSessionItems, stepDivider, STEP_DIVIDER, type SessionItem } from "./session-items";
import { NEXT_PREFIX, updateTurn } from "./turn-status";
import { openStepWidget } from "./written-ahead";
import { enterStepItems } from "./practice";

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
  if (await dividerUntaught(db, learnerId, topicId)) return false;
  return !(await pendingQuizNote(db, map, learnerId, topicId))?.passed;
}

/**
 * Whether the Session's latest step divider has no Tutor reply after it: code moved the Learner onto the step (a step
 * that finished from what they did in a Widget, finishStepFromWidget) and no Tutor turn has taught it yet.
 */
async function dividerUntaught(db: Db, learnerId: number, topicId: string): Promise<boolean> {
  const session = await liveSession(db, learnerId, topicId);
  if (!session) return false;
  const divider = (await loadSessionItems(db, session.id, learnerId)).findLast((i) => i.kind === STEP_DIVIDER);
  if (!divider) return false;
  const [later] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.sessionId, session.id), eq(messages.role, "assistant"), gt(messages.seq, divider.afterSeq)))
    .limit(1);
  return !later;
}

/** The Next chip the Learner is offered now, or null (a Check is open, or every Topic is passed). */
export async function nextOfferNow(db: Db, map: CourseMap, learnerId: number, now: Date): Promise<NextOffer | null> {
  const progress = await loadProgress(db, learnerId);
  const place = navigate(map, progress);
  if (!place) return null;
  const comingBack = await comingBackItems(db, map, learnerId, now);
  return nextOffer(map, progress, { begun: await stepBegun(db, map, learnerId, place.topic.id, comingBack) }, await parkedIn(db, map, learnerId, progress));
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
    await lockLearner(tx, learnerId);
    const progress = await loadProgress(tx, learnerId);
    const place = navigate(map, progress);
    // Next is offered only under a Tutor reply, so the Topic's Session already exists.
    const session = place ? await liveSession(tx, learnerId, place.topic.id) : undefined;
    if (!place || !session) return { ok: false, reason: "There is no Next to take." };
    // The Picking up or Due Check divider the page drew, worked out before the move: it is stored with this Next, first.
    const comingBack = await comingBackItems(tx, map, learnerId, now);
    const begun = await stepBegun(tx, map, learnerId, place.topic.id, comingBack);
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
    // Complete this Topic passes it: no next step, so no divider (its Topic complete card marks that).
    const moved = await loadProgress(tx, learnerId);
    const item = move.teach ? stepDivider(map, moved, place.topic.id) : null;
    const items = [...comingBack, ...(item ? [item] : [])];
    await storeComingBack(tx, learnerId, session.id, items, now);
    // The step that begins opens its Widget by itself (the Topic's `steps[].opens`): a chip after the divider.
    const opened = move.teach ? await openStepWidget(tx, map, moved, learnerId, session.id, now) : null;
    if (opened) items.push(opened);
    // A converted step shows what code shows on entering it: the Concept card and its Widget, or the first Quick try.
    if (move.teach) items.push(...(await enterStepItems(tx, map, learnerId, session.id, now)));
    // Entering can finish a converted Your turn at once (its Skills are already fluent), so the note reads the progress after it.
    const entered = move.teach ? await loadProgress(tx, learnerId) : moved;
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
 * opens its Widget. Returns the items it stored (none when the condition is not met). Called when Widget state is saved.
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
    const moved = await loadProgress(tx, learnerId);
    const divider = stepDivider(map, moved, place.topic.id);
    const items: SessionItem[] = divider ? [divider] : [];
    await storeComingBack(tx, learnerId, session.id, items, now);
    const opened = await openStepWidget(tx, map, moved, learnerId, session.id, now);
    if (opened) items.push(opened);
    items.push(...(await enterStepItems(tx, map, learnerId, session.id, now)));
    return items;
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
