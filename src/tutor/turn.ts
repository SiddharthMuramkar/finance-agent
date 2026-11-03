import type { BetaContentBlock, BetaRawMessageStreamEvent } from "@anthropic-ai/sdk/resources/beta/messages";
import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import { and, eq } from "drizzle-orm";
import { loadCourseMap, type CourseMap } from "@/course/map";
import { navigate } from "@/course/navigator";
import { OWNER_LEARNER_ID, sessions, toolCalls } from "@/db/schema";
import type { Db } from "@/db/types";
import { ensureTopicStarted, learnerSummary, loadProgress } from "@/learner/memory";
import { profileBlock } from "@/learner/profile";
import { loadExploreInfo } from "@/learner/insight";
import { markQuizReported, pendingQuizNote, quizUnavailable } from "@/learner/quiz";
import type { QueryEmbedder } from "@/library/library";
import { newReplyWidgetProblems, openWidgetsIn, WIDGET_CHECK_PREFIX, type OpenWidget } from "@/widgets/check";
import { endedAtCheckWithoutVerdict, lastContextSent, noVerdictContext, openerNote, openWidgetsNote, standsAlreadySent, standsBlock, stepContext } from "./context";
import { CitationMarks, type Citation } from "./citations";
import { replyFold, sourceContext } from "./sources";
import type { SessionItem } from "./session-items";
import { comingBackItems, DUE_CHECK, storeComingBack } from "./coming-back";
import { storeTopicComplete } from "./topic-complete";
import { describeFailure, type FailureKind } from "./failures";
import { pasteBlock, pasteForTurn, pasteSummary, savePaste } from "./pasted";
import { type ToolDefinition } from "./instructions";
import {
  currentTopicId,
  isCompaction,
  liveSession,
  openLog,
  readSettings,
  refreezeIfChanged,
  saveShownSession,
  sessionForTurn,
  showsCurrentTopic,
  shownInWorkspace,
  STALE_TAB_MESSAGE,
  type Effort,
  type Log,
  type Message,
  type Session,
  type Shown,
} from "./session-log";
import { bindTools, caseDataFor, rerunToolCalls, SAVE_FAILED_MESSAGE, toolCode, unansweredToolCalls, type ToolCode, type ToolEffects } from "./tools";
import { PARAGRAPH, textOf, turnText } from "./transcript";
import { BUSY_MESSAGE, CONTINUE_TEXT, dropTurn, latestTurn, NEXT_PREFIX, QUIZ_FOLLOW_UP_PREFIX, resumeTurn, startTurn, turnKind, updateTurn, type Turn } from "./turn-status";
import { takeLearnersNext, type NextName } from "./next";
import { NO_MISSED_QUIZ, quizFollowUpNote } from "./check-results";
import { loadStepUsages, loadTurnUsages, saveStepUsage, saveTurnTotal, stepUsage, sumSteps, type ApiUsage, type TurnUsage } from "./usage";

/**
 * The Tutor Turn: one Learner action in, streamed events and saved state out. It takes the
 * one-turn lock, picks the Topic's Session (session-log.ts), sends changed context (context.ts), and
 * runs the Tool Runner loop with cut-off, compaction, refusal and widget-correction handling.
 */

export { latestTurn, BUSY_MESSAGE, CONTINUE_TEXT } from "./turn-status";

/** Room for adaptive thinking as well as the visible reply. */
const MAX_TOKENS = 16000;
/** On-demand compaction (beta); also needed on every request that carries a compaction block. */
const COMPACTION_BETA = "compact-2026-09-04";
/** The turn stops itself this long after it starts, inside Vercel's 300 seconds, so it can save and tell the browser. */
export const TIME_BUDGET_MS = 270_000;


/** The request the Tutor Turn builds; a subset of the SDK's Tool Runner params. */
export type TutorRequest = {
  model: string;
  max_tokens: number;
  system: { type: "text"; text: string }[];
  tools: BetaRunnableTool[];
  thinking: { type: "adaptive" };
  output_config: { effort: Effort };
  cache_control: { type: "ephemeral" };
  betas: string[];
  messages: Message[];
  stream: true;
};

type FinalMessage = { content: BetaContentBlock[]; stop_reason: string | null; usage?: ApiUsage };
type MessageStream = AsyncIterable<BetaRawMessageStreamEvent> & { finalMessage(): Promise<FinalMessage> };

/** The slice of the Anthropic client the Tutor Turn uses; tests pass a scripted stub. */
export type TutorClient = {
  beta: {
    messages: {
      toolRunner(params: TutorRequest): AsyncIterable<MessageStream> & {
        params: { messages: Message[] };
        /** Asks the runner for a summary once the current turn ends; it then replaces its history with the summary. */
        compactBeforeNextTurn(): void;
      };
    };
  };
};

export type TurnEvent =
  | { type: "text"; text: string }
  /**
   * The reply's widget failed the server check; the text that follows is its one correction. `widgets` are the
   * positions (from 0) of the reply's widgets it corrects, in order.
   */
  | { type: "correction"; widgets: number[] }
  /**
   * `ref` names the turn's Session and turn, so the browser can offer "Save to notes" on the reply at once.
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
  /** The reply hit max_tokens: it is kept as sent, and the Learner can continue. */
  | { type: "cut_short"; message: string }
  /**
   * The model declined; the declined loop step is discarded. `text` is the reply saved by earlier
   * loop steps of the turn, which is kept and replaces what the browser showed.
   */
  | { type: "refusal"; message: string; text: string }
  /** A tool could not save the Learner's progress. */
  | { type: "save_failed"; message: string }
  /** The API call failed; everything already saved is kept and the Learner can retry. */
  | { type: "error"; kind: FailureKind; message: string };

export const CUT_SHORT_MESSAGE = "The reply was cut short because it reached its length limit. Press Continue to carry on.";
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
    max_tokens: MAX_TOKENS,
    system: [{ type: "text", text: session.instructions }],
    tools: bindTools(session.tools as ToolDefinition[], code),
    thinking: { type: "adaptive" },
    output_config: { effort: session.effort as Effort },
    cache_control: { type: "ephemeral" },
    betas: [COMPACTION_BETA],
    messages: msgs,
    stream: true,
  };
}

/**
 * A new message, Continue (the cut-off reply's button), the opener (the page starts it when the Session it
 * shows has no messages; code writes its note), the Learner's Next (naming the step on its chip, or
 * "complete"; code writes its note), the quiz follow-up the page starts after a missed quiz (code writes its note),
 * or a resume of the last turn after a cut-off or failure (Retry).
 */
export type TurnInput = string | { continue: true } | { opener: true } | { next: NextName } | { quizFollowUp: true } | { resume: true } | PastedInput;
/** A message with text the Learner pasted (the part of a piece being studied), appended for the Tutor. */
export type PastedInput = { message: string; paste: string };

export type TurnDeps = {
  db: Db;
  client: TutorClient;
  /** The Learner taking the turn (the current Learner of the request); the owner when none is named. */
  learnerId?: number;
  map?: CourseMap;
  now?: () => Date;
  /** How long this run may take before it cuts itself off; defaults to TIME_BUDGET_MS. */
  timeBudgetMs?: number;
  /** Voyage query embeddings for Library search; without them search uses keyword results only. */
  embedQuery?: QueryEmbedder;
  /**
   * What the page that sent the turn shows (its Session, or for a Topic's first turn its Topic). The
   * turn is refused unless it is the Learner's current Topic. Left out, nothing is checked (test tools).
   */
  shown?: Shown;
};

/** Thrown when a run reaches its time budget. */
class CutOff extends Error {}

/** Resolves like the promise, or throws CutOff once the deadline (a performance.now() time) passes. */
async function beforeDeadline<T>(promise: Promise<T>, deadline: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new CutOff()), Math.max(0, deadline - performance.now()));
  });
  try {
    return await Promise.race([promise, late]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Runs one Tutor turn for one Learner: refuses a request from a tab showing another Topic, takes
 * their one-turn lock, saves their message in the live Session of their current Topic, streams the
 * reply through Tool Runner and saves each loop step's messages unchanged as they finish. After the
 * message, code appends the Course Navigator's context (and the Where the Learner stands block)
 * whenever it changed; a Topic's first turn makes its Session, which opens with both. A turn is
 * saved as running, cut off, finished or failed; `{ resume: true }` continues a cut-off or failed
 * turn from its last saved loop step.
 */
export async function* runTutorTurn(deps: TurnDeps, input: TurnInput): AsyncGenerator<TurnEvent> {
  const { db } = deps;
  const now = deps.now ?? (() => new Date());
  const deadline = performance.now() + (deps.timeBudgetMs ?? TIME_BUDGET_MS);
  const resuming = typeof input === "object" && "resume" in input;
  const learnerId = deps.learnerId ?? OWNER_LEARNER_ID;
  if (deps.shown && !(await showsCurrentTopic(db, deps.map ?? loadCourseMap(), learnerId, deps.shown))) {
    // A resume may still carry on the tab's own unfinished turn, which may itself have moved the Learner to the next Topic.
    const latest = resuming ? await latestTurn(db, learnerId) : undefined;
    const ownTurn = latest !== undefined && latest.status !== "finished" && "sessionId" in deps.shown && latest.sessionId === deps.shown.sessionId;
    if (!ownTurn) {
      yield { type: "stale", message: STALE_TAB_MESSAGE };
      return;
    }
  }
  let started = "";
  if (typeof input === "object" && "opener" in input) {
    const note = await openerFor(db, deps.map ?? loadCourseMap(), learnerId);
    // Another tab already opened this Topic: a reload shows its Session.
    if (note === null) {
      yield { type: "stale", message: STALE_TAB_MESSAGE };
      return;
    }
    started = note;
  } else if (typeof input === "object" && "next" in input) {
    // Code writes the Next's note once it has taken the move, inside the lock.
    started = NEXT_PREFIX;
  } else if (typeof input === "object" && "quizFollowUp" in input) {
    // Code writes the follow-up's note inside the lock, once it has found the missed quiz to go over.
    started = QUIZ_FOLLOW_UP_PREFIX;
  } else if (!resuming) started = learnerTextOf(input);
  const claim = resuming ? await resumeTurn(db, now(), learnerId) : { turn: await startTurn(db, now(), started, learnerId), alreadyFinished: false };
  if (!claim.turn) {
    yield { type: "busy", message: BUSY_MESSAGE };
    return;
  }
  let turn = claim.turn;
  if (typeof input === "object" && "next" in input) {
    const taken = await takeLearnersNext(db, deps.map ?? loadCourseMap(), learnerId, turn.id, input.next, now());
    if (!taken.ok) {
      // Nothing moved and nothing was stored: the turn goes, so the Learner's lock is free again.
      await dropTurn(db, turn.id);
      yield { type: "not_allowed", message: taken.reason };
      return;
    }
    turn = { ...turn, input: taken.note, sessionId: taken.sessionId, freshStep: true };
    // The dividers come before the reply that teaches the step.
    for (const item of taken.items) yield { type: "item", item };
  }
  if (typeof input === "object" && "quizFollowUp" in input) {
    const note = await quizFollowUpNote(db, deps.map ?? loadCourseMap(), learnerId);
    if (note === null) {
      // Already gone over (another tab), or nothing was missed: nothing ran, and the lock is free again.
      await dropTurn(db, turn.id);
      yield { type: "not_allowed", message: NO_MISSED_QUIZ };
      return;
    }
    await updateTurn(db, turn.id, { input: note });
    turn = { ...turn, input: note };
  }
  // Saved with the turn before anything else, so a retry still has it.
  if (typeof input === "object" && "paste" in input) await savePaste(db, turn.id, input.paste, now(), learnerId);
  if (claim.alreadyFinished) {
    // It finished after the browser lost the stream: show the saved reply.
    yield* finishedTurnReplay(db, deps.map ?? loadCourseMap(), turn);
    return;
  }
  let ended = false;
  try {
    const done = yield* runLockedTurn(deps, input, turn, deadline);
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
    console.error("Tutor turn failed", error);
    const failure = describeFailure(error);
    await updateTurn(db, turn.id, { status: "failed", error: failure.message });
    yield { type: "error", ...failure };
  } finally {
    // The caller stopped reading early: leave the turn resumable rather than locked.
    if (!ended) await updateTurn(db, turn.id, { status: "cut_off" });
  }
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

/**
 * The opener's note for the Learner's current Topic, written by code from their saved step, or null when
 * that Topic's Session already has messages (another tab opened it first).
 */
async function openerFor(db: Db, map: CourseMap, learnerId: number): Promise<string | null> {
  const live = await liveSession(db, learnerId, await currentTopicId(db, map, learnerId));
  if (live && (await openLog(db, live.id, () => new Date())).rows.length) return null;
  const place = navigate(map, await loadProgress(db, learnerId));
  const quizOpen = place?.step === "check" && place.check?.kind === "quiz" && !(await quizUnavailable(db, map, place.check));
  return openerNote(place, { quizOpen });
}

async function* runLockedTurn(deps: TurnDeps, input: TurnInput, turn: Turn, deadline: number): AsyncGenerator<TurnEvent, Extract<TurnEvent, { type: "done" }>> {
  const { db, client } = deps;
  const { learnerId } = turn;
  const map = deps.map ?? loadCourseMap();
  const now = deps.now ?? (() => new Date());
  const runStart = performance.now();
  const effects: ToolEffects = { saveFailed: false, items: [] };

  let session: Session;
  let log: Log;
  let turnSeq: number;
  let code: Record<string, ToolCode>;
  // A resume carries on from the last saved loop step, but only once the Learner's message is stored.
  let resumed: { session: Session; log: Log; turnSeq: number } | undefined;
  if (typeof input === "object" && "resume" in input && turn.sessionId !== null && turn.turnSeq !== null) {
    const [saved] = await db.select().from(sessions).where(eq(sessions.id, turn.sessionId));
    const savedLog = saved && (await openLog(db, saved.id, now));
    const turnSeq = turn.turnSeq;
    if (savedLog?.rows.some((r) => r.seq === turnSeq)) resumed = { session: saved, log: savedLog, turnSeq };
  }
  if (resumed) {
    ({ session, log, turnSeq } = resumed);
    code = toolCode(db, map, now, session.model, effects, turn, deps.embedQuery);
    yield { type: "replay", text: (await turnText(log.rows, turnSeq, { db, map, learnerId })) };
    yield* repairToolCalls();
  } else {
    // A new message, or a retry of a turn that failed before the Learner's message was stored:
    // that turn is run again from the message saved on it.
    // An opener sends the note code wrote for it, which its turn saved.
    const learnerText = typeof input === "object" && ("resume" in input || "opener" in input || "next" in input || "quizFollowUp" in input) ? (turn.input ?? CONTINUE_TEXT) : learnerTextOf(input);
    // Complete this Topic passed the Topic its Next pinned: the turn closes it in that Session, and starts nothing else.
    const completed = await completedSession(db, map, turn);
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
    session = await refreezeIfChanged(db, completed ?? (await sessionForTurn(db, now(), learnerId, place?.topic.id ?? null)));
    // The Study Workspace shows the Session the Learner's turns go to, and keeps showing it after a pass until they choose.
    await saveShownSession(db, learnerId, session.id);
    await storeComingBack(db, learnerId, session.id, comingBack, now());
    log = await openLog(db, session.id, now);
    // A paste belongs to the Session this turn runs in; the context counts what the Tutor has seen there.
    const paste = await pasteForTurn(db, turn.id, session.id, learnerId);
    const pastes = await pasteSummary(db, session.id, learnerId);
    const caseData = await caseDataFor(db, map, place, learnerId);
    const quizDown = place?.step === "check" && place.check?.kind === "quiz" && (await quizUnavailable(db, map, place.check));
    const plainContext = stepContext(place, caseData, pastes, quizDown, await loadExploreInfo(db, place, turn.id, learnerId));
    const stepped =
      place?.step === "check" && place.check?.kind === "conversation" && endedAtCheckWithoutVerdict(log.messages, place.check.id, plainContext)
        ? noVerdictContext({ ...place, check: place.check }, caseData, pastes)
        : plainContext;
    const learnerBlocks = [{ type: "text" as const, text: learnerText }, ...(paste ? [pasteBlock(paste.text)] : [])];
    code = toolCode(db, map, now, session.model, effects, turn, deps.embedQuery);
    // Tool calls left without results by an earlier cut-off are answered before anything follows them.
    yield* repairToolCalls();

    turnSeq = log.nextSeq;
    await updateTurn(db, turn.id, { sessionId: session.id, turnSeq });
    // The Widgets open in the panel, by title, so the Tutor can update one in place rather than add a near-copy.
    const widgetsNote = openWidgetsNote(openWidgetsBefore(log, turnSeq).map((w) => w.title));
    const context = widgetsNote ? `${widgetsNote}\n${stepped}` : stepped;
    // Quiz results marked by code since the Tutor's last call; each is told to the Tutor once.
    const quiz = completed ? null : await pendingQuizNote(db, map, learnerId, session.topicId);
    // A quiz pass moved the Learner onto a step the Tutor has not taught yet, so it cannot be finished in this turn.
    if (quiz?.passed) await updateTurn(db, turn.id, { freshStep: true });
    // Where the Learner stands: opens the Session, and is sent again as a new message whenever it changes.
    const stands = standsBlock(await learnerSummary(db, map, learnerId), await profileBlock(db, learnerId));
    if (log.messages.length === 0) {
      // The API rejects a system message as the first message, so a Session's opening context is
      // the first block of the Learner's first message.
      // Order: the Learner summary, the Learner Profile (if shared), then the Navigator context last.
      const opening = [stands, quiz?.text, context].filter(Boolean).join("\n\n");
      await log.append({ role: "user", content: [{ type: "text", text: opening }, ...learnerBlocks] });
    } else {
      // The API accepts a system message only right after a user message (live 400 otherwise),
      // so changed context follows the Learner's message. Nothing already sent is rebuilt.
      // A quiz result or a changed stands block goes in the same system message as the context, which always ends it.
      const standsChanged = !standsAlreadySent(log.messages, stands);
      const contextChanged = standsChanged || quiz !== null || !lastContextSent(log.messages)?.endsWith(context);
      // Pasted text goes in the Learner's own message, as a marked block after what they typed.
      await log.append({ role: "user", content: paste ? learnerBlocks : learnerText });
      // A completed Topic's note already tells the Tutor to stop: it gets no context for another Topic.
      if (contextChanged && !completed) await log.append({ role: "system", content: [standsChanged ? stands : undefined, quiz?.text, context].filter(Boolean).join("\n\n") });
    }
    if (quiz) await markQuizReported(db, quiz.attemptIds, now(), learnerId);
  }

  async function* repairToolCalls(): AsyncGenerator<TurnEvent> {
    const pending = unansweredToolCalls(log.messages);
    if (!pending.length) return;
    await log.append({ role: "user", content: await rerunToolCalls(pending, code) });
    yield* reportSaveFailure();
  }

  let saveFailureReported = false;
  // An item was reported since the reply's last text: the text after it starts a new part, with no paragraph break.
  let itemSinceText = false;
  /** Tells the browser of a failed progress write once, and of each Session item the tools stored since the last report. */
  async function* reportSaveFailure(): AsyncGenerator<TurnEvent> {
    if (effects.saveFailed && !saveFailureReported) {
      saveFailureReported = true;
      yield { type: "save_failed", message: SAVE_FAILED_MESSAGE };
    }
    for (const item of effects.items?.splice(0) ?? []) {
      itemSinceText = true;
      yield { type: "item", item };
    }
  }

  const activeSession = session;
  const { compactAtTokens } = await readSettings(db);
  let stepNo = (await loadStepUsages(db, session.id, turnSeq)).length;
  let stopReason: string | null = null;

  // Runs Tool Runner over the log's messages, streaming text and saving each loop step. Returns the replies' text.
  async function* loop(): AsyncGenerator<TurnEvent, string> {
    const runner = client.beta.messages.toolRunner(requestFor(activeSession, [...log.messages], code));
    // The runner's history, up to here, is stored.
    let saved = log.messages.length;
    // Saves anything the runner added to history that isn't stored yet (tool results).
    const syncRunnerHistory = async () => {
      const all = runner.params.messages;
      for (; saved < all.length; saved++) await log.append(all[saved]);
    };
    let text = "";
    // The reply's citation numbers and sources run once across all its loop steps, as displayText and replyFold show them on reload.
    const marks = new CitationMarks();
    let shownText = "";
    let compacting = false;
    // A step's time runs from the end of the one before (so it includes the tools that ran between) to its final message.
    let stepStart = performance.now();
    const steps = runner[Symbol.asyncIterator]();
    try {
      for (;;) {
        const next = await beforeDeadline(steps.next(), deadline);
        if (next.done) break;
        const stream = next.value;
        if (!compacting) await syncRunnerHistory();
        yield* reportSaveFailure();
        const events = stream[Symbol.asyncIterator]();
        let stepHasText = false;
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
          return [...out, { type: "text", text: shown }];
        };
        for (;;) {
          const event = await beforeDeadline(events.next(), deadline);
          if (event.done) break;
          const e = event.value;
          if (compacting) continue;
          if (e.type === "content_block_delta" && e.delta.type === "text_delta" && e.delta.text) yield* show(marks.add(e.delta.text));
          if (e.type === "content_block_delta" && e.delta.type === "citations_delta") cited.set(e.index, [...(cited.get(e.index) ?? []), e.delta.citation]);
          if (e.type === "content_block_stop") yield* show(marks.markers(cited.get(e.index)));
        }
        const final = await beforeDeadline(stream.finalMessage(), deadline);
        const tools = compacting ? ["compaction"] : final.content.flatMap((b) => (b.type === "tool_use" ? [b.name] : []));
        const step = stepUsage(activeSession.model, ++stepNo, final.usage, tools, Math.round(performance.now() - stepStart), final.stop_reason);
        await saveStepUsage(db, activeSession.id, turnSeq, activeSession.model, step, now());
        stepStart = performance.now();
        if (compacting) {
          // The summary stands in for everything before it from the next request on. No summary: carry on uncompacted.
          if (isCompaction(final.content)) await log.append({ role: "assistant", content: final.content });
          saved = runner.params.messages.length;
          continue;
        }
        stopReason = final.stop_reason;
        saved++;
        // A declined reply is incomplete: it is discarded, never stored (docs: "treat any partial output as incomplete and discard it").
        if (final.stop_reason === "refusal") continue;
        await log.append({ role: "assistant", content: final.content });
        const added = textOf(final.content);
        text += text && added ? PARAGRAPH + added : added;
        if (final.stop_reason === "end_turn" && compactAtTokens > 0 && contextTokens(final.usage) >= compactAtTokens) {
          runner.compactBeforeNextTurn();
          compacting = true;
        }
      }
    } catch (error) {
      await steps.return?.();
      throw error;
    }
    if (!compacting) await syncRunnerHistory();
    yield* reportSaveFailure();
    // The reply's sources fold into one line at its end (a declined reply is replayed whole instead).
    if (stopReason !== "refusal") {
      const fold = replyFold(marks, shownText, await sourceContext({ db, map, learnerId }, marks.cited()));
      if (fold) yield { type: "text", text: fold };
    }
    return text;
  }

  // A resumed turn whose final reply was already saved has nothing left to ask the model.
  const last = log.messages.at(-1);
  const complete = last?.role === "assistant" && unansweredToolCalls(log.messages).length === 0;
  const reply = complete ? "" : yield* loop();

  // A finished widget that would not render, or breaks a Widget rule, gets one correction turn. History stays add-only.
  // Only the reply being written is checked, against the Widgets open before it; stored Widgets never are.
  const broken = stopReason === "refusal" || stopReason === "max_tokens" ? [] : newReplyWidgetProblems(reply, openWidgetsBefore(log, turnSeq).map((w) => w.code));
  if (broken.length) {
    const problems = broken.flatMap((b) => b.problems.map((p) => `- Widget ${b.index + 1}: ${p}`));
    await log.append({
      role: "user",
      content: `${WIDGET_CHECK_PREFIX} the widget in your last reply cannot be drawn or breaks a Widget rule.\n${problems.join("\n")}\nReply with only the corrected openui-lang block, written in full. Write no prose.`,
    });
    yield { type: "correction", widgets: broken.map((b) => b.index) };
    yield* loop();
  }

  // Runs after the last loop, the correction loop included, so a cut-off or refused correction is handled the same way.
  if (stopReason === "refusal") {
    // Loop steps before the declined one are stored, and so are their tool calls' effects.
    const saves = await db
      .select({ id: toolCalls.toolCallId })
      .from(toolCalls)
      .where(and(eq(toolCalls.turnId, turn.id), eq(toolCalls.isError, false)));
    yield { type: "refusal", message: saves.length ? REFUSAL_AFTER_SAVES_MESSAGE : REFUSAL_MESSAGE, text: (await turnText(log.rows, turnSeq, { db, map, learnerId })) };
  } else if (stopReason === "max_tokens") {
    // Kept as sent; a tool call it was cut off in is never run, and is answered so the history stays valid.
    const truncated = unansweredToolCalls(log.messages);
    if (truncated.length) {
      await log.append({ role: "user", content: truncated.map((use) => ({ type: "tool_result" as const, tool_use_id: use.id, content: NOT_RUN, is_error: true })) });
    }
    yield { type: "cut_short", message: CUT_SHORT_MESSAGE };
  }
  // A turn that passed its Topic ends at the Topic complete card, after the closing reply; nothing more is started.
  const passedCard = await storeTopicComplete(db, map, learnerId, session.id, now());
  if (passedCard) yield { type: "item", item: passedCard };
  const usage = await saveTurnTotal(db, session.id, turnSeq, session.model, Math.round(performance.now() - runStart), now());
  return { type: "done", stopReason, usage, ref: { sessionId: session.id, turnSeq }, shown: await shownInWorkspace(db, map, learnerId) };
}

/** The Widgets open in the panel before the turn at `turnSeq`: those its Session's earlier replies drew. */
function openWidgetsBefore(log: Log, turnSeq: number): OpenWidget[] {
  return openWidgetsIn(log.rows.filter((r) => r.seq < turnSeq && r.role === "assistant").map((r) => textOf(r.content)));
}

/**
 * The Session a Next turn pinned when its Complete this Topic passed that Topic (it is no longer the current
 * Topic's), or undefined. Read from the turn, so a Retry finds it too.
 */
async function completedSession(db: Db, map: CourseMap, turn: Turn): Promise<Session | undefined> {
  if (turnKind(turn) !== "next" || turn.sessionId === null) return undefined;
  const [pinned] = await db.select().from(sessions).where(and(eq(sessions.id, turn.sessionId), eq(sessions.learnerId, turn.learnerId)));
  return pinned && pinned.topicId !== (await currentTopicId(db, map, turn.learnerId)) ? pinned : undefined;
}

/** What the Learner sent, as saved on the turn: their message, or "Continue.". */
function learnerTextOf(input: Exclude<TurnInput, { resume: true } | { opener: true } | { next: NextName } | { quizFollowUp: true }>): string {
  if (typeof input === "string") return input;
  return "paste" in input ? input.message : CONTINUE_TEXT;
}

/** How big the conversation was on the last request, which the next request repeats and adds to. */
function contextTokens(usage: ApiUsage | undefined): number {
  if (!usage) return 0;
  return (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.output_tokens ?? 0);
}


