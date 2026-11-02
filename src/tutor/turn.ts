import type { BetaContentBlock, BetaRawMessageStreamEvent } from "@anthropic-ai/sdk/resources/beta/messages";
import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import { and, eq } from "drizzle-orm";
import { loadCourseMap, type CourseMap } from "@/course/map";
import { navigate } from "@/course/navigator";
import { sessions, toolCalls } from "@/db/schema";
import type { Db } from "@/db/types";
import { ensureTopicStarted, learnerSummary, loadProgress } from "@/learner/memory";
import { markQuizReported, pendingQuizNote } from "@/learner/quiz";
import { replyWidgetProblems, WIDGET_CHECK_PREFIX } from "@/widgets/check";
import { endedAtCheckWithoutVerdict, lastContextSent, noVerdictContext, OPENING_PREFIX, stepContext } from "./context";
import { describeFailure, type FailureKind } from "./failures";
import { type ToolDefinition } from "./instructions";
import {
  currentSession,
  history,
  isCompaction,
  openLog,
  readSettings,
  sessionForAction,
  startSession,
  type Effort,
  type Log,
  type Message,
  type NewSessionReason,
  type Session,
} from "./session-log";
import { bindTools, caseDataFor, rerunToolCalls, SAVE_FAILED_MESSAGE, toolCode, unansweredToolCalls, type ToolCode, type ToolEffects } from "./tools";
import { PARAGRAPH, textOf, turnText } from "./transcript";
import { BUSY_MESSAGE, resumeTurn, startTurn, updateTurn, type Turn } from "./turn-status";
import { loadStepUsages, loadTurnUsages, saveStepUsage, saveTurnTotal, stepUsage, sumSteps, type ApiUsage, type TurnUsage } from "./usage";

/**
 * The Tutor Turn: one Learner action in, streamed events and saved state out. It takes the
 * one-turn lock, picks the Session (session-log.ts), sends changed context (context.ts), and
 * runs the Tool Runner loop with cut-off, compaction, refusal and widget-correction handling.
 */

export { latestTurn, BUSY_MESSAGE } from "./turn-status";

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
  /** The reply's widget failed the server check; the text that follows is its one correction. */
  | { type: "correction" }
  | { type: "done"; stopReason: string | null; usage: TurnUsage }
  /** Another turn is running (perhaps on another device); nothing was saved or sent. */
  | { type: "busy"; message: string }
  /** This turn started a new Session. */
  | { type: "session"; reason: NewSessionReason }
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
export const REFUSAL_MESSAGE =
  "The Tutor declined to answer that message. Nothing was changed, and your place in the course is the same. Your next message starts a fresh Session from your saved progress.";
/** The refusal message when tool calls earlier in the same turn had already saved progress. */
export const REFUSAL_AFTER_SAVES_MESSAGE =
  "The Tutor declined to go on with that reply. What it had already written and recorded earlier in this reply is kept, so your place in the course may have moved on; only the declined part was discarded. Your next message starts a fresh Session from your saved progress.";
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

/** A new message, the Continue button, or a resume of the last turn after a cut-off or failure (Retry). */
export type TurnInput = string | { continue: true } | { resume: true };
/** What the Learner's "Continue" button sends. */
export const CONTINUE_TEXT = "Continue.";

export type TurnDeps = {
  db: Db;
  client: TutorClient;
  map?: CourseMap;
  now?: () => Date;
  /** How long this run may take before it cuts itself off; defaults to TIME_BUDGET_MS. */
  timeBudgetMs?: number;
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
 * Runs one Tutor turn: takes the one-turn lock, saves the Learner's message,
 * streams the reply through Tool Runner and saves each loop step's messages
 * unchanged as they finish. Before the message, code appends the Course
 * Navigator's context whenever it changed; a new Session opens with the
 * Learner's summary and that context. A turn is saved as running, cut off,
 * finished or failed; `{ resume: true }` continues a cut-off or failed turn
 * from its last saved loop step.
 */
export async function* runTutorTurn(deps: TurnDeps, input: TurnInput): AsyncGenerator<TurnEvent> {
  const { db } = deps;
  const now = deps.now ?? (() => new Date());
  const deadline = performance.now() + (deps.timeBudgetMs ?? TIME_BUDGET_MS);
  const resuming = typeof input === "object" && "resume" in input;
  const claim = resuming ? await resumeTurn(db, now()) : { turn: await startTurn(db, now(), typeof input === "string" ? input : CONTINUE_TEXT), alreadyFinished: false };
  if (!claim.turn) {
    yield { type: "busy", message: BUSY_MESSAGE };
    return;
  }
  const turn = claim.turn;
  if (claim.alreadyFinished) {
    // It finished after the browser lost the stream: show the saved reply.
    yield* finishedTurnReplay(db, turn);
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

async function* finishedTurnReplay(db: Db, turn: Turn): AsyncGenerator<TurnEvent> {
  if (turn.sessionId === null || turn.turnSeq === null) return;
  const log = await openLog(db, turn.sessionId, () => new Date());
  yield { type: "replay", text: turnText(log.rows, turn.turnSeq) };
  const usage = (await loadTurnUsages(db, turn.sessionId)).get(turn.turnSeq);
  const [session] = await db.select().from(sessions).where(eq(sessions.id, turn.sessionId));
  yield { type: "done", stopReason: turn.stopReason, usage: usage ?? sumSteps(session.model, [], 0) };
}

async function* runLockedTurn(deps: TurnDeps, input: TurnInput, turn: Turn, deadline: number): AsyncGenerator<TurnEvent, Extract<TurnEvent, { type: "done" }>> {
  const { db, client } = deps;
  const map = deps.map ?? loadCourseMap();
  const now = deps.now ?? (() => new Date());
  const runStart = performance.now();
  const effects: ToolEffects = { saveFailed: false };

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
    code = toolCode(db, map, now, session.model, effects, turn.id);
    yield { type: "replay", text: turnText(log.rows, turnSeq) };
    yield* repairToolCalls();
  } else {
    // A new message, or a retry of a turn that failed before the Learner's message was stored:
    // that turn is run again from the message saved on it.
    const learnerText = typeof input === "string" ? input : "continue" in input ? CONTINUE_TEXT : (turn.input ?? CONTINUE_TEXT);
    // A Topic started by this turn has shown the Learner nothing yet, so its first step cannot be finished in it.
    // Saved before the Topic starts, so a retry after a failure in between still knows.
    if (navigate(map, await loadProgress(db))?.status === "not_started") await updateTurn(db, turn.id, { freshStep: true });
    const place = await ensureTopicStarted(db, map, now());
    const previous = await currentSession(db);
    const found = await sessionForAction(db, now(), turn);
    const continuing = "session" in found ? found.session : undefined;
    // The last turn may have been in the previous Session.
    const lastTurn = continuing ? await history(db, continuing.id) : previous ? await history(db, previous.id) : [];
    const caseData = await caseDataFor(db, map, place);
    const plainContext = stepContext(place, caseData);
    const context =
      place?.step === "check" && place.check?.kind === "conversation" && endedAtCheckWithoutVerdict(lastTurn, place.check.id, plainContext)
        ? noVerdictContext({ ...place, check: place.check }, caseData)
        : plainContext;
    session = continuing ?? (await startSession(db, now()));
    if ("reason" in found && found.reason !== "first") yield { type: "session", reason: found.reason };
    log = await openLog(db, session.id, now);
    code = toolCode(db, map, now, session.model, effects, turn.id);
    // Tool calls left without results by an earlier cut-off are answered before anything follows them.
    yield* repairToolCalls();

    turnSeq = log.nextSeq;
    await updateTurn(db, turn.id, { sessionId: session.id, turnSeq });
    // Quiz results marked by code since the Tutor's last call; each is told to the Tutor once.
    const quiz = await pendingQuizNote(db, map);
    // A quiz pass moved the Learner onto a step the Tutor has not taught yet, so it cannot be finished in this turn.
    if (quiz?.passed) await updateTurn(db, turn.id, { freshStep: true });
    if (log.messages.length === 0) {
      // The API rejects a system message as the first message, so a Session's opening context is
      // the first block of the Learner's first message.
      const opening = `${OPENING_PREFIX}\n${await learnerSummary(db, map)}\n\n${quiz ? `${quiz.text}\n\n` : ""}${context}`;
      await log.append({ role: "user", content: [{ type: "text", text: opening }, { type: "text", text: learnerText }] });
    } else {
      // The API accepts a system message only right after a user message (live 400 otherwise),
      // so changed context follows the Learner's message.
      // A quiz result goes in the same system message as the context, which then always follows it.
      const contextChanged = quiz !== null || !lastContextSent(log.messages)?.endsWith(context);
      await log.append({ role: "user", content: learnerText });
      if (contextChanged) await log.append({ role: "system", content: quiz ? `${quiz.text}\n\n${context}` : context });
    }
    if (quiz) await markQuizReported(db, quiz.attemptIds, now());
  }

  async function* repairToolCalls(): AsyncGenerator<TurnEvent> {
    const pending = unansweredToolCalls(log.messages);
    if (!pending.length) return;
    await log.append({ role: "user", content: await rerunToolCalls(pending, code) });
    yield* reportSaveFailure();
  }

  let saveFailureReported = false;
  async function* reportSaveFailure(): AsyncGenerator<TurnEvent> {
    if (effects.saveFailed && !saveFailureReported) {
      saveFailureReported = true;
      yield { type: "save_failed", message: SAVE_FAILED_MESSAGE };
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
        for (;;) {
          const event = await beforeDeadline(events.next(), deadline);
          if (event.done) break;
          const e = event.value;
          if (!compacting && e.type === "content_block_delta" && e.delta.type === "text_delta" && e.delta.text) {
            // Text after a tool call is a new loop step: start it on a new paragraph.
            if (!stepHasText && text) yield { type: "text", text: PARAGRAPH };
            stepHasText = true;
            yield { type: "text", text: e.delta.text };
          }
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
    return text;
  }

  // A resumed turn whose final reply was already saved has nothing left to ask the model.
  const last = log.messages.at(-1);
  const complete = last?.role === "assistant" && unansweredToolCalls(log.messages).length === 0;
  const reply = complete ? "" : yield* loop();

  if (stopReason === "refusal") {
    // Loop steps before the declined one are stored, and so are their tool calls' effects.
    const saves = await db
      .select({ id: toolCalls.toolCallId })
      .from(toolCalls)
      .where(and(eq(toolCalls.turnId, turn.id), eq(toolCalls.isError, false)));
    yield { type: "refusal", message: saves.length ? REFUSAL_AFTER_SAVES_MESSAGE : REFUSAL_MESSAGE, text: turnText(log.rows, turnSeq) };
  } else if (stopReason === "max_tokens") {
    // Kept as sent; a tool call it was cut off in is never run, and is answered so the history stays valid.
    const truncated = unansweredToolCalls(log.messages);
    if (truncated.length) {
      await log.append({ role: "user", content: truncated.map((use) => ({ type: "tool_result" as const, tool_use_id: use.id, content: NOT_RUN, is_error: true })) });
    }
    yield { type: "cut_short", message: CUT_SHORT_MESSAGE };
  } else {
    // A finished widget that would not render gets one correction turn. History stays add-only.
    const broken = replyWidgetProblems(reply);
    if (broken.length) {
      const problems = broken.flatMap((b) => b.problems.map((p) => `- Widget ${b.index + 1}: ${p}`));
      await log.append({
        role: "user",
        content: `${WIDGET_CHECK_PREFIX} the widget in your last reply cannot be drawn.\n${problems.join("\n")}\nReply with only the corrected openui-lang block, written in full. Write no prose.`,
      });
      yield { type: "correction" };
      yield* loop();
    }
  }
  const usage = await saveTurnTotal(db, session.id, turnSeq, session.model, Math.round(performance.now() - runStart), now());
  return { type: "done", stopReason, usage };
}

/** How big the conversation was on the last request, which the next request repeats and adds to. */
function contextTokens(usage: ApiUsage | undefined): number {
  if (!usage) return 0;
  return (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.output_tokens ?? 0);
}


