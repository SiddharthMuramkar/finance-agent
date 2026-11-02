import { createHash } from "node:crypto";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages";
import { asc, desc, eq, max } from "drizzle-orm";
import { messages, sessions, settings } from "@/db/schema";
import type { Db } from "@/db/types";
import { TUTOR_INSTRUCTIONS, TUTOR_TOOLS, type ToolDefinition } from "./instructions";
import { turnBefore, type Turn } from "./turn-status";

/**
 * Sessions and their add-only message log: the stored settings a Session is frozen from,
 * which Session the next action continues, and the history sent to the model.
 */

export type Message = BetaMessageParam;

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export const DEFAULT_SETTINGS = { model: "claude-sonnet-5-5", effort: "medium", session_idle_hours: "6", compact_at_tokens: "200000", review_cap: "10" };

/** Why a turn opened a new Session: the last one went idle, the build's instructions or tools changed, or the last reply was declined. */
export type NewSessionReason = "idle" | "updated" | "refused";

export type Session = typeof sessions.$inferSelect;

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
    /** The most spaced reviews offered in one Session. */
    reviewCap: Number(get("review_cap")),
  };
}

export function fingerprint(instructions: string, tools: unknown[]) {
  return createHash("sha256").update(JSON.stringify({ instructions, tools })).digest("hex");
}

export async function currentSession(db: Db): Promise<Session | undefined> {
  const [row] = await db.select().from(sessions).orderBy(desc(sessions.id)).limit(1);
  return row;
}

/**
 * The Session the next action continues: the latest one, unless it was frozen
 * from different instructions or tools, its last reply was declined, or it has
 * been idle longer than the `session_idle_hours` setting (default 6). Then the
 * reason a new Session starts is returned instead.
 */
export async function sessionForAction(db: Db, now: Date, turn: Turn): Promise<{ session: Session } | { reason: NewSessionReason | "first" }> {
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
export async function startSession(db: Db, now: Date): Promise<Session> {
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

export const isCompaction = (content: unknown) => Array.isArray(content) && content.some((b) => b?.type === "compaction");

export type Row = { seq: number } & Message;

/**
 * A Session's stored history. Every row stays stored (add-only); what is sent to the model
 * starts at the latest compaction block, which stands in for everything before it.
 */
export async function openLog(db: Db, sessionId: number, now: () => Date) {
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
export type Log = Awaited<ReturnType<typeof openLog>>;

/** History as sent to the model, for a Session that isn't being written to. */
export async function history(db: Db, sessionId: number): Promise<Message[]> {
  return (await openLog(db, sessionId, () => new Date())).messages;
}

