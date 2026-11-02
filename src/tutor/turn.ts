import { createHash } from "node:crypto";
import type { BetaContentBlock, BetaMessageParam, BetaRawMessageStreamEvent } from "@anthropic-ai/sdk/resources/beta/messages";
import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import { asc, desc, eq, max } from "drizzle-orm";
import { z } from "zod";
import { loadCourseMap, type CourseMap } from "@/course/map";
import { TEACHING_STEPS } from "@/course/navigator";
import { messages, sessions, settings } from "@/db/schema";
import type { Db } from "@/db/types";
import { ensureTopicStarted, saveFinishedStep, summaryText } from "@/learner/memory";
import { replaceBrokenWidgets, replyWidgetProblems } from "@/widgets/check";
import { stepContext } from "./context";
import { TUTOR_INSTRUCTIONS, TUTOR_TOOLS, type ToolDefinition } from "./instructions";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export const DEFAULT_SETTINGS = { model: "claude-sonnet-5-5", effort: "medium", session_idle_hours: "6" };
/** Room for adaptive thinking as well as the visible reply. */
const MAX_TOKENS = 16000;

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
  messages: Message[];
  stream: true;
};

type MessageStream = AsyncIterable<BetaRawMessageStreamEvent> & {
  finalMessage(): Promise<{ content: BetaContentBlock[]; stop_reason: string | null }>;
};

/** The slice of the Anthropic client the Tutor Turn uses; tests pass a scripted stub. */
export type TutorClient = {
  beta: {
    messages: {
      toolRunner(params: TutorRequest): AsyncIterable<MessageStream> & { params: { messages: Message[] } };
    };
  };
};

export type TurnEvent =
  | { type: "text"; text: string }
  /** The reply's widget failed the server check; the text that follows is its one correction. */
  | { type: "correction" }
  | { type: "done"; stopReason: string | null };

/** Opens the message code sends when a finished widget fails the check. */
export const WIDGET_CHECK_PREFIX = "Widget check by code:";

type Session = typeof sessions.$inferSelect;

/** Model and effort as stored settings, written with defaults the first time. */
export async function readSettings(db: Db) {
  await db
    .insert(settings)
    .values(Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value })))
    .onConflictDoNothing();
  const rows = await db.select().from(settings);
  const get = (key: string) => rows.find((r) => r.key === key)?.value;
  return { model: get("model")!, effort: get("effort") as Effort, idleHours: Number(get("session_idle_hours")) };
}

export function fingerprint(instructions: string, tools: unknown[]) {
  return createHash("sha256").update(JSON.stringify({ instructions, tools })).digest("hex");
}

async function currentSession(db: Db): Promise<Session | undefined> {
  const [row] = await db.select().from(sessions).orderBy(desc(sessions.id)).limit(1);
  return row;
}

/**
 * The Session the next action continues: the latest one, unless it has been
 * idle longer than the `session_idle_hours` setting (default 6) or was frozen
 * from different instructions or tools. Otherwise a new Session starts.
 */
async function sessionForAction(db: Db, now: Date): Promise<Session | undefined> {
  const session = await currentSession(db);
  if (!session) return undefined;
  if (session.fingerprint !== fingerprint(TUTOR_INSTRUCTIONS, TUTOR_TOOLS)) return undefined;
  // An earlier build opened Sessions with a system message, which the API rejects; start afresh.
  const [first] = await db
    .select({ role: messages.role })
    .from(messages)
    .where(eq(messages.sessionId, session.id))
    .orderBy(asc(messages.seq))
    .limit(1);
  if (first?.role === "system") return undefined;
  const [{ last }] = await db
    .select({ last: max(messages.createdAt) })
    .from(messages)
    .where(eq(messages.sessionId, session.id));
  const { idleHours } = await readSettings(db);
  const lastActive = last ?? session.createdAt;
  return now.getTime() - lastActive.getTime() > idleHours * 3600_000 ? undefined : session;
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

async function history(db: Db, sessionId: number): Promise<Message[]> {
  const rows = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.seq));
  return rows as Message[];
}

async function append(db: Db, sessionId: number, seq: number, message: Message, now: Date) {
  await db.insert(messages).values({ sessionId, seq, role: message.role, content: message.content, createdAt: now });
}

type ToolCode = Pick<BetaRunnableTool, "run" | "parse">;

/** The code behind each tool, by name. */
function toolCode(db: Db, map: CourseMap, now: () => Date): Record<string, ToolCode> {
  const finishInput = z.object({ step: z.enum(TEACHING_STEPS) });
  return {
    finish_teaching_step: {
      parse: (input) => finishInput.parse(input),
      run: async ({ step }) => {
        const move = await saveFinishedStep(db, map, step, now());
        if (!move.ok) throw new Error(move.reason);
        return stepContext(await ensureTopicStarted(db, map, now()));
      },
    },
  };
}

/**
 * Pairs each saved tool definition with the code that runs it. Definitions are
 * replayed exactly as saved; only the run function comes from the current build.
 */
function bindTools(definitions: ToolDefinition[], code: Record<string, ToolCode>): BetaRunnableTool[] {
  return definitions.map((d) => {
    const impl = code[d.name];
    if (!impl) throw new Error(`No implementation for saved tool ${d.name}`);
    return { ...d, ...impl } as unknown as BetaRunnableTool;
  });
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
    messages: msgs,
    stream: true,
  };
}

/** The last Course Navigator context the Tutor saw: a context message (which may open with a summary) or a finish_teaching_step result. */
function lastContextSent(msgs: Message[]): string | undefined {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const { role, content } = msgs[i];
    if (role === "system" && typeof content === "string") return content;
    if (role === "user" && Array.isArray(content)) {
      const result = content.findLast((b) => b.type === "tool_result" && !b.is_error && typeof b.content === "string");
      if (result && result.type === "tool_result") return result.content as string;
      const opening = content.find((b) => b.type === "text" && b.text.startsWith(OPENING_PREFIX));
      if (opening && opening.type === "text") return opening.text;
    }
  }
  return undefined;
}

/** Opens the Session's first message: the Learner's summary and the Course Navigator's context. */
export const OPENING_PREFIX = "Where the Learner stands:";

export type TurnInput = string | { continue: true };
/** What the Learner's "Continue" button sends. */
export const CONTINUE_TEXT = "Continue.";

/**
 * Runs one Tutor turn: saves the Learner's message, streams the reply through
 * Tool Runner and saves each loop step's messages unchanged as they finish.
 * Before the message, code appends the Course Navigator's context whenever it
 * changed; a new Session opens with the Learner's summary and that context.
 */
export async function* runTutorTurn(
  deps: { db: Db; client: TutorClient; map?: CourseMap; now?: () => Date },
  input: TurnInput,
): AsyncGenerator<TurnEvent> {
  const { db, client } = deps;
  const map = deps.map ?? loadCourseMap();
  const now = deps.now ?? (() => new Date());
  const place = await ensureTopicStarted(db, map, now());
  const context = stepContext(place);

  let session = await sessionForAction(db, now());
  const msgs: Message[] = [];
  if (session) msgs.push(...(await history(db, session.id)));
  else session = await startSession(db, now());
  const sessionId = session.id;
  const add = async (message: Message) => {
    await append(db, sessionId, msgs.length, message, now());
    msgs.push(message);
  };

  const learnerText = typeof input === "string" ? input : CONTINUE_TEXT;
  if (msgs.length === 0) {
    // The API rejects a system message as the first message, so a Session's opening context is
    // the first block of the Learner's first message.
    const opening = `${OPENING_PREFIX}\n${summaryText(place)}\n\n${context}`;
    await add({ role: "user", content: [{ type: "text", text: opening }, { type: "text", text: learnerText }] });
  } else {
    // The API accepts a system message only right after a user message (live 400 otherwise),
    // so changed context follows the Learner's message.
    const contextChanged = !lastContextSent(msgs)?.endsWith(context);
    await add({ role: "user", content: learnerText });
    if (contextChanged) await add({ role: "system", content: context });
  }

  let stopReason: string | null = null;
  const activeSession = session;

  // Runs Tool Runner over `messages`, streaming text and saving each loop step. Returns the replies' text.
  async function* loop(messages: Message[]): AsyncGenerator<TurnEvent, string> {
    let saved = messages.length;
    const runner = client.beta.messages.toolRunner(requestFor(activeSession, messages, toolCode(db, map, now)));
    // Saves anything the runner added to history that isn't stored yet (tool results).
    const syncRunnerHistory = async () => {
      const all = runner.params.messages;
      for (; saved < all.length; saved++) await append(db, sessionId, saved, all[saved], now());
    };
    let text = "";
    for await (const stream of runner) {
      await syncRunnerHistory();
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta" && event.delta.text) {
          yield { type: "text", text: event.delta.text };
        }
      }
      const final = await stream.finalMessage();
      await append(db, sessionId, saved++, { role: "assistant", content: final.content }, now());
      text += textOf(final.content);
      stopReason = final.stop_reason;
    }
    await syncRunnerHistory();
    return text;
  }

  const reply = yield* loop(msgs);

  // A finished widget that would not render gets one correction turn. History stays add-only.
  const broken = replyWidgetProblems(reply);
  if (broken.length) {
    const stored = await history(db, sessionId);
    const problems = broken.flatMap((b) => b.problems.map((p) => `- Widget ${b.index + 1}: ${p}`));
    const correction: Message = {
      role: "user",
      content: `${WIDGET_CHECK_PREFIX} the widget in your last reply cannot be drawn.\n${problems.join("\n")}\nReply with only the corrected openui-lang block, written in full. Write no prose.`,
    };
    await append(db, sessionId, stored.length, correction, now());
    yield { type: "correction" };
    yield* loop([...stored, correction]);
  }
  yield { type: "done", stopReason };
}

export type Line = { role: "user" | "assistant"; text: string };

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
  const lines: Line[] = [];
  let correcting = false;
  for (const m of await history(db, sessionId)) {
    const text = textOf(m.content);
    if (!text || m.role === "system") continue;
    if (m.role === "user" && text.startsWith(WIDGET_CHECK_PREFIX)) {
      correcting = true;
      continue;
    }
    const target = correcting && m.role === "assistant" ? lines.findLast((l) => l.role === "assistant") : undefined;
    correcting = false;
    if (target) target.text = replaceBrokenWidgets(target.text, text);
    else lines.push({ role: m.role, text });
  }
  return lines;
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b): b is { type: "text"; text: string } => b?.type === "text" && !b.text.startsWith(OPENING_PREFIX))
    .map((b) => b.text)
    .join("");
}
