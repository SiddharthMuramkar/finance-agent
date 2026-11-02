import { createHash } from "node:crypto";
import type { BetaContentBlock, BetaMessageParam, BetaRawMessageStreamEvent } from "@anthropic-ai/sdk/resources/beta/messages";
import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import { asc, desc, eq, max } from "drizzle-orm";
import { loadCourseMap, type CourseMap } from "@/course/map";
import { messages, sessions, settings } from "@/db/schema";
import type { Db } from "@/db/types";
import { markQuizReported, pendingQuizNote } from "@/learner/quiz";
import { ensureTopicStarted, learnerSummary } from "@/learner/memory";
import { replaceBrokenWidgets, replyWidgetProblems } from "@/widgets/check";
import { noVerdictContext, stepContext } from "./context";
import { describeFailure, type FailureKind } from "./failures";
import { TUTOR_INSTRUCTIONS, TUTOR_TOOLS, type ToolDefinition } from "./instructions";
import { bindTools, caseDataFor, rerunToolCalls, SAVE_FAILED_MESSAGE, toolCode, type ToolCode, type ToolEffects } from "./tools";
import { BUSY_MESSAGE, resumeTurn, startTurn, turnBefore, updateTurn, type Turn } from "./turn-status";
import { loadStepUsages, loadTurnUsages, saveStepUsage, saveTurnTotal, stepUsage, sumSteps, type ApiUsage, type TurnUsage } from "./usage";

export { latestTurn, BUSY_MESSAGE } from "./turn-status";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export const DEFAULT_SETTINGS = { model: "claude-sonnet-5-5", effort: "medium", session_idle_hours: "6", compact_at_tokens: "200000" };
/** Room for adaptive thinking as well as the visible reply. */
const MAX_TOKENS = 16000;
/** On-demand compaction (beta); also needed on every request that carries a compaction block. */
const COMPACTION_BETA = "compact-2026-09-04";
/** The turn stops itself this long after it starts, inside Vercel's 300 seconds, so it can save and tell the browser. */
export const TIME_BUDGET_MS = 270_000;

type Message = BetaMessageParam;

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

/** Why a turn opened a new Session: the last one went idle, the build's instructions or tools changed, or the last reply was declined. */
export type NewSessionReason = "idle" | "updated" | "refused";

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
  /** The model declined; the partial reply is discarded and the Learner's place is unchanged. */
  | { type: "refusal"; message: string }
  /** A tool could not save the Learner's progress. */
  | { type: "save_failed"; message: string }
  /** The API call failed; everything already saved is kept and the Learner can retry. */
  | { type: "error"; kind: FailureKind; message: string };

/** Opens the message code sends when a finished widget fails the check. */
export const WIDGET_CHECK_PREFIX = "Widget check by code:";
export const CUT_SHORT_MESSAGE = "The reply was cut short because it reached its length limit. Press Continue to carry on.";
export const REFUSAL_MESSAGE =
  "The Tutor declined to answer that message. Nothing was changed, and your place in the course is the same. Your next message starts a fresh Session from your saved progress.";
/** The tool result for a tool call in a reply that hit max_tokens: its input may be cut off, so it never runs. */
const NOT_RUN = "Not run: your reply reached max_tokens before this tool call was complete. Nothing was recorded.";

type Session = typeof sessions.$inferSelect;

/** Model and effort as stored settings, written with defaults the first time. */
export async function readSettings(db: Db) {
  await db
    .insert(settings)
    .values(Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value })))
    .onConflictDoNothing();
  const rows = await db.select().from(settings);
  const get = (key: string) => rows.find((r) => r.key === key)?.value;
  return {
    model: get("model")!,
    effort: get("effort") as Effort,
    idleHours: Number(get("session_idle_hours")),
    compactAtTokens: Number(get("compact_at_tokens")),
  };
}

export function fingerprint(instructions: string, tools: unknown[]) {
  return createHash("sha256").update(JSON.stringify({ instructions, tools })).digest("hex");
}

async function currentSession(db: Db): Promise<Session | undefined> {
  const [row] = await db.select().from(sessions).orderBy(desc(sessions.id)).limit(1);
  return row;
}

/**
 * The Session the next action continues: the latest one, unless it was frozen
 * from different instructions or tools, its last reply was declined, or it has
 * been idle longer than the `session_idle_hours` setting (default 6). Then the
 * reason a new Session starts is returned instead.
 */
async function sessionForAction(db: Db, now: Date, turn: Turn): Promise<{ session: Session } | { reason: NewSessionReason | "first" }> {
  const session = await currentSession(db);
  if (!session) return { reason: "first" };
  if (session.fingerprint !== fingerprint(TUTOR_INSTRUCTIONS, TUTOR_TOOLS)) return { reason: "updated" };
  // An earlier build opened Sessions with a system message, which the API rejects; start afresh.
  const [first] = await db
    .select({ role: messages.role })
    .from(messages)
    .where(eq(messages.sessionId, session.id))
    .orderBy(asc(messages.seq))
    .limit(1);
  if (first?.role === "system") return { reason: "updated" };
  // A declined reply is discarded, not kept in history, so the conversation continues in a new Session from SQL.
  const before = await turnBefore(db, turn.id);
  if (before?.sessionId === session.id && before.stopReason === "refusal") return { reason: "refused" };
  const [{ last }] = await db
    .select({ last: max(messages.createdAt) })
    .from(messages)
    .where(eq(messages.sessionId, session.id));
  const { idleHours } = await readSettings(db);
  const lastActive = last ?? session.createdAt;
  return now.getTime() - lastActive.getTime() > idleHours * 3600_000 ? { reason: "idle" } : { session };
}

/** Freezes the current instructions, tools, model and effort into a new Session. */
async function startSession(db: Db, now: Date): Promise<Session> {
  const { model, effort } = await readSettings(db);
  const tools: ToolDefinition[] = TUTOR_TOOLS;
  const [row] = await db
    .insert(sessions)
    .values({
      instructions: TUTOR_INSTRUCTIONS,
      tools,
      model,
      effort,
      fingerprint: fingerprint(TUTOR_INSTRUCTIONS, tools),
      createdAt: now,
    })
    .returning();
  return row;
}

const isCompaction = (content: unknown) => Array.isArray(content) && content.some((b) => b?.type === "compaction");

type Row = { seq: number } & Message;

/**
 * A Session's stored history. Every row stays stored (add-only); what is sent to the model
 * starts at the latest compaction block, which stands in for everything before it.
 */
async function openLog(db: Db, sessionId: number, now: () => Date) {
  const rows = (await db
    .select({ seq: messages.seq, role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.seq))) as Row[];
  const sent: Message[] = rows.slice(Math.max(rows.findLastIndex((r) => isCompaction(r.content)), 0)).map((r) => ({ role: r.role, content: r.content }) as Message);
  let nextSeq = rows.length ? rows[rows.length - 1].seq + 1 : 0;
  return {
    rows,
    /** What the next request sends. */
    messages: sent,
    get nextSeq() {
      return nextSeq;
    },
    async append(message: Message) {
      const seq = nextSeq++;
      await db.insert(messages).values({ sessionId, seq, role: message.role, content: message.content, createdAt: now() });
      rows.push({ seq, ...message });
      sent.push(message);
    },
  };
}
type Log = Awaited<ReturnType<typeof openLog>>;

/** History as sent to the model, for a Session that isn't being written to. */
async function history(db: Db, sessionId: number): Promise<Message[]> {
  return (await openLog(db, sessionId, () => new Date())).messages;
}

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

/** Every Course Navigator context contains this; other tool results (such as a saved misconception) do not. */
const CONTEXT_MARK = "Course Navigator:";

/** The last Course Navigator context the Tutor saw: a context message (which may open with a summary) or a finish_teaching_step result. */
function lastContextSent(msgs: Message[]): string | undefined {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const { role, content } = msgs[i];
    if (role === "system" && typeof content === "string") return content;
    if (role === "user" && Array.isArray(content)) {
      const result = content.findLast(
        (b) => b.type === "tool_result" && !b.is_error && typeof b.content === "string" && b.content.includes(CONTEXT_MARK),
      );
      if (result && result.type === "tool_result") return result.content as string;
      const opening = content.find((b) => b.type === "text" && b.text.startsWith(OPENING_PREFIX));
      if (opening && opening.type === "text") return opening.text;
    }
  }
  return undefined;
}

/**
 * Whether the last turn ended with the Tutor at this Check (its last context was this Check's)
 * without a verdict for it being recorded.
 */
function endedAtCheckWithoutVerdict(msgs: Message[], checkId: string, checkContext: string): boolean {
  if (!lastContextSent(msgs)?.endsWith(checkContext)) return false;
  const learner = msgs.findLastIndex(
    ({ role, content }) =>
      role === "user" &&
      (typeof content === "string" ? !content.startsWith(WIDGET_CHECK_PREFIX) : content.some((b) => b.type === "text")),
  );
  const turn = msgs.slice(Math.max(learner, 0));
  const verdictCalls = new Set(
    turn.flatMap(({ role, content }) =>
      role === "assistant" && Array.isArray(content)
        ? content.flatMap((b) =>
            b.type === "tool_use" && b.name === "record_check_verdict" && (b.input as { check_id?: unknown }).check_id === checkId ? [b.id] : [],
          )
        : [],
    ),
  );
  const recorded = turn.some(
    ({ role, content }) =>
      role === "user" && Array.isArray(content) && content.some((b) => b.type === "tool_result" && !b.is_error && verdictCalls.has(b.tool_use_id)),
  );
  return !recorded;
}

type ToolUse = { type: "tool_use"; id: string; name: string; input: unknown };

/** Tool calls in the last stored reply that have no stored result yet. */
function unansweredToolCalls(msgs: Message[]): ToolUse[] {
  const last = msgs.at(-1);
  if (last?.role !== "assistant" || !Array.isArray(last.content)) return [];
  return last.content.filter((b): b is ToolUse => b.type === "tool_use");
}

/** Opens the Session's first message: the Learner's summary and the Course Navigator's context. */
export const OPENING_PREFIX = "Where the Learner stands:";

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
  const claim = resuming ? await resumeTurn(db, now()) : { turn: await startTurn(db, now()), alreadyFinished: false };
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

/** The reply text a turn has saved so far, with any widget correction swapped in, as the browser shows it. */
function turnText(rows: Row[], turnSeq: number): string {
  let text = "";
  let correcting = false;
  for (const r of rows.filter((r) => r.seq > turnSeq)) {
    if (r.role === "user" && textOf(r.content).startsWith(WIDGET_CHECK_PREFIX)) correcting = true;
    if (r.role !== "assistant") continue;
    text = correcting ? replaceBrokenWidgets(text, textOf(r.content)) : text + textOf(r.content);
    correcting = false;
  }
  return text;
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
  if (typeof input === "object" && "resume" in input) {
    [session] = await db.select().from(sessions).where(eq(sessions.id, turn.sessionId!));
    log = await openLog(db, session.id, now);
    turnSeq = turn.turnSeq!;
    code = toolCode(db, map, now, session.model, effects);
    yield { type: "replay", text: turnText(log.rows, turnSeq) };
    yield* repairToolCalls();
  } else {
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
    code = toolCode(db, map, now, session.model, effects);
    // Tool calls left without results by an earlier cut-off are answered before anything follows them.
    yield* repairToolCalls();

    turnSeq = log.nextSeq;
    await updateTurn(db, turn.id, { sessionId: session.id, turnSeq });
    const learnerText = typeof input === "string" ? input : CONTINUE_TEXT;
    // Quiz results marked by code since the Tutor's last call; each is told to the Tutor once.
    const quiz = await pendingQuizNote(db, map);
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
        for (;;) {
          const event = await beforeDeadline(events.next(), deadline);
          if (event.done) break;
          const e = event.value;
          if (!compacting && e.type === "content_block_delta" && e.delta.type === "text_delta" && e.delta.text) yield { type: "text", text: e.delta.text };
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
        text += textOf(final.content);
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
    yield { type: "refusal", message: REFUSAL_MESSAGE };
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

export type Line = { role: "user" | "assistant"; text: string; /** On a turn's last reply: what the turn cost. */ usage?: TurnUsage };

/** The latest Session as plain text lines, for showing after a reload. No model call. */
export async function loadCurrentSession(db: Db): Promise<Line[]> {
  const session = await currentSession(db);
  return session ? loadSession(db, session.id) : [];
}

/** Every Session, newest first, for reading old ones. */
export async function listSessions(db: Db): Promise<{ id: number; createdAt: Date }[]> {
  return db.select({ id: sessions.id, createdAt: sessions.createdAt }).from(sessions).orderBy(desc(sessions.id));
}

/**
 * One Session's conversation as plain text lines. No model call. A widget
 * correction is shown in place of the broken widget it replaced.
 */
export async function loadSession(db: Db, sessionId: number): Promise<Line[]> {
  const lines: (Line & { turnSeq?: number })[] = [];
  let correcting = false;
  let turnSeq = 0;
  const rows = await db
    .select({ seq: messages.seq, role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.seq));
  for (const m of rows as (Message & { seq: number })[]) {
    const text = textOf(m.content);
    if (!text || m.role === "system") continue;
    if (m.role === "user" && text.startsWith(WIDGET_CHECK_PREFIX)) {
      correcting = true;
      continue;
    }
    const target = correcting && m.role === "assistant" ? lines.findLast((l) => l.role === "assistant") : undefined;
    correcting = false;
    if (target) target.text = replaceBrokenWidgets(target.text, text);
    else {
      if (m.role === "user") turnSeq = m.seq;
      lines.push({ role: m.role, text, turnSeq });
    }
  }
  // The panel hangs off the last reply of each turn.
  for (const [seq, usage] of await loadTurnUsages(db, sessionId)) {
    const last = lines.findLast((l) => l.role === "assistant" && l.turnSeq === seq);
    if (last) last.usage = usage;
  }
  return lines.map((l) => ({ role: l.role, text: l.text, ...(l.usage && { usage: l.usage }) }));
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b): b is { type: "text"; text: string } => b?.type === "text" && !b.text.startsWith(OPENING_PREFIX))
    .map((b) => b.text)
    .join("");
}
