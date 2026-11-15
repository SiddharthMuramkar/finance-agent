import { loadCourseMap, type CourseMap } from "@/course/map";
import { navigate } from "@/course/navigator";
import type { Db } from "@/db/types";
import { loadProgress } from "@/learner/memory";
import { openerNote } from "./context";
import { drillIsDue, quickTryFollowUpNote, quizLadderNote } from "./practice";
import { savePaste } from "./pasted";
import { closedInFavourOf, currentTopicId, liveSession, openLog, readSettings, retireOldModelSessions, sessionForTurn, showsCurrentTopic, STALE_TAB_MESSAGE } from "./session-log";
import { BUSY_MESSAGE, DRILL_NOTE, dropTurn, FINISH_NOTE, latestTurn, NEXT_PREFIX, QUICK_TRY_FOLLOW_UP_PREFIX, QUIZ_FOLLOW_UP_PREFIX, resumeTurn, startTurn, updateTurn, type Turn } from "./turn-status";
import { takeLearnersNext } from "./next";
import { turnFacts } from "./turn-facts";
import { NO_MISSED_QUIZ, quizFollowUpNote } from "./check-results";
import { widgetReportNote } from "./widget-context";
import { pressedChoiceWords } from "./reply-choices";
import { CAP_MESSAGES, checkQuota, RESUME_LIMIT_MESSAGE } from "./quota";
import type { PastedInput, TurnDeps, TurnEvent, TurnInput } from "./turn";

/**
 * Turn admission: every "may this turn run?" rule, before the Tutor Turn runs (turn.ts). It refuses a request from a tab
 * showing another Topic, works out the note code writes for the input's kind, refuses a new turn past a daily Spend cap
 * (quota.ts), takes the Learner's one-turn lock (a new turn, or a resume of the last one unless it has had all its
 * resumes), and refuses a Next or a follow-up with nothing to do, freeing the lock again. A refusal saves and sends
 * nothing. What it admits is the claimed turn, with the items to show before the reply and its step limit. The rules
 * run in that order (turn-admission.test.ts). With `noLimits` (the evals) no Spend cap applies.
 */

/** The not_allowed message when a Quick-try follow-up has nothing to follow up. */
export const NO_QUICK_TRY_FOLLOW_UP = "There is no Quick try answer to go over.";
/** A drill turn when no parked Skill of the current Topic is due. */
export const NO_DRILL = "There is no drill due in this Topic.";
/** Said when a Choice pressed is no longer under the latest reply (another tab moved on). */
export const NO_SUCH_CHOICE = "That choice is no longer on offer. Pick one under the latest reply, or type a message.";

/** What the admission rules may answer instead of a turn: nothing was saved or sent. */
export type Refusal = Extract<TurnEvent, { type: "stale" | "not_allowed" | "over_limit" | "busy" }>;

/**
 * The admission's answer: a refusal, or the claimed turn. `items` come before the reply (a Next's step dividers, the
 * quiz ladder's items). `alreadyFinished`: a resume found the turn finished after the browser lost the stream, so it
 * holds no lock and only its saved reply is shown. `stepLimit`: the most model steps the turn may take, all its runs
 * together (its Step ledger's limit).
 */
export type Admission = { refusal: Refusal } | { turn: Turn; alreadyFinished: boolean; items: TurnEvent[]; stepLimit: number };

export type AdmissionDeps = Pick<TurnDeps, "db" | "learnerId" | "map" | "now" | "shown" | "widgets" | "noLimits">;

/** Decides whether the turn runs, and claims the Learner's lock for it when it does. */
export async function admitTurn(deps: AdmissionDeps, input: TurnInput): Promise<Admission> {
  const { db, learnerId } = deps;
  const now = deps.now ?? (() => new Date());
  const resuming = typeof input === "object" && "resume" in input;
  if (deps.shown && !(await showsCurrentTopic(db, deps.map ?? loadCourseMap(), learnerId, deps.shown))) {
    // A resume may still carry on the tab's own unfinished turn, which may itself have moved the Learner to the next Topic.
    const latest = resuming ? await latestTurn(db, learnerId) : undefined;
    // Or the tab still shows the older model's Session this turn's Session replaced (ADR 0007): it hears of the new one only on
    // "done", so a resume from it (a Widget Retry that let go of the stream) still draws that turn once it has finished.
    const replaced = latest !== undefined && "sessionId" in deps.shown && (await closedInFavourOf(db, learnerId, deps.shown.sessionId, latest.sessionId));
    const ownTurn =
      latest !== undefined && "sessionId" in deps.shown && (replaced || (latest.status !== "finished" && latest.sessionId === deps.shown.sessionId));
    if (!ownTurn) return { refusal: { type: "stale", message: STALE_TAB_MESSAGE } };
  }
  let started = "";
  if (typeof input === "object" && "opener" in input) {
    const note = await openerFor(db, deps.map ?? loadCourseMap(), learnerId);
    // Another tab already opened this Topic: a reload shows its Session.
    if (note === null) return { refusal: { type: "stale", message: STALE_TAB_MESSAGE } };
    started = note;
  } else if (typeof input === "object" && "widgetReport" in input) {
    const report = await widgetReportNote(db, deps.map ?? loadCourseMap(), learnerId, input.widgetReport, deps.widgets);
    // The Widget is not open, or a Guided Task under it is not ticked yet: nothing is saved or sent.
    if (!report.ok) return { refusal: { type: "not_allowed", message: report.reason } };
    started = report.note;
  } else if (typeof input === "object" && "next" in input) {
    // Code writes the Next's note once it has taken the move, inside the lock.
    started = NEXT_PREFIX;
  } else if (typeof input === "object" && "finish" in input) {
    // Finish this reply stores no Learner message: code writes the note that asks the Tutor to finish.
    started = FINISH_NOTE;
  } else if (typeof input === "object" && "quizFollowUp" in input) {
    // Code writes the follow-up's note inside the lock, once it has found the missed quiz to go over.
    started = QUIZ_FOLLOW_UP_PREFIX;
  } else if (typeof input === "object" && "quickTryFollowUp" in input) {
    // Code writes the follow-up's note inside the lock, from the latest Quick-try result.
    started = QUICK_TRY_FOLLOW_UP_PREFIX;
  } else if (typeof input === "object" && "drill" in input) {
    // A parked Skill's drill: code shows the tries when the turn starts (enterStepItems); the Tutor adds one sentence.
    if (!(await drillIsDue(db, deps.map ?? loadCourseMap(), learnerId, now()))) return { refusal: { type: "not_allowed", message: NO_DRILL } };
    started = DRILL_NOTE;
  } else if (typeof input === "object" && "choice" in input) {
    // A Choice press posts the words stored with the latest reply's Choices as the Learner's message: a chip turn.
    const says = await pressedChoiceWords(db, deps.map ?? loadCourseMap(), learnerId, input.choice);
    if (says === null) return { refusal: { type: "not_allowed", message: NO_SUCH_CHOICE } };
    started = says;
  } else if (!resuming) started = learnerTextOf(input);
  const caps = deps.noLimits ? undefined : (await readSettings(db)).caps;
  // The daily Spend caps, for a new turn only: a resume carries on a turn that already got in. A refused turn writes no row.
  const capHit = caps && !resuming ? await checkQuota(db, learnerId, now(), caps) : null;
  if (capHit) return { refusal: { type: "over_limit", message: CAP_MESSAGES[capHit] } };
  // A resume past the resume limit is refused while it would take the lock; another turn running is still "busy".
  const claim = resuming ? await resumeTurn(db, now(), learnerId, caps?.resumesPerTurn) : { turn: await startTurn(db, now(), started, learnerId), alreadyFinished: false };
  if ("overLimit" in claim && claim.overLimit) return { refusal: { type: "over_limit", message: RESUME_LIMIT_MESSAGE } };
  if (!claim.turn) return { refusal: { type: "busy", message: BUSY_MESSAGE } };
  let turn = claim.turn;
  const items: TurnEvent[] = [];
  // A Quick-try follow-up reads the Quick try's result from the Topic's live Session, so it is worked out before a
  // Session of an older model holding that result is closed below.
  const quickTryNote = typeof input === "object" && "quickTryFollowUp" in input ? await quickTryFollowUpNote(db, deps.map ?? loadCourseMap(), learnerId) : undefined;
  // An older model's Session of the current Topic is closed before anything is written to it (ADR 0007), and the Topic gets a
  // fresh Session at once, so a Next or a follow-up taken now stores its items there.
  const topicNow = await currentTopicId(db, deps.map ?? loadCourseMap(), learnerId);
  if (await retireOldModelSessions(db, learnerId, topicNow)) await sessionForTurn(db, now(), learnerId, topicNow);
  if (typeof input === "object" && "next" in input) {
    const taken = await takeLearnersNext(db, deps.map ?? loadCourseMap(), learnerId, turn.id, input.next, now());
    if (!taken.ok) {
      // Nothing moved and nothing was stored: the turn goes, so the Learner's lock is free again.
      await dropTurn(db, turn.id);
      return { refusal: { type: "not_allowed", message: taken.reason } };
    }
    turn = { ...turn, input: taken.note, sessionId: taken.sessionId, freshStep: true };
    // The dividers come before the reply that teaches the step.
    for (const item of taken.items) items.push({ type: "item", item });
  }
  if (typeof input === "object" && "quizFollowUp" in input) {
    const note = await quizFollowUpNote(db, deps.map ?? loadCourseMap(), learnerId);
    if (note === null) {
      // Already gone over (another tab), or nothing was missed: nothing ran, and the lock is free again.
      await dropTurn(db, turn.id);
      return { refusal: { type: "not_allowed", message: NO_MISSED_QUIZ } };
    }
    // The repair ladder covers quiz questions too: a second miss in a row on the first missed question's idea
    // re-teaches it, and a third shows the park offer instead (ticket #245).
    const climbed = await quizLadderNote(db, deps.map ?? loadCourseMap(), learnerId, note, now());
    for (const item of climbed.items) items.push({ type: "item", item });
    await updateTurn(db, turn.id, { input: climbed.note });
    turn = { ...turn, input: climbed.note };
  }
  if (typeof input === "object" && "quickTryFollowUp" in input) {
    const note = quickTryNote ?? null;
    if (note === null) {
      // Already followed up (another tab), or the latest Quick try needs none: nothing ran, and the lock is free again.
      await dropTurn(db, turn.id);
      return { refusal: { type: "not_allowed", message: NO_QUICK_TRY_FOLLOW_UP } };
    }
    await updateTurn(db, turn.id, { input: note });
    turn = { ...turn, input: note };
  }
  // Saved with the turn before anything else, so a retry still has it.
  if (typeof input === "object" && "paste" in input) await savePaste(db, turn.id, input.paste, now(), learnerId);
  return { turn, alreadyFinished: claim.alreadyFinished, items, stepLimit: caps?.stepsPerTurn ?? Infinity };
}

/**
 * The opener's note for the Learner's current Topic, written by code from their saved step, or null when
 * that Topic's Session already has messages (another tab opened it first).
 */
async function openerFor(db: Db, map: CourseMap, learnerId: number): Promise<string | null> {
  const live = await liveSession(db, learnerId, await currentTopicId(db, map, learnerId));
  if (live && (await openLog(db, live.id, () => new Date())).rows.length) return null;
  const place = navigate(map, await loadProgress(db, learnerId));
  // The opener's own facts: this runs before the turn is claimed, at the place the page opened.
  const facts = await turnFacts(db, map, learnerId, place);
  return openerNote(place, { quizOpen: facts.quizOpen }, facts);
}

/** What the Learner wrote, as saved on the turn. */
export function learnerTextOf(input: string | PastedInput): string {
  return typeof input === "string" ? input : input.message;
}
