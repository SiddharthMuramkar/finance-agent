import { createHash } from "node:crypto";
import type { BetaContentBlock, BetaMessageParam, BetaRawMessageStreamEvent } from "@anthropic-ai/sdk/resources/beta/messages";
import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import { asc, desc, eq } from "drizzle-orm";
import { messages, sessions, settings } from "@/db/schema";
import type { Db } from "@/db/types";
import { TUTOR_INSTRUCTIONS, TUTOR_TOOLS, type ToolDefinition } from "./instructions";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export const DEFAULT_SETTINGS = { model: "claude-sonnet-5-5", effort: "medium" as Effort };
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

export type TurnEvent = { type: "text"; text: string } | { type: "done"; stopReason: string | null };

type Session = typeof sessions.$inferSelect;

/** Model and effort as stored settings, written with defaults the first time. */
export async function readSettings(db: Db) {
  await db
    .insert(settings)
    .values(Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value })))
    .onConflictDoNothing();
  const rows = await db.select().from(settings);
  const get = (key: string) => rows.find((r) => r.key === key)?.value;
  return { model: get("model")!, effort: get("effort") as Effort };
}

export function fingerprint(instructions: string, tools: unknown[]) {
  return createHash("sha256").update(JSON.stringify({ instructions, tools })).digest("hex");
}

async function currentSession(db: Db): Promise<Session | undefined> {
  const [row] = await db.select().from(sessions).orderBy(desc(sessions.id)).limit(1);
  return row;
}

/** Freezes the current instructions, tools, model and effort into a new Session. */
async function startSession(db: Db): Promise<Session> {
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

async function append(db: Db, sessionId: number, seq: number, message: Message) {
  await db.insert(messages).values({ sessionId, seq, role: message.role, content: message.content });
}

/**
 * Pairs each saved tool definition with the code that runs it. Definitions are
 * replayed exactly as saved; only the run function comes from the current build.
 */
function bindTools(definitions: ToolDefinition[]): BetaRunnableTool[] {
  return definitions.map((d) => {
    throw new Error(`No implementation for saved tool ${d.name}`);
  });
}

/** Builds the request only from what the Session saved, never from current code or settings. */
function requestFor(session: Session, msgs: Message[]): TutorRequest {
  return {
    model: session.model,
    max_tokens: MAX_TOKENS,
    system: [{ type: "text", text: session.instructions }],
    tools: bindTools(session.tools as ToolDefinition[]),
    thinking: { type: "adaptive" },
    output_config: { effort: session.effort as Effort },
    cache_control: { type: "ephemeral" },
    messages: msgs,
    stream: true,
  };
}

/**
 * Runs one Tutor turn: saves the Learner's message, streams the reply through
 * Tool Runner and saves each loop step's messages unchanged as they finish.
 */
export async function* runTutorTurn(
  deps: { db: Db; client: TutorClient },
  learnerText: string,
): AsyncGenerator<TurnEvent> {
  const { db, client } = deps;
  const session = (await currentSession(db)) ?? (await startSession(db));
  const msgs = await history(db, session.id);
  const learner: Message = { role: "user", content: learnerText };
  await append(db, session.id, msgs.length, learner);
  msgs.push(learner);

  let saved = msgs.length;
  let stopReason: string | null = null;
  const runner = client.beta.messages.toolRunner(requestFor(session, msgs));

  // Saves anything the runner added to history that isn't stored yet (tool results).
  const syncRunnerHistory = async () => {
    const all = runner.params.messages;
    for (; saved < all.length; saved++) await append(db, session.id, saved, all[saved]);
  };

  for await (const stream of runner) {
    await syncRunnerHistory();
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta" && event.delta.text) {
        yield { type: "text", text: event.delta.text };
      }
    }
    const final = await stream.finalMessage();
    await append(db, session.id, saved++, { role: "assistant", content: final.content });
    stopReason = final.stop_reason;
  }
  await syncRunnerHistory();
  yield { type: "done", stopReason };
}

/** The current Session as plain text lines, for showing after a reload. No model call. */
export async function loadCurrentSession(db: Db): Promise<{ role: "user" | "assistant"; text: string }[]> {
  const session = await currentSession(db);
  if (!session) return [];
  const msgs = await history(db, session.id);
  return msgs.flatMap((m) => {
    const text = textOf(m.content);
    return text && m.role !== "system" ? [{ role: m.role, text }] : [];
  });
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b): b is { type: "text"; text: string } => b?.type === "text")
    .map((b) => b.text)
    .join("");
}
