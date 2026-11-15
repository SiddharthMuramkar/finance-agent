import { and, eq } from "drizzle-orm";
import { loadCourseMap, type CourseMap } from "@/course/map";
import { navigate, type Place } from "@/course/navigator";
import { learners, sessions, toolCalls } from "@/db/schema";
import type { Db } from "@/db/types";
import { ensureTopicStarted, learnerSummary, loadProgress } from "@/learner/memory";
import { profileBlock } from "@/learner/profile";
import { loadExploreInfo } from "@/learner/insight";
import { markQuizReported, pendingQuizNote } from "@/learner/quiz";
import type { QueryEmbedder } from "@/library/library";
import { newReplyWidgetProblems } from "@/widgets/check";
import { exploreHeldBack } from "@/course/explore-widget";
import { coveredParts, WIDGET_OPENED, writtenAheadWidgets } from "@/course/written-ahead";
import { endedAtCheckWithoutVerdict, lastContextSent, noVerdictContext, openWidgetsNote, standsAlreadySent, standsBlock, stepContext, writtenAheadNote } from "./context";
import { CitationMarks, type Citation } from "./citations";
import { replyFold, sourceContext } from "./sources";
import { drawnWidgets, loadSessionItems, saveItemAfterLatest, type SessionItem, type StoredItem } from "./session-items";
import { replyItems } from "./reply-items";
import { QUICK_TRY, STEP_DIVIDER, STOPPED, type QuickTryData } from "./session-item-kinds";
import { afterReteachItems, enterStepItems, openTryItem, pendingQuickTryNote, practiceFallback, storeStepDivider } from "./practice";
import { methodInNote } from "./ladder-moves";
import { hasMarkers, markerProblems } from "@/finance/formula-markers";
import { withoutOpenWidget } from "./open-widget";
import { comingBackItems, DUE_CHECK, storeComingBack } from "./coming-back";
import { storeTopicComplete } from "./topic-complete";
import { describeFailure, newFailureRef, providerDetails, type FailureKind, type ProviderDetails } from "./failures";
import { isOwnQuestion, OWN_QUESTION_FALLBACK } from "./own-question";
import { GUARD_RULE, StreamGuard, type GuardHit } from "./stream-guard";
import { saveTurnTiming, TurnClock } from "./turn-timing";
import { pasteBlock, pasteForTurn, pasteSummary } from "./pasted";
import { type ToolDefinition } from "./instructions";
import {
  currentTopicId,
  isCompaction,
  isLegacySession,
  openLog,
  readSettings,
  refreezeIfChanged,
  retireLegacySessions,
  withoutRejected,
  saveShownSession,
  sessionForTurn,
  shownInWorkspace,
  type Effort,
  type Log,
  type Message,
  type Session,
  type Shown,
  usesWidgetEngine,
} from "./session-log";
import { bindTools, caseDataFor, rerunToolCalls, SAVE_FAILED_MESSAGE, toolCode, unansweredToolCalls, widgetsUpdatedInTurn, type Composer, type ProgressEvent, type ToolCode, type ToolEffects } from "./tools";
import { PARAGRAPH, textOf, turnText } from "./transcript";
import { FINISH_NOTE, OLD_CONTINUE_TEXT, stopRequested, turnKind, updateTurn, type Turn } from "./turn-status";
import type { NextName } from "./next";
import { ownQuestionFacts, turnFacts, type TurnFacts } from "./turn-facts";
import { CHECKING_LABEL, joinedEvents, judgeReply, rejectedRows, replyTextAfter, replyWords, RETRY_WITHIN_MS, retryMessage, toolWidgets, trimmedFallback, widgetsOnScreen, type Judged } from "./reply-gate";
import { saveRejectedSeqs, saveReplyCheck, summaryOf, turnRejectedSeqs } from "./reply-records";
import { checkReply, fixReplyBlocks } from "./reply-checks";
import { savedRuleOf } from "./own-rule-item";
import { exploreSettings, openWidgetsForTurn, readOpenWidgets, replyTexts, widgetNotes } from "./widget-context";
import { WIDGET_SHOWN, type ShownWidget } from "@/widgets/shown-widget";
import { recipeById } from "@/widgets/recipes";
import { pickCompanion } from "./companion";
import { widgetsBlock } from "@/widgets/widget-reading";
import type { WidgetStates } from "@/widgets/widget-state";
import { learnersOwnWords, storeReplyChoices } from "./reply-choices";
import { lastStepNumber, loadTurnUsages, saveStepUsage, saveTurnTotal, stepUsage, sumSteps, type ApiUsage, type StepUsage, type TurnUsage } from "./usage";
import type { ModelClient } from "./model";
import { runTools, type RunnerParams } from "./runner";
import { healingClient, REPLAY_STRIPPED } from "./replay-heal";
import { OWN_QUESTION_KIND } from "./turn-timing";
import { recordIncident } from "./incidents";
import { admitTurn, learnerTextOf } from "./turn-admission";

/**
 * The Tutor Turn: one Learner action in, streamed events and saved state out. It takes the
 * one-turn lock, picks the Topic's Session (session-log.ts), sends changed context (context.ts), and
 * runs the Tool Runner loop (runner.ts) with cut-off, compaction, refusal and widget-correction handling.
 */

export { latestTurn, BUSY_MESSAGE } from "./turn-status";

/** Room for the model's reasoning as well as the visible reply: OpenAI counts both as output tokens. */
const MAX_TOKENS = 16000;
/** The turn stops itself this long after it starts, inside Vercel's 300 seconds, so it can save and tell the browser. */
export const TIME_BUDGET_MS = 270_000;
/** Room a compaction after the reply leaves before the turn's own deadline, to save its summary and finish the turn. */
const COMPACT_MARGIN_MS = 10_000;
/** How often a running turn reads its own row for the Learner's Stop (another function instance may have written it). */
export const STOP_POLL_MS = 500;


/** The request the Tutor Turn builds for the Tool Runner: the Session's frozen instructions, tools, model and effort. */
export type TutorRequest = RunnerParams;

/** The model client the Tutor Turn uses (model.ts): OpenAI's gpt-6.1-sol; tests pass a scripted stub. */
export type TutorClient = ModelClient;

export type TurnEvent =
  | { type: "text"; text: string }
  /**
   * The reply's widget failed the server check; the text that follows is its one correction. `widgets` are the
   * positions (from 0) of the reply's widgets it corrects, in order.
   */
  | { type: "correction"; widgets: number[]; /** Of those, the ones to leave out of the reply: written-ahead Widgets cover them, and none replaces them. */ leaveOut: number[] }
  /**
   * `ref` names the turn's Session and turn, so the browser can offer "Save to Notebook" on the reply at once.
   * `shown` is what the page's next turn request says it shows: this Session, or the next Topic if the turn moved the Learner on.
   */
  | { type: "done"; stopReason: string | null; usage: TurnUsage; ref: { sessionId: number; turnSeq: number }; shown: Shown }
  /**
   * A tool stored a Session item (a step divider) after the reply so far: the browser draws it there, and the
   * text that follows starts a new part of the reply. A reload draws it in the same place.
   */
  | { type: "item"; item: SessionItem }
  /** Another turn is running (perhaps on another device); nothing was saved or sent. */
  | { type: "busy"; message: string }
  /** The request came from a tab showing another Topic than the Learner's current one; nothing was saved or sent. */
  | { type: "stale"; message: string }
  /** The Learner's Next is not allowed now (a Check is open, after a miss, an unsettled Explore); nothing was saved or sent. */
  | { type: "not_allowed"; message: string }
  /** A resumed turn: the reply text saved so far, which replaces what the browser showed. */
  | { type: "replay"; text: string }
  /** The turn reached its time limit; saved loop steps are kept and the browser should resume. */
  | { type: "cut_off" }
  /** The reply hit max_tokens: it is kept as sent, and the Learner is offered Finish this reply. */
  | { type: "cut_short"; message: string }
  /**
   * The model declined; the declined loop step is discarded. `text` is the reply saved by earlier
   * loop steps of the turn, which is kept and replaces what the browser showed.
   */
  | { type: "refusal"; message: string; text: string }
  /** A tool could not save the Learner's progress. */
  | { type: "save_failed"; message: string }
  /**
   * The API call failed; everything already saved is kept and the Learner can retry. `message` is the Learner's (A3: never
   * the provider's words). `provider` is what the provider said, sent only to a Learner with Show developer details on.
   */
  | { type: "error"; kind: FailureKind; message: string; provider?: ProviderDetails }
  /** Sent by the route every few seconds while the turn runs, so the browser knows the stream is alive. Carries nothing. */
  | { type: "ping" }
  /** What the turn is doing now, in plain words ("Thinking…", "Searching the Library…"), for the writing indicator. */
  | ProgressEvent
  /**
   * The Learner pressed Stop: the held reply is dropped, so no text is shown or saved as the Tutor's reply (ADR 0008).
   * Always followed by "done", so the browser never resumes the turn.
   */
  | { type: "stopped" }
  /** A Widget's new slider values, by its Widget key: update_widget saved them, and the open Widget moves to them. */
  | { type: "widget_state"; widgetKey: string; values: Record<string, number> };

/** What /api/turn streams to the browser, one JSON line each: the turn's events, with how long it ran on "done". */
export type StreamEvent = Exclude<TurnEvent, { type: "done" }> | { type: "turn_started"; turnId: number } | (Extract<TurnEvent, { type: "done" }> & { elapsedMs: number });

export { NO_DRILL, NO_QUICK_TRY_FOLLOW_UP, NO_SUCH_CHOICE } from "./turn-admission";

export const CUT_SHORT_MESSAGE ="The reply was cut short because it reached its length limit. Press Finish this reply to have the Tutor finish it.";
export const REFUSAL_MESSAGE = "The Tutor declined to answer that message. Nothing was changed, and your place is the same. Try asking another way.";
/** The refusal message when tool calls earlier in the same turn had already saved progress. */
export const REFUSAL_AFTER_SAVES_MESSAGE =
  "The Tutor declined to go on with that reply. What it had already written and recorded earlier in this reply is kept, so your place in the course may have moved on; only the declined part was discarded. Try asking another way.";
/** The tool result for a tool call in a reply that hit max_tokens: its input may be cut off, so it never runs. */
const NOT_RUN = "Not run: your reply reached max_tokens before this tool call was complete. Nothing was recorded.";

/** Builds the request only from what the Session saved, never from current code or settings. */
function requestFor(session: Session, msgs: Message[], code: Record<string, ToolCode>): TutorRequest {
  return {
    model: session.model,
    effort: session.effort as Effort,
    // The instructions and tools are the same for every Session of a deploy; the client sends them first, with a
    // cache breakpoint after them, so a new Session (or one after a pause) reads them from the prompt cache.
    instructions: session.instructions,
    tools: bindTools(session.tools as ToolDefinition[], code),
    maxOutputTokens: MAX_TOKENS,
    messages: msgs,
  };
}

/**
 * A new message, Finish this reply (offered under a reply cut off at its length limit; code writes its note),
 * the opener (the page starts it when the Session it shows has no messages; code writes its note), the
 * Learner's Next (naming the step on its chip, or "complete"; code writes its note), the quiz follow-up the page
 * starts after a missed quiz (code writes its note), a widget report (Tell the Tutor what I found under the open
 * Widget with this Widget key; code writes its note), or a resume of the last turn after a cut-off or failure
 * (Retry), which sends again whatever note or message the turn saved.
 */
export type TurnInput =
  | string
  | { finish: true }
  | { opener: true }
  | { next: NextName }
  | { quizFollowUp: true }
  /** The short turn the page starts after a Quick try marked wrong with no Known mistake, or after the try that finished Your turn. */
  | { quickTryFollowUp: true }
  | { drill: true }
  | { widgetReport: string }
  | { resume: true }
  /** A press of one of the Choices under the latest reply, by its index: the server posts its stored words as a chip turn. */
  | { choice: number }
  | PastedInput;
/** A message with text the Learner pasted (the part of a piece being studied), appended for the Tutor. */
export type PastedInput = { message: string; paste: string };

export type TurnDeps = {
  db: Db;
  client: TutorClient;
  /** The Learner taking the turn (the current Learner of the request). */
  learnerId: number;
  map?: CourseMap;
  now?: () => Date;
  /** How long this run may take before it cuts itself off; defaults to TIME_BUDGET_MS. */
  timeBudgetMs?: number;
  /** How long into the run a failed reply may still get its one retry; defaults to RETRY_WITHIN_MS (tests shorten it). */
  retryWithinMs?: number;
  /**
   * False shows the model's reply as it came, with no fixes, checks, retry or fallback: for the tutor eval, which replays
   * recorded replies and grades the model's own first reply. Left out, every reply is checked (ADR 0008).
   */
  checkReplies?: boolean;
  /** Voyage query embeddings for Library search; without them search uses keyword results only. */
  embedQuery?: QueryEmbedder;
  /**
   * What the page that sent the turn shows (its Session, or for a Topic's first turn its Topic). The
   * turn is refused unless it is the Learner's current Topic. Left out, nothing is checked (test tools).
   */
  shown?: Shown;
  /**
   * What the page's Widgets show as the Learner acts: slider values and ticked Guided Tasks by Widget key (the
   * page's Widget state). Over what the Session saved, it is what the Tutor is told of the open Widgets.
   */
  widgets?: WidgetStates;
  /**
   * Tells the browser at once what the turn is doing ("Thinking…", a tool's label). The route wires it to its stream:
   * the generator cannot yield while a tool runs or the model thinks. Left out, nothing is sent.
   */
  notify?: (event: ProgressEvent) => void;
  /** Tells the route the id of the turn that holds the Learner's lock, once it does, so the browser can tie its Stop to that turn. */
  onTurn?: (turnId: number) => void;
  /** compose_widget's model client (and a test's shorter limit); left out, the real OpenAI client, made on first use. */
  composer?: Composer;
};

/** Thrown when a run reaches its time budget. */
class CutOff extends Error {}

/** Thrown when the Learner pressed Stop. */
class StopRequested extends Error {}

/** Thrown when the stream guard stopped a streamed reply (A5): the sentence it stopped on, and what the step had shown before it. */
class GuardStopped extends Error {
  constructor(
    readonly hit: GuardHit,
    readonly stepShown: string,
  ) {
    super(`The stream guard stopped the reply: ${hit.detail}`);
  }
}

/** Resolves like the promise, or throws CutOff once the deadline (a performance.now() time) passes, or StopRequested once `stop` aborts. */
async function beforeDeadline<T>(promise: Promise<T>, deadline: number, stop?: AbortSignal): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onStop: (() => void) | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new CutOff()), Math.max(0, deadline - performance.now()));
  });
  const stopped = new Promise<never>((_, reject) => {
    if (!stop) return;
    onStop = () => reject(new StopRequested());
    if (stop.aborted) onStop();
    else stop.addEventListener("abort", onStop, { once: true });
  });
  try {
    return await Promise.race([promise, late, stopped]);
  } finally {
    clearTimeout(timer);
    if (onStop) stop?.removeEventListener("abort", onStop);
  }
}

/**
 * Reads the turn's row every STOP_POLL_MS for the Learner's Stop (the request that sets it may reach another
 * function instance) and aborts the signal when it is set. `end` stops the polling.
 */
function watchForStop(db: Db, turnId: number) {
  const controller = new AbortController();
  let reading = false;
  const timer = setInterval(() => {
    if (reading || controller.signal.aborted) return;
    reading = true;
    stopRequested(db, turnId)
      .then((stop) => {
        if (stop) {
          clearInterval(timer);
          controller.abort();
        }
      })
      .catch(() => {})
      .finally(() => {
        reading = false;
      });
  }, STOP_POLL_MS);
  return { signal: controller.signal, end: () => clearInterval(timer) };
}

const WIDGET_OPEN = "```openui-lang\n";
export { withoutOpenWidget };

/**
 * Runs one Tutor turn for one Learner: turn admission (turn-admission.ts) refuses a request from a tab showing
 * another Topic and takes their one-turn lock; the turn then saves their message in the live Session of their current Topic, streams the
 * reply through Tool Runner and saves each loop step's messages unchanged as they finish. After the
 * message, code appends the Course Navigator's context (and the Where the Learner stands block)
 * whenever it changed; a Topic's first turn makes its Session, which opens with both. A turn is
 * saved as running, cut off, finished or failed; `{ resume: true }` continues a cut-off or failed
 * turn from its last saved loop step.
 */
export async function* runTutorTurn(deps: TurnDeps, input: TurnInput): AsyncGenerator<TurnEvent> {
  const { db } = deps;
  const now = deps.now ?? (() => new Date());
  // The run's times (A9) count from here: the time to the model's first event, to the first word shown, and in all.
  const clock = new TurnClock();
  const deadline = performance.now() + (deps.timeBudgetMs ?? TIME_BUDGET_MS);
  const { learnerId } = deps;
  const admission = await admitTurn(deps, input);
  if ("refusal" in admission) {
    yield admission.refusal;
    return;
  }
  const { turn } = admission;
  yield* admission.items;
  if (admission.alreadyFinished) {
    // It finished after the browser lost the stream: show the saved reply.
    yield* finishedTurnReplay(db, deps.map ?? loadCourseMap(), turn);
    return;
  }
  let ended = false;
  deps.onTurn?.(turn.id);
  const stop = watchForStop(db, turn.id);
  try {
    const done = yield* timed(runLockedTurn(deps, input, turn, deadline, stop.signal, clock), clock);
    // Finished before the browser hears "done", so its next send finds the lock free.
    await updateTurn(db, turn.id, { status: "finished", stopReason: done.stopReason, finishedAt: now() });
    ended = true;
    yield done;
  } catch (error) {
    ended = true;
    if (error instanceof CutOff) {
      await updateTurn(db, turn.id, { status: "cut_off" });
      yield { type: "cut_off" };
      return;
    }
    // The Learner reads plain words and a reference (A3); the provider's own words go with the turn, for the Owner.
    const ref = newFailureRef();
    const failure = describeFailure(error, ref);
    const provider = providerDetails(error);
    console.error(`Tutor turn failed (reference ${ref})`, error);
    await updateTurn(db, turn.id, {
      status: "failed",
      error: failure.message,
      failureRef: ref,
      providerError: provider.message,
      providerRequestId: provider.requestId,
      providerStatus: provider.status,
    });
    yield { type: "error", ...failure, ...((await showsDeveloperDetails(db, learnerId)) && { provider }) };
  } finally {
    stop.end();
    // The caller stopped reading early: leave the turn resumable rather than locked.
    if (!ended) await updateTurn(db, turn.id, { status: "cut_off" });
    clock.end();
    await saveTurnTiming(db, turn.id, clock);
  }
}

/** Passes a turn's events on as they come, showing each to the clock first, so it times the first word the Learner sees (A9). */
async function* timed<R>(events: AsyncGenerator<TurnEvent, R>, clock: TurnClock): AsyncGenerator<TurnEvent, R> {
  try {
    for (;;) {
      const next = await events.next();
      if (next.done) return next.value;
      clock.shown(next.value);
      yield next.value;
    }
  } finally {
    // The caller stopped reading early: the turn's own generator ends too, running its cleanup.
    await events.return?.(undefined as never);
  }
}

/** Whether the Learner has Show developer details on (Settings): only then is a failure's provider text sent to them. */
async function showsDeveloperDetails(db: Db, learnerId: number): Promise<boolean> {
  const [row] = await db.select({ on: learners.showDeveloperDetails }).from(learners).where(eq(learners.id, learnerId));
  return row?.on ?? false;
}

async function* finishedTurnReplay(db: Db, map: CourseMap, turn: Turn): AsyncGenerator<TurnEvent> {
  if (turn.sessionId === null || turn.turnSeq === null) return;
  const log = await openLog(db, turn.sessionId, () => new Date());
  yield { type: "replay", text: (await turnText(log.rows, turn.turnSeq, { db, map, learnerId: turn.learnerId })) };
  const usage = (await loadTurnUsages(db, turn.sessionId)).get(turn.turnSeq);
  const [session] = await db.select().from(sessions).where(eq(sessions.id, turn.sessionId));
  yield {
    type: "done",
    stopReason: turn.stopReason,
    usage: usage ?? sumSteps(session.model, [], 0),
    ref: { sessionId: turn.sessionId, turnSeq: turn.turnSeq },
    shown: await shownInWorkspace(db, map, turn.learnerId),
  };
}

async function* runLockedTurn(
  deps: TurnDeps,
  input: TurnInput,
  turn: Turn,
  deadline: number,
  stop: AbortSignal,
  clock: TurnClock,
): AsyncGenerator<TurnEvent, Extract<TurnEvent, { type: "done" }>> {
  const { db } = deps;
  const { learnerId } = turn;
  // A replay refusal heals once (A2, ADR 0016): the request goes again without raw output, the Session's marker moves past
  // what was stored so later turns send that history without it too, and the heal is counted.
  const client = healingClient(deps.client, async ({ error, at }) => {
    const provider = providerDetails(error);
    const from = session.refrozenAtSeq;
    const to = Math.max(from ?? 0, log.nextSeq);
    // The retry goes ahead whatever happens here: a marker that cannot move only means the next turn heals again.
    await db
      .update(sessions)
      .set({ refrozenAtSeq: to })
      .where(eq(sessions.id, session.id))
      .catch((e: unknown) => console.error(`The heal could not move Session ${session.id}'s marker`, e));
    console.warn(`A replay refusal healed in Session ${session.id}: ${provider.message}`);
    await recordIncident(db, {
      learnerId,
      sessionId: session.id,
      turnId: turn.id,
      kind: REPLAY_STRIPPED,
      requestId: provider.requestId,
      detail: { at, status: provider.status, message: provider.message, turnSeq: stepsReady ? turnSeq : null, refrozenAtSeq: { from, to } },
    });
  });
  const map = deps.map ?? loadCourseMap();
  const now = deps.now ?? (() => new Date());
  const runStart = performance.now();
  const effects: ToolEffects = { saveFailed: false, items: [], notify: deps.notify, deadline, stop, pageWidgets: deps.widgets };
  const progress = (label: string) => deps.notify?.({ type: "progress", label });

  let session: Session;
  let log: Log;
  let turnSeq: number;
  let code: Record<string, ToolCode>;
  // The turn's loop steps are numbered once across the Tutor's steps and the extra ones tools save (compose_widget's).
  let stepNo: number | undefined;
  let stepsReady = false;
  const saveStep = async (model: string, make: (n: number) => StepUsage) => {
    stepNo ??= await lastStepNumber(db, session.id, turnSeq);
    await saveStepUsage(db, session.id, turnSeq, model, make(++stepNo), now());
  };
  // A tool rerun for an earlier turn, before this one has its turn seq, saves no extra step.
  effects.saveStep = (model, make) => (stepsReady ? saveStep(model, make) : Promise.resolve());
  // This turn's facts (turn-facts.ts), the place they were worked out for, and whether the turn closes a passed Topic.
  let facts: TurnFacts | undefined;
  let placeAtStart: Place | null = null;
  let passedTopic = false;
  // A resume carries on from the last saved loop step, but only once the Learner's message is stored.
  let resumed: { session: Session; log: Log; turnSeq: number } | undefined;
  if (typeof input === "object" && "resume" in input && turn.sessionId !== null && turn.turnSeq !== null) {
    const [saved] = await db.select().from(sessions).where(eq(sessions.id, turn.sessionId));
    // A turn left unfinished in a Claude-era Session is run afresh, from its saved message, in the Topic's new Session.
    const turnSeq = turn.turnSeq;
    const savedLog = saved && !isLegacySession(saved) && (await openLog(db, saved.id, now, turnSeq));
    if (savedLog && savedLog.rows.some((r) => r.seq === turnSeq)) resumed = { session: saved, log: savedLog, turnSeq };
  }
  // Whether this is an own-question turn (A5): the Learner typed it, with no quiz Check open and no conversation Check
  // waiting for its answer. Worked out once, before the reply: it decides whether the reply streams.
  let ownQ = false;
  // A resumed streamed reply's text shown again (its replay), which what it writes now follows.
  let replayed = "";
  // The facts the stream guard tests against (this turn's).
  let liveFacts: TurnFacts | undefined;
  // `seq` is the turn's seq, or before it is known the Session's next seq: a Choice pressed is one shown before it.
  const isOwnAt = async (at: Place | null, quizOpen: boolean, seq: number) =>
    isOwnQuestion({
      typed: await learnersOwnWords(db, { ...turn, sessionId: session.id, turnSeq: seq }, "typed"),
      quizOpen,
      conversationCheckWaiting: at?.step === "check" && at.check?.kind === "conversation",
    });
  if (resumed) {
    ({ session, log, turnSeq } = resumed);
    stepsReady = true;
    code = toolCode(db, map, now, session.model, effects, turn, deps.embedQuery, deps.composer);
    const at = navigate(map, await loadProgress(db, learnerId));
    liveFacts = await turnFacts(db, map, learnerId, at, { learnerText: turn.input ?? undefined, now: now() });
    ownQ = await isOwnAt(at, liveFacts.quizOpen, turnSeq);
    if (ownQ) liveFacts = ownQuestionFacts(liveFacts);
    // What the browser showed is cleared: a stored draft not yet checked never shows before its checks (ADR 0008). A
    // streamed reply (A5) shows again the text it stored, which was guarded and shown already, and streams on after it.
    replayed = ownQ && deps.checkReplies !== false ? await turnText(log.rows, turnSeq, { db, map, learnerId }) : "";
    yield { type: "replay", text: replayed };
    yield* repairToolCalls();
  } else {
    // A new message, or a retry of a turn that failed before the Learner's message was stored:
    // that turn is run again from the message saved on it.
    // A code-written turn (opener, Next, Finish this reply, quiz follow-up, widget report) sends the note its turn saved, and so does a Retry of any turn.
    // A turn from before Finish this reply that saved the old "Continue." (or, older still, nothing) is asked to finish instead.
    const saved = turn.input === OLD_CONTINUE_TEXT ? null : turn.input;
    const learnerText = typeof input === "string" || "paste" in input ? learnerTextOf(input) : (saved ?? FINISH_NOTE);
    // Complete this Topic passed the Topic its Next pinned: the turn closes it in that Session, and starts nothing else.
    // So does a Retry of a turn left unfinished in a Claude-era Session of a Topic since passed: it reruns in that
    // Topic's new Session, never in the next Topic's.
    const completed = await completedSession(db, map, turn, now(), typeof input === "object" && "resume" in input);
    // A Topic started by this turn has shown the Learner nothing yet, so its first step cannot be finished in it.
    // Saved before the Topic starts, so a retry after a failure in between still knows.
    if (!completed && navigate(map, await loadProgress(db, learnerId))?.status === "not_started") await updateTurn(db, turn.id, { freshStep: true });
    // An opener teaches the saved step afresh: nothing of it has been taught in this Session yet.
    if (turnKind(turn) === "opener") await updateTurn(db, turn.id, { freshStep: true });
    // Coming back (after a break, or to a carried-over Topic): the divider the page drew, worked out before this
    // action changes anything, and stored with it. (A Next stored its own when it took the move.)
    const comingBack = completed ? [] : await comingBackItems(db, map, learnerId, now());
    // The first turn after a Due Check reopens the Session teaches the new step: it cannot finish it as well.
    if (comingBack.some((i) => i.kind === DUE_CHECK)) await updateTurn(db, turn.id, { freshStep: true });
    const place = completed ? null : await ensureTopicStarted(db, map, now(), learnerId);
    // The live Session for the current Topic (made by its first turn), refrozen if a deploy changed the instructions.
    let target = completed ?? (await sessionForTurn(db, now(), learnerId, place?.topic.id ?? null));
    // The turn moved to a Topic whose live Session is Claude-era (a Due Check reopening it): closed, and made afresh.
    if (isLegacySession(target)) {
      await retireLegacySessions(db, learnerId, target.topicId);
      target = await sessionForTurn(db, now(), learnerId, target.topicId);
    }
    session = await refreezeIfChanged(db, target);
    // The Study Workspace shows the Session the Learner's turns go to, and keeps showing it after a pass until they choose.
    await saveShownSession(db, learnerId, session.id);
    await storeComingBack(db, learnerId, session.id, comingBack, now());
    log = await openLog(db, session.id, now);
    // A paste belongs to the Session this turn runs in; the context counts what the Tutor has seen there.
    const paste = await pasteForTurn(db, turn.id, session.id, learnerId);
    const pastes = await pasteSummary(db, session.id, learnerId);
    if (place) progress("Looking up Case Data…");
    const caseData = await caseDataFor(db, map, place, learnerId);
    // This turn's facts (turn-facts.ts), worked out once: the context names them, and later steps of the turn reuse them.
    facts = await turnFacts(db, map, learnerId, place, { learnerText, now: now() });
    // An own question (A5) is answered first, in about 120 words: its facts say so, and its soft checks measure that.
    ownQ = await isOwnAt(place, facts.quizOpen, log.nextSeq);
    if (ownQ) facts = ownQuestionFacts(facts);
    placeAtStart = place;
    passedTopic = completed !== undefined;
    const quizDown = place?.step === "check" && place.check?.kind === "quiz" && !facts.quizOpen;
    const startFacts = facts;
    // At explore, the explore Widget as it stands, so the context words its Guided Tasks as the Learner sees them.
    const exploreAt = place?.step === "explore" ? await exploreSettings(db, map, learnerId, session.id, deps.widgets) : undefined;
    const plainContext = stepContext(place, caseData, pastes, quizDown, await loadExploreInfo(db, place, turn.id, learnerId), startFacts, exploreAt);
    const stepped =
      place?.step === "check" && place.check?.kind === "conversation" && endedAtCheckWithoutVerdict(log.messages, place.check.id, plainContext)
        ? noVerdictContext({ ...place, check: place.check }, caseData, pastes, startFacts)
        : plainContext;
    const learnerBlocks: { type: "text"; text: string }[] = [{ type: "text", text: learnerText }, ...(paste ? [pasteBlock(paste.text)] : [])];
    code = toolCode(db, map, now, session.model, effects, turn, deps.embedQuery, deps.composer);
    // Tool calls left without results by an earlier cut-off are answered before anything follows them.
    yield* repairToolCalls();
    // The first turn after a refreeze folds the history from before it into a summary, before the reply.
    const fold = refreezeFold(session, log) ? yield* foldHistory() : undefined;

    turnSeq = log.nextSeq;
    stepsReady = true;
    if (fold) await saveStep(session.model, (n) => stepUsage(session.model, n, fold.usage, ["compaction"], fold.ms, fold.stopReason));
    await updateTurn(db, turn.id, { sessionId: session.id, turnSeq });
    const items = await loadSessionItems(db, session.id, learnerId);
    const drawn = drawnWidgets(replyTexts(log.rows), items, turnSeq);
    // What the Learner's open Widgets show as they act (an opener is the page's, not theirs): stored with their message, so it replays unchanged.
    const opener = turnKind(turn) === "opener";
    const open = opener ? [] : await openWidgetsForTurn(db, map, learnerId, drawn, !completed, session);
    const widgetBlock = widgetsBlock((await readOpenWidgets(db, map, learnerId, session.id, open, deps.widgets)).map((r) => r.reading));
    if (widgetBlock) learnerBlocks.push({ type: "text", text: widgetBlock });
    // Widget notes ride along with the Learner's message instead of a correction round: the recent archetypes, and
    // warnings about the Widgets of the last reply (UX audit §7.6). Stored with the message, so it replays unchanged.
    const notes = opener ? null : widgetNotes(log.rows, items, turnSeq);
    if (notes) learnerBlocks.push({ type: "text", text: notes });
    // The Widgets open in the panel, by title, so the Tutor can update one in place rather than add a near-copy.
    const widgetsNote = openWidgetsNote(drawn.map((w) => w.title));
    // The Topic's written-ahead Widgets, by title and id, which the Tutor opens with open_widget.
    const sessionTopic = session.topicId ? map.topic(session.topicId) : undefined;
    // The explore Widget is left off until the explore step: the Tutor may not open it before then (ADR 0001).
    const held = sessionTopic ? exploreHeldBack(sessionTopic, (await loadProgress(db, learnerId)).topics[sessionTopic.id]) : null;
    const aheadNote = writtenAheadNote(sessionTopic ? writtenAheadWidgets(sessionTopic).filter((w) => w.id !== held) : []);
    const context = [widgetsNote, aheadNote, stepped].filter(Boolean).join("\n");
    // Quiz results marked by code since the Tutor's last call; each is told to the Tutor once.
    const quiz = completed ? null : await pendingQuizNote(db, map, learnerId, session.topicId);
    // Quick-try results code marked since the Tutor's last reply ride along the same way (item order shows which are new).
    const tries = completed ? null : await pendingQuickTryNote(db, map, learnerId, session.id);
    // A quiz pass moved the Learner onto a step the Tutor has not taught yet, so it cannot be finished in this turn.
    if (quiz?.passed) await updateTurn(db, turn.id, { freshStep: true });
    // Where the Learner stands: opens the Session, and is sent again as a new message whenever it changes.
    const stands = standsBlock(await learnerSummary(db, map, learnerId), await profileBlock(db, learnerId));
    if (log.messages.length === 0) {
      // The API rejects a system message as the first message, so a Session's opening context is
      // the first block of the Learner's first message.
      // Order: the Learner summary, the Learner Profile (if shared), then the Navigator context last. A completed Topic's
      // note already tells the Tutor to stop, so it opens with no Navigator context for another Topic.
      const opening = [stands, quiz?.text, tries, completed ? undefined : context].filter(Boolean).join("\n\n");
      await log.append({ role: "user", content: [{ type: "text", text: opening }, ...learnerBlocks] });
    } else {
      // The API accepts a system message only right after a user message (live 400 otherwise),
      // so changed context follows the Learner's message. Nothing already sent is rebuilt.
      // A quiz result or a changed stands block goes in the same system message as the context, which always ends it.
      const standsChanged = !standsAlreadySent(log.messages, stands);
      const contextChanged = standsChanged || quiz !== null || tries !== null || !lastContextSent(log.messages)?.endsWith(context);
      // Pasted text goes in the Learner's own message, as a marked block after what they typed.
      await log.append({ role: "user", content: learnerBlocks.length > 1 ? learnerBlocks : learnerText });
      // A completed Topic's note already tells the Tutor to stop: it gets no context for another Topic.
      if (contextChanged && !completed) await log.append({ role: "system", content: [standsChanged ? stands : undefined, quiz?.text, tries, context].filter(Boolean).join("\n\n") });
    }
    if (quiz) await markQuizReported(db, quiz.attemptIds, now(), learnerId);
    // A converted step shows what code shows on entering it (its Concept card and Widget, or the next Quick try) before
    // the reply. A Quick-try follow-up posts its fresh try after the reply instead. A typed message or help chip on a
    // step not yet begun (a quiz pass moved the Learner on, or a Due Check reopened the Topic) draws that step's divider
    // first. A Next stored its own when it took the move.
    if (!completed && turnKind(turn) !== "quick_try_follow_up") {
      const typed = turnKind(turn) === "message" || turnKind(turn) === "chip";
      const unbegun = typed && (quiz?.passed || comingBack.some((i) => i.kind === DUE_CHECK)) ? session.topicId : null;
      const entered = unbegun ? await storeStepDivider(db, map, learnerId, session.id, unbegun, now()) : await enterStepItems(db, map, learnerId, session.id, now());
      for (const item of entered) yield { type: "item", item };
    }
    liveFacts = facts;
  }
  // An own-question reply streams behind the stream guard (A5, ADR 0017); every other reply is held, checked, then shown
  // (ADR 0008). With the checks off (the tutor eval) nothing is guarded: the reply is shown as it came.
  const live = ownQ && deps.checkReplies !== false && liveFacts !== undefined;
  let guardStopped: { hit: GuardHit; stepShown: string; anyShown: boolean } | undefined;
  const liveStream = (prior: string) => (live && liveFacts ? { guard: new StreamGuard({ blockedNumbers: liveFacts.blockedNumbers, internalWords: liveFacts.internalWords }), prior } : undefined);

  async function* repairToolCalls(): AsyncGenerator<TurnEvent> {
    const pending = unansweredToolCalls(log.messages);
    if (!pending.length) return;
    await log.append({ role: "user", content: await rerunToolCalls(pending, code) });
    yield* reportSaveFailure();
  }

  let saveFailureReported = false;
  // An item was reported since the reply's last text: the text after it starts a new part, with no paragraph break.
  let itemSinceText = false;
  /**
   * Tells the browser of a failed progress write once, and of each Session item the tools stored since the last report.
   * During a reply the items and Widget states go to `held` instead: they are sent, in their order, with the checked reply.
   */
  async function* reportSaveFailure(held?: TurnEvent[]): AsyncGenerator<TurnEvent> {
    if (effects.saveFailed && !saveFailureReported) {
      saveFailureReported = true;
      yield { type: "save_failed", message: SAVE_FAILED_MESSAGE };
    }
    const out: TurnEvent[] = [];
    // A tool that moved the Learner onto a new step stored what code shows on entering it right after the divider.
    for (const item of effects.items?.splice(0) ?? []) {
      itemSinceText = true;
      out.push({ type: "item", item });
    }
    // update_widget saved new slider values: the open Widget moves to them.
    for (const state of effects.widgetStates?.splice(0) ?? []) out.push(state);
    if (held) held.push(...out);
    else yield* out;
  }

  /**
   * Whether this is the first turn after a refreeze (`refreezeIfChanged`): nothing but tool results (an earlier cut-off's
   * repair) is stored since `refrozenAtSeq`, and there is a reply before it to fold.
   */
  function refreezeFold(s: Session, l: Log): boolean {
    const at = s.refrozenAtSeq;
    if (at === null || at <= 0 || l.messages.at(-1)?.role !== "assistant" || isCompaction(l.messages.at(-1)?.content)) return false;
    // A heal (A2) moves the marker the same way; when its retry also failed with nothing stored after it, the next turn
    // folds once more than it needed to, which is harmless (the history is only summarised).
    return l.rows.filter((r) => r.seq >= at).every((r) => r.role === "user" && Array.isArray(r.content) && r.content.every((b) => b?.type === "tool_result"));
  }

  /**
   * Folds the history into one compaction window (the compaction request sends no instructions, see openai.ts), so
   * the reply's request carries the summary under the new instructions and no reply from before the change. No summary (or a failed call): the turn carries on uncompacted.
   */
  async function* foldHistory(): AsyncGenerator<TurnEvent, { usage?: ApiUsage; ms: number; stopReason: string | null } | undefined> {
    progress("Thinking…");
    const start = performance.now();
    // Aborted when the fold is given up (a cut-off, a failure), so its request does not run on in the background.
    const giveUp = new AbortController();
    try {
      const final = await beforeDeadline(client.compact({ model: session.model, messages: [...log.messages] }, { signal: AbortSignal.any([stop, giveUp.signal]) }), deadline, stop);
      if (!isCompaction(final.content)) return undefined;
      await log.append({ role: "assistant", content: final.content });
      // The summary stands in for everything before it, from this turn's request on.
      log.messages.splice(0, log.messages.length - 1);
      return { usage: final.usage, ms: Math.round(performance.now() - start), stopReason: final.stopReason };
    } catch (error) {
      giveUp.abort();
      if (error instanceof CutOff || error instanceof StopRequested || stop.aborted) throw error;
      console.warn("The refreeze fold failed; the turn carries on uncompacted.", error);
      return undefined;
    }
  }

  const activeSession = session;
  const { compactAtTokens } = await readSettings(db);
  let stopReason: string | null = null;
  // The Learner pressed Stop and the reply ended there.
  let stopped = false;
  /** The usage of the reply's last stored step: how big the conversation has grown, for the compaction after the checks. */
  let lastUsage: ApiUsage | undefined;

  /**
   * Runs Tool Runner over the log's messages and saves each loop step. In a held turn nothing of the reply streams: its
   * text, items and Widget states go to `held`, in order, and are sent only once code has checked the reply (ADR 0008).
   * In a streamed turn (`live`, A5 and ADR 0017) the same events go to the browser as they come, the text through the
   * stream guard a sentence at a time; on a hit the runner is aborted and `guardStopped` says where the stream stopped.
   * Progress labels, pings and a failed save reach the browser at once either way. Returns the replies' text.
   */
  async function* loop(held: TurnEvent[], live?: { guard: StreamGuard; prior: string }): AsyncGenerator<TurnEvent, string> {
    // Aborted on a cut-off too, so closing the runner never waits on a request still open: the turn must save and answer
    // in time. A streamed reply's runner is aborted the same way when the guard stops it.
    const cut = new AbortController();
    const runner = runTools(client, requestFor(activeSession, [...log.messages], code), { signal: AbortSignal.any([stop, cut.signal]) });
    // The runner's history, up to here, is stored.
    let saved = log.messages.length;
    // Saves anything the runner added to history that isn't stored yet (tool results).
    const syncRunnerHistory = async () => {
      const all = runner.params.messages;
      for (; saved < all.length; saved++) await log.append(all[saved]);
    };
    // In a streamed reply, how many of `held` have gone to the browser.
    let sent = 0;
    function* flush(): Generator<TurnEvent> {
      if (!live) return;
      const out = held.slice(sent);
      sent = held.length;
      yield* out;
    }
    // A resumed streamed reply carries on after the text it showed again (its replay), so its next part starts a new paragraph.
    let text = live?.prior ?? "";
    // The reply's citation numbers and sources run once across all its loop steps, as displayText and replyFold show them on reload.
    const marks = new CitationMarks();
    let shownText = live?.prior ?? "";
    // What the streamed step being written has shown so far, without the paragraph break before it (kept on a guard hit).
    let stepShown = "";
    // A step's time runs from the end of the one before (so it includes the tools that ran between) to its final message.
    let stepStart = performance.now();
    const steps = runner[Symbol.asyncIterator]();
    // What the loop waits on now: on Stop, a tool inside it runs to its end before anything is saved.
    let pending: Promise<unknown> | undefined;
    try {
      for (;;) {
        const next = await beforeDeadline((pending = steps.next()), deadline, stop);
        if (next.done) break;
        const stream = next.value;
        await syncRunnerHistory();
        yield* reportSaveFailure(held);
        yield* flush();
        progress("Thinking…");
        const events = stream[Symbol.asyncIterator]();
        let stepHasText = false;
        stepShown = "";
        // Citation markers follow each cited block.
        marks.newStep();
        const cited = new Map<number, Citation[]>();
        const show = (shown: string): TurnEvent[] => {
          if (!shown) return [];
          // Text after a tool call is a new loop step: start it on a new paragraph, unless an item began a new part.
          const out: TurnEvent[] = !stepHasText && text && !itemSinceText ? [{ type: "text", text: PARAGRAPH }] : [];
          stepHasText = true;
          itemSinceText = false;
          shownText += (out.length ? PARAGRAPH : "") + shown;
          stepShown += shown;
          return [...out, { type: "text", text: shown }];
        };
        // A streamed reply's text goes through the guard first: whole sentences that pass show, and a hit stops the stream.
        const guarded = (step: { show: string; hit?: GuardHit }) => {
          held.push(...show(step.show));
          if (step.hit) {
            cut.abort();
            throw new GuardStopped(step.hit, stepShown);
          }
        };
        const pass = (added: string) => (live ? guarded(live.guard.push(added)) : held.push(...show(added)));
        for (;;) {
          const event = await beforeDeadline((pending = events.next()), deadline, stop);
          if (event.done) break;
          const e = event.value;
          clock.modelEvent();
          if (e.type === "text" && e.text) pass(marks.add(e.text));
          if (e.type === "citation") cited.set(e.block, [...(cited.get(e.block) ?? []), e.citation]);
          if (e.type === "block_stop") pass(marks.markers(cited.get(e.block)));
          yield* flush();
        }
        // The step's text has ended: what the guard still holds is a sentence too.
        if (live) guarded(live.guard.end());
        yield* flush();
        const final = await beforeDeadline((pending = stream.final()), deadline, stop);
        // A step that streamed no text (a tool call alone) is still the model's first event when it is the first step.
        clock.modelEvent();
        const tools = final.content.flatMap((b) => (b.type === "tool_use" ? [b.name] : []));
        await saveStep(activeSession.model, (n) => stepUsage(activeSession.model, n, final.usage, tools, Math.round(performance.now() - stepStart), final.stopReason));
        stepStart = performance.now();
        stopReason = final.stopReason;
        saved++;
        // The step has ended: its text is stored with it below (or discarded, if declined).
        // A declined reply is incomplete: it is discarded, never stored (docs: "treat any partial output as incomplete and discard it").
        if (final.stopReason === "refusal") continue;
        await log.append({ role: "assistant", content: final.content });
        lastUsage = final.usage;
        const added = textOf(final.content);
        text += text && added ? PARAGRAPH + added : added;
      }
    } catch (error) {
      if (error instanceof GuardStopped) {
        // The guard stopped the stream (A5): the step being written is never stored, and no new API call starts. Every
        // stored tool call already has its result; any the runner holds that is not stored yet is stored now.
        await Promise.resolve(steps.return?.()).catch(() => {});
        const all = runner.params.messages;
        for (; saved < all.length; saved++) if (all[saved].role !== "assistant") await log.append(all[saved]);
        guardStopped = { hit: error.hit, stepShown: error.stepShown, anyShown: shownText.trim() !== "" };
        yield* reportSaveFailure(held);
        yield* flush();
        return text;
      }
      // On Stop the aborted stream may fail first, with an abort error: once the signal is aborted, any failure here is the Stop.
      if (!(error instanceof StopRequested) && !stop.aborted) {
        // A cut-off or a failure: the open request is aborted, so closing the runner returns at once.
        cut.abort();
        await Promise.resolve(steps.return?.()).catch(() => {});
        throw error;
      }
      // Stop: a tool already running finishes its transaction, and no new API call starts (the signal is aborted).
      await beforeDeadline(Promise.resolve(pending).catch(() => {}), deadline);
      await Promise.resolve(steps.return?.()).catch(() => {});
      // Every stored tool call gets its result; the reply being streamed was never stored, so it is not taken from the runner.
      // The held reply is dropped (ADR 0008): what the step had written is never stored or shown.
      const all = runner.params.messages;
      for (; saved < all.length; saved++) if (all[saved].role !== "assistant") await log.append(all[saved]);
      stopReason = "stopped";
      stopped = true;
    }
    if (!stopped) await syncRunnerHistory();
    yield* reportSaveFailure(held);
    // The reply's sources fold into one line at its end (a declined reply is replayed whole instead).
    if (stopReason !== "refusal" && !stopped) {
      const fold = replyFold(marks, shownText, await sourceContext({ db, map, learnerId }, marks.cited()));
      if (fold) held.push({ type: "text", text: fold });
    }
    yield* flush();
    return text;
  }

  // A resumed turn whose final reply was already saved has nothing left to ask the model; it is still checked below.
  const last = log.messages.at(-1);
  const complete = last?.role === "assistant" && unansweredToolCalls(log.messages).length === 0;
  // Text a resumed turn had stored before its cut-off: the reply is then sent whole, as a reload draws it.
  const storedBefore = resumed !== undefined && replyTextAfter(log.rows, turnSeq) !== "";
  const draftHeld: TurnEvent[] = [];
  // A resumed streamed reply showed its stored text again (its replay): what it writes now follows that.
  if (!complete) yield* loop(draftHeld, liveStream(replayed));

  // The reply checks (ADR 0008). Rows the Learner never sees: the draft's text, the correction, a failed retry
  // (`rejectedRows` holds the rule). A resume starts from what the run before it had rejected: its record, saved at each
  // rejection, or for older rows the correction message.
  const rejected = resumed ? rejectedRows(log.rows, turnSeq, { saved: await turnRejectedSeqs(db, session.id, turnSeq) }) : new Set<number>();
  // The reply being checked is what was written after this seq: the turn's, or the correction's on the retry.
  let replyFrom = turnSeq;
  let retried = false;
  let correction: string | null = null;
  // What the record keeps of the checks: their problems, and in a streamed reply the guard's hit (rule "guard").
  let draftProblems: { rule: string; message: string }[] = [];
  let retryProblems: { rule: string; message: string }[] = [];
  let fellBack = false;
  // A resume after the retry had begun carries on with the retry. The correction is the one rejected row the Tutor did not write.
  const resumedCorrection = log.rows.findLast((r) => rejected.has(r.seq) && r.role !== "assistant");
  if (resumedCorrection) {
    replyFrom = resumedCorrection.seq;
    retried = true;
    correction = textOf(resumedCorrection.content);
  }
  /**
   * Rejects the reply written after `replyFrom`, stores what replaces it (the fixed reply or the fallback), then saves the
   * rejection at once, so a cut-off or a resume keeps it. Stored first: a run cut off in between checks the reply again.
   */
  const rejectReply = async (replacement?: Message) => {
    for (const seq of rejectedRows(log.rows, turnSeq, { rejecting: replyFrom })) rejected.add(seq);
    if (replacement) await log.append(replacement);
    await saveRejectedSeqs(db, { sessionId: session.id, turnSeq, cap: gateFacts.cap, rejectedSeqs: [...rejected].sort((a, b) => a - b) });
  };
  // A max_tokens reply is checked like any other; a tool call it was cut off in is never run, and is answered first.
  const answerTruncated = async () => {
    if (stopReason !== "max_tokens") return;
    const truncated = unansweredToolCalls(log.messages);
    if (truncated.length) {
      await log.append({ role: "user", content: truncated.map((use) => ({ type: "tool_result" as const, tool_use_id: use.id, content: NOT_RUN, is_error: true })) });
    }
  };
  await answerTruncated();
  const stoppedNow = () => stopReason === "stopped" || stop.aborted;
  const engine = usesWidgetEngine(activeSession);
  const covering = activeSession.topicId ? map.topic(activeSession.topicId) : undefined;
  // The facts the reply is held to: worked out again when a tool moved the Learner's step during the draft, or on a resume.
  const moved = draftHeld.some((e) => e.type === "item" && e.item.kind === STEP_DIVIDER);
  const placeNow = passedTopic ? null : navigate(map, await loadProgress(db, learnerId));
  const factsNow = facts && !moved ? facts : await turnFacts(db, map, learnerId, passedTopic ? placeAtStart : placeNow, { learnerText: turn.input ?? undefined, now: now() });
  const gateFacts = ownQ ? ownQuestionFacts(factsNow) : factsNow;

  /** The items stored for this turn's reply so far, by a tool call or by code (reply-items.ts). */
  const itemsOfReply = (items: StoredItem[]) => replyItems(items, log.rows, { turnSeq, id: turn.id, next: turnKind(turn) === "next" });

  /** Fixes and checks the reply written after `replyFrom`. */
  const judgeNow = async (): Promise<Judged> => {
    // A resumed turn's record may already reject rows after `replyFrom` (a failed retry before its fallback): never judged again.
    const text = replyTextAfter(withoutRejected(log.rows, rejected), replyFrom);
    const items = await loadSessionItems(db, session.id, learnerId);
    // Without the widget engine an openui-lang fence is checked as before: it draws, keeps the Widget rules, leaves written-ahead parts alone.
    let fenceProblems: ReturnType<typeof newReplyWidgetProblems> = [];
    if (!engine && text.includes(WIDGET_OPEN)) {
      const heldBack = covering ? exploreHeldBack(covering, (await loadProgress(db, learnerId)).topics[covering.id]) : null;
      const covered = covering ? coveredParts(covering).map((w) => (w.id === heldBack ? { ...w, held: true } : w)) : [];
      const openBefore = drawnWidgets(replyTexts(log.rows.filter((r) => r.seq < turnSeq)), items);
      // A Widget code showed in this reply (reply-items.ts) stays on screen, a rejected draft's included: a fence would be a second.
      const shownInReply = itemsOfReply(items).some((i) => i.kind === WIDGET_SHOWN);
      fenceProblems = newReplyWidgetProblems(text, openBefore.map((w) => w.code), covered, shownInReply);
    }
    // A formula marker the Tutor wrote that cannot be drawn shows as nothing on screen: say so in the server log.
    if (hasMarkers(text)) {
      const problems = markerProblems(text);
      if (problems.length) console.warn(`Formula markers in a Tutor reply that cannot be drawn (Session ${session.id}, turn ${turnSeq}):`, problems);
    }
    const judged = judgeReply(text, toolWidgets(log.rows, replyFrom, items), gateFacts, {
      engine,
      fenceProblems,
      savedRule: savedRuleOf(items.filter((i) => i.afterSeq >= turnSeq)),
      writtenAhead: covering ? writtenAheadWidgets(covering) : undefined,
    });
    return deps.checkReplies === false ? { ...judged, draft: { ...judged.draft, text }, changed: false, problems: [] } : judged;
  };

  /** Stores the fixed reply as the turn's final assistant text, keeping each block's citations; the rows it replaces are rejected. */
  const storeFixed = async () => {
    const blocks: { type: "text"; text: string; citations?: unknown }[] = [];
    for (const r of log.rows.filter((r) => r.seq > replyFrom && r.role === "assistant" && !rejected.has(r.seq))) {
      const texts = Array.isArray(r.content) ? (r.content as { type?: string; text?: string; citations?: unknown }[]).filter((b) => b?.type === "text" && b.text) : [];
      texts.forEach((b, i) => {
        blocks.push({ type: "text", text: (blocks.length && i === 0 ? PARAGRAPH : "") + b.text!, ...(b.citations !== undefined && { citations: b.citations }) });
      });
    }
    // Fixed whole, as the checks read it (replyTextAfter), so what is stored is the reply that passed.
    const fixed = fixReplyBlocks(blocks.map((b) => b.text));
    blocks.forEach((b, i) => (b.text = fixed[i]));
    await rejectReply({ role: "assistant", content: blocks as never });
  };

  // What follows the reply's text in an own-question turn: the open step item, shown again (A4, A5).
  const afterReply: TurnEvent[] = [];

  /**
   * Shows the fallback, stored as the turn's final text. A step-led turn gets the step's card when there is one, else the
   * reply cut to its cap. An own-question turn gets one fixed line, then the open Quick try again (A4): the card's
   * write-down line is never the answer to a question.
   */
  const fallBack = async (text: string, problems: Judged["problems"]): Promise<TurnEvent[]> => {
    fellBack = true;
    if (ownQ) {
      await rejectReply({ role: "assistant", content: [{ type: "text", text: OWN_QUESTION_FALLBACK }] });
      const open = await openTryItem(db, learnerId, passedTopic ? null : placeNow);
      if (open) {
        await saveItemAfterLatest(db, learnerId, session.id, open, now());
        afterReply.push({ type: "item", item: open });
      }
      return [];
    }
    const card = await practiceFallback(db, learnerId, passedTopic ? null : placeNow);
    // A Widget that failed its checks never shows in the fallback.
    const shown = card ? card.text : trimmedFallback(text, gateFacts.cap, problems.some((p) => p.rule === "V4"), problems.some((p) => p.rule === "V8"));
    await rejectReply({ role: "assistant", content: [{ type: "text", text: shown }] });
    const out: TurnEvent[] = [];
    for (const item of card?.items ?? []) {
      await saveItemAfterLatest(db, learnerId, session.id, item, now());
      out.push({ type: "item", item });
    }
    return out;
  };

  /**
   * The turn's Widget and where it came from: the step's (code stored one: a card preset, the reveal or explore Widget,
   * a re-teach's practice Widget), the Tutor's (its own show_widget, compose_widget, open_widget or update_widget), or a
   * Companion Widget code stores now. Called once, after every Widget code stores in the turn (the end of runLockedTurn).
   */
  const companionWidget = async (): Promise<{ source: string; item?: SessionItem }> => {
    const items = await loadSessionItems(db, session.id, learnerId);
    // A Next's own items (the step's Widget, the Concept card's preset) are the reply's too (reply-items.ts).
    const widgets = itemsOfReply(items).filter((i) => i.kind === WIDGET_SHOWN || i.kind === WIDGET_OPENED);
    // More Widgets than the Tutor's own calls stored: code stored one for the step, and step wins.
    if (widgets.length) return { source: widgets.length > toolWidgets(log.rows, turnSeq, items).length ? "step" : "tutor" };
    // An open Widget the Tutor moved with update_widget is the reply's one Widget too (replyWidgets in tools.ts).
    if ((await widgetsUpdatedInTurn(db, turn.id)).size) return { source: "tutor" };
    // An own-question reply changes the Widget only when the Tutor opens one: no Companion Widget (B6, ADR 0019).
    if (stoppedNow() || !covering || ownQ) return { source: "none" };
    const at = [placeNow, placeAtStart].find((p) => p?.topic.id === covering.id);
    const shown = items.flatMap((i) => (i.kind === WIDGET_SHOWN ? [i.data as ShownWidget] : []));
    const lingoTerm = (w: ShownWidget) => w.companionKey ?? String((w.params.inputs as { term?: unknown } | undefined)?.term ?? "");
    const picked = pickCompanion({
      topic: covering,
      place: { step: at?.step ?? "principle", check: at?.check?.id ?? null },
      replyText: await shownText(),
      shownThisSession: {
        // A scene counts once shown, whoever showed it: a Companion scene, or a headline scene the Tutor named.
        scenes: shown.flatMap((w) => (w.scene ? [w.scene] : w.companion === "scene" && w.companionKey ? [w.companionKey] : [])),
        terms: shown.flatMap((w) => (w.recipe === "lingo_card" ? [lingoTerm(w)] : [])),
      },
      blocked: gateFacts.blockedNumbers,
      // The Learner's own words only (a Choice or a chip): a code-written note quotes Quick tries ("What is one basis point…?").
      learnerText: turnKind(turn) === "message" || turnKind(turn) === "chip" ? turn.input : null,
    });
    const built = picked ? recipeById(picked.recipe)?.build(picked.params) : undefined;
    if (!picked) return { source: "none" };
    if (!built?.ok) {
      console.error(`Companion Widget "${picked.kind}" of Topic "${covering.id}" does not build${built && !built.ok ? `: ${built.error}` : ""}.`);
      return { source: "none" };
    }
    const data: ShownWidget = {
      id: `companion-${turnSeq}`,
      recipe: picked.recipe,
      params: built.params,
      title: built.title,
      code: built.code,
      source: "companion",
      companion: picked.kind,
      companionKey: picked.key,
    };
    const item: SessionItem = { kind: WIDGET_SHOWN, data };
    await saveItemAfterLatest(db, learnerId, session.id, item, now());
    return { source: picked.kind, item };
  };

  /**
   * Folds the Session into one compaction window (no instructions are sent with it), from what the next turn would
   * send (the rows the checks rejected left out). Best effort, in the time the turn has left: the reply has already been sent, so a failure, a
   * Stop or the time running out leaves the Session uncompacted, and a later turn tries again.
   */
  async function compactSession() {
    const room = deadline - performance.now() - COMPACT_MARGIN_MS;
    if (room <= 0) return;
    const start = performance.now();
    const outOfTime = new AbortController();
    const timer = setTimeout(() => outOfTime.abort(), room);
    try {
      const sent = (await openLog(db, session.id, now)).messages;
      const summary = await client.compact({ model: session.model, messages: sent }, { signal: AbortSignal.any([stop, outOfTime.signal]) });
      if (!isCompaction(summary.content)) return;
      // The summary stands in for everything before it from the next request on.
      await log.append({ role: "assistant", content: summary.content });
      await saveStep(session.model, (n) => stepUsage(session.model, n, summary.usage, ["compaction"], Math.round(performance.now() - start), summary.stopReason));
    } catch (error) {
      console.warn("The compaction failed; the Session carries on uncompacted.", error);
    } finally {
      clearTimeout(timer);
    }
  }

  const nonText = (held: TurnEvent[]) => held.filter((e) => e.type !== "text");
  const shownText = () => turnText(log.rows, turnSeq, { db, map, learnerId }, rejected);
  // What the browser gets once the checks are done: the held items and Widget states in their order, with the checked reply.
  let toSend: TurnEvent[] = [];
  const replyEvent = async (): Promise<TurnEvent[]> => {
    const text = await shownText();
    return text ? [{ type: "text", text }] : [];
  };

  if (stoppedNow()) {
    // Stop: the held reply is dropped. Every stored tool call has its result; the items tools stored stay. A streamed
    // reply's items already went to the browser, and the page drops the text it showed (ADR 0017 keeps ADR 0008's Stop).
    stopReason = "stopped";
    await rejectReply();
    toSend = live ? [] : nonText(draftHeld);
  } else if (stopReason === "refusal") {
    // The declined step is discarded; earlier steps' text shows only if it passes its checks (it is never retried). A
    // streamed reply's earlier steps were shown already: their checks are soft, and they stay (A5).
    if (!live) progress(CHECKING_LABEL);
    const judged = await judgeNow();
    draftProblems = judged.problems;
    if (!live && (judged.problems.length || judged.changed)) await rejectReply();
    toSend = live ? [] : nonText(draftHeld);
  } else if (live) {
    // A streamed reply (A5): what was shown stays. On a guard hit the stream stopped before the sentence it stopped on,
    // and the fixed line follows what was shown, stored with the step's shown text so a reload reads the same. Otherwise
    // the checks are soft: measured on the reply as shown and recorded, with no retry, no fix and no fallback.
    if (guardStopped) {
      fellBack = true;
      const { hit, stepShown, anyShown } = guardStopped;
      await log.append({ role: "assistant", content: [{ type: "text", text: [stepShown.trim() ? stepShown : "", OWN_QUESTION_FALLBACK].filter(Boolean).join(PARAGRAPH) }] });
      toSend = [{ type: "text", text: (anyShown ? PARAGRAPH : "") + OWN_QUESTION_FALLBACK }];
      draftProblems = [{ rule: GUARD_RULE, message: `The stream guard stopped the reply (${hit.rule}: ${hit.detail}) before "${hit.sentence.trim()}".` }];
    } else {
      const judged = await judgeNow();
      // Soft checks read the reply as the Learner saw it: style fixes were never applied to text already shown.
      draftProblems = checkReply({ ...judged.draft, text: replyTextAfter(withoutRejected(log.rows, rejected), replyFrom) }, judged.ctx);
      toSend = [];
    }
  } else {
    progress(CHECKING_LABEL);
    const judged = await judgeNow();
    if (retried) retryProblems = judged.problems;
    else draftProblems = judged.problems;
    if (!judged.problems.length) {
      if (judged.changed) {
        // Fixes cost no retry.
        await storeFixed();
        toSend = [...nonText(draftHeld), ...(await replyEvent())];
      } else toSend = storedBefore || resumedCorrection ? [...nonText(draftHeld), ...(await replyEvent())] : joinedEvents(draftHeld);
    } else if (!retried && performance.now() - runStart < (deps.retryWithinMs ?? RETRY_WITHIN_MS)) {
      // One retry: the correction carries every failed check's reason, the Widget correction's included.
      correction = retryMessage(judged, widgetsOnScreen(log.rows, replyFrom, await loadSessionItems(db, session.id, learnerId)));
      await log.append({ role: "user", content: correction });
      // The draft and the correction are rejected together, and saved before the retry runs.
      await rejectReply();
      replyFrom = log.nextSeq - 1;
      retried = true;
      const retryHeld: TurnEvent[] = [];
      yield* loop(retryHeld);
      await answerTruncated();
      if (stoppedNow()) {
        stopReason = "stopped";
        await rejectReply();
        toSend = [...nonText(draftHeld), ...nonText(retryHeld)];
      } else if (stopReason === "refusal") {
        // A declined retry is a refusal like any other: the draft it replaced was rejected, so no unchecked text shows.
        await rejectReply();
        toSend = [...nonText(draftHeld), ...nonText(retryHeld)];
      } else {
        const again = await judgeNow();
        retryProblems = again.problems;
        if (!again.problems.length) {
          if (again.changed) await storeFixed();
          toSend = again.changed ? [...nonText(draftHeld), ...nonText(retryHeld), ...(await replyEvent())] : [...nonText(draftHeld), ...joinedEvents(retryHeld)];
        } else {
          const items = await fallBack(again.draft.text, again.problems);
          toSend = [...nonText(draftHeld), ...nonText(retryHeld), ...items, ...(await replyEvent())];
        }
      }
    } else {
      // Over the time limit (or the retry already ran): straight to the fallback.
      const items = await fallBack(judged.draft.text, judged.problems);
      toSend = [...nonText(draftHeld), ...items, ...(await replyEvent())];
    }
  }
  // Back to the step (A5): under an own-question reply code shows the open Quick try again, so the Learner never scrolls
  // back to find it. Not when the fallback already did (A4), after a Stop, or when this turn showed that try already.
  if (ownQ && !afterReply.length && stopReason !== "stopped") {
    const open = await openTryItem(db, learnerId, passedTopic ? null : placeNow);
    const key = open && (open.data as QuickTryData).key;
    const inTurn = (await loadSessionItems(db, session.id, learnerId)).some((i) => i.afterSeq >= turnSeq && i.kind === QUICK_TRY && (i.data as QuickTryData).key === key);
    if (open && !inTurn) {
      await saveItemAfterLatest(db, learnerId, session.id, open, now());
      afterReply.push({ type: "item", item: open });
    }
  }
  // What follows the reply, in order: its Choices, a refusal, cut-off or Stop notice, a Quick-try follow-up's items and
  // the Topic complete card. Code stores each before anything is released, so the Companion gate below sees them all.
  const after: TurnEvent[] = [];

  // Two or three Choices under every checked reply (ADR 0010), stored after it. None once the Topic is passed (in an
  // earlier turn or this one: its Topic complete card offers what comes next), or after a Stop (the page then shows
  // code's own set).
  let droppedChoice: string | null = null;
  const stored =
    !passedTopic && stopReason !== "stopped"
      ? await storeReplyChoices(db, map, { learnerId, sessionId: session.id, topicId: session.topicId, turnSeq, input: turn.input, rows: log.rows, now: now(), replyText: await shownText() })
      : null;
  if (stored) {
    droppedChoice = stored.dropped;
    after.push({ type: "item", item: stored.item });
  }

  if (stopReason === "refusal") {
    // Loop steps before the declined one are stored, and so are their tool calls' effects.
    const saves = await db
      .select({ id: toolCalls.toolCallId })
      .from(toolCalls)
      .where(and(eq(toolCalls.turnId, turn.id), eq(toolCalls.isError, false)));
    after.push({ type: "refusal", message: saves.length ? REFUSAL_AFTER_SAVES_MESSAGE : REFUSAL_MESSAGE, text: await shownText() });
  } else if (stopReason === "max_tokens") {
    // Kept as checked; Finish this reply asks the Tutor to go on.
    after.push({ type: "cut_short", message: CUT_SHORT_MESSAGE });
  } else if (stopReason === "stopped") {
    // A reload shows where the reply was stopped. A Next the Learner already took stays taken.
    await saveItemAfterLatest(db, learnerId, session.id, { kind: STOPPED, data: { label: "Stopped" } }, now());
    after.push({ type: "stopped" });
  }
  // After a Quick-try follow-up (the slip named), code posts a fresh try under the reply. After a re-teach, code does
  // its method's part: a half-done try, the Widget in practice mode, or the first of a drill of five. Stop drops only
  // the reply text, so these still follow a stopped follow-up: Your turn is never left with no open try.
  if (turnKind(turn) === "quick_try_follow_up") {
    const method = methodInNote(turn.input);
    const items = method ? await afterReteachItems(db, map, learnerId, session.id, method, now()) : await enterStepItems(db, map, learnerId, session.id, now());
    for (const item of items) after.push({ type: "item", item });
  }

  // A Widget when it fits (spec 2026-11-12, B6, ADR 0019; was E4a's Widget with every reply): when neither the Tutor nor
  // code opened one in a step-led turn, code may add the step's scene or, asked what a word means, a Lingo card. It is picked last, once every Widget code stores in the turn is stored (a Next's
  // step Widget, start_again's or a step's items, a re-teach's practice Widget), so the gate sees them all and a turn
  // never gets two. Only the Topic complete card, never a Widget, comes after it: the turn still ends at that card.
  // Only in Sessions frozen with the widget engine on, and never after a Stop. The browser gets it before the reply's text.
  let widgetSource: string | null = null;
  if (engine) {
    const companion = await companionWidget();
    widgetSource = companion.source;
    if (companion.item) {
      const at = toSend.findIndex((e) => e.type === "text");
      toSend.splice(at < 0 ? toSend.length : at, 0, { type: "item", item: companion.item });
    }
  }
  // A turn that passed its Topic ends at the Topic complete card, after the closing reply; nothing more is started.
  const passedCard = await storeTopicComplete(db, map, learnerId, session.id, now());
  if (passedCard) after.push({ type: "item", item: passedCard });

  yield* toSend;
  yield* afterReply;
  yield* after;

  // The record of the checks: what failed and why, the retry, the fallback, and the rows the Learner never saw.
  const seen = replyTextAfter(withoutRejected(log.rows, rejected), turnSeq);
  const record = {
    sessionId: session.id,
    turnSeq,
    words: replyWords(seen),
    cap: gateFacts.cap,
    draftProblems,
    retryProblems,
    correction,
    retried,
    fallback: fellBack,
    stopped: stopReason === "stopped",
    rejectedSeqs: [...rejected].sort((a, b) => a - b),
    shownText: stopReason === "stopped" ? "" : await shownText(),
    // The Reply kind code chose; a Learner's own typed message with none is an answer to their own question (spec #229).
    replyKind: gateFacts.replyKind ?? (turnKind(turn) === "message" ? "answer_question" : null),
    widgetSource,
  };
  await saveReplyCheck(db, record);
  // A streamed own-question reply is timed against its own budget (first word), so its times are saved under its own kind.
  clock.replyKind = live ? OWN_QUESTION_KIND : record.replyKind;
  // On-demand compaction, once the reply is settled (never before the checks, which may still reject, fix or retry it):
  // a Session whose last request was past the setting folds into one summary, which the next turn starts from.
  if (!stoppedNow() && stopReason === "end_turn" && compactAtTokens > 0 && contextTokens(lastUsage) >= compactAtTokens) await compactSession();
  const total = await saveTurnTotal(db, session.id, turnSeq, session.model, Math.round(performance.now() - runStart), now(), summaryOf(record));
  // A suggest_choice label code dropped (too long, an emoji, a sum, a copy of a set label) is recorded with the turn.
  const usage = droppedChoice === null ? total : { ...total, droppedChoice };
  return { type: "done", stopReason, usage, ref: { sessionId: session.id, turnSeq }, shown: await shownInWorkspace(db, map, learnerId) };
}

/**
 * The Session a Next turn pinned when its Complete this Topic passed that Topic (it is no longer the current
 * Topic's), or undefined. Read from the turn, so a Retry finds it too. A Claude-era Session pinned before the
 * switch (ADR 0015) is closed, and the closing reply goes to a fresh Session of that Topic instead. A resumed turn
 * of any kind left in a Claude-era Session of a Topic that is no longer current is pinned the same way, so it is
 * answered in that Topic and starts nothing in the next one.
 */
async function completedSession(db: Db, map: CourseMap, turn: Turn, now: Date, resuming = false): Promise<Session | undefined> {
  const next = turnKind(turn) === "next";
  if ((!next && !resuming) || turn.sessionId === null) return undefined;
  const [pinned] = await db.select().from(sessions).where(and(eq(sessions.id, turn.sessionId), eq(sessions.learnerId, turn.learnerId)));
  if (!pinned || pinned.topicId === (await currentTopicId(db, map, turn.learnerId))) return undefined;
  // Any other resumed turn is rerun from its message where the Learner is now; only a Claude-era one is pinned to its Topic.
  if (!next && !isLegacySession(pinned)) return undefined;
  if (!isLegacySession(pinned)) return pinned;
  await retireLegacySessions(db, turn.learnerId, pinned.topicId);
  return sessionForTurn(db, now, turn.learnerId, pinned.topicId);
}

/** How big the conversation was on the last request, which the next request repeats and adds to (OpenAI's input count includes cached tokens). */
function contextTokens(usage: ApiUsage | undefined): number {
  if (!usage) return 0;
  return (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
}


