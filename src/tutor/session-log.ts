import { createHash } from "node:crypto";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages";
import { and, asc, eq, isNotNull, isNull, max } from "drizzle-orm";
import type { CourseMap } from "@/course/map";
import { navigate } from "@/course/navigator";
import { messages, OWNER_LEARNER_ID, sessions, settings, turns } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadProgress } from "@/learner/memory";
import { TUTOR_INSTRUCTIONS, TUTOR_TOOLS, type ToolDefinition } from "./instructions";

/**
 * Sessions and their add-only message log: the stored settings a Session is frozen from, which
 * Session a turn runs in (one per Learner and Topic, ADR 0004), and the history sent to the model.
 */

export type Message = BetaMessageParam;

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export const DEFAULT_SETTINGS = { model: "claude-opus-5-5", effort: "medium", session_idle_hours: "6", compact_at_tokens: "200000", review_cap: "10" };

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
    /** How long a gap counts as a break; it never starts a new Session (ADR 0004). */
    idleHours: Number(get("session_idle_hours")),
    compactAtTokens: Number(get("compact_at_tokens")),
    /** The most spaced reviews offered over the last 24 hours. */
    reviewCap: Number(get("review_cap")),
  };
}

export function fingerprint(instructions: string, tools: unknown[]) {
  return createHash("sha256").update(JSON.stringify({ instructions, tools })).digest("hex");
}

/**
 * The Topic the Learner's next turn talks about: the Course Navigator's current Topic, or null when
 * every Topic is passed (the one Session with no Topic).
 */
export async function currentTopicId(db: Db, map: CourseMap, learnerId = OWNER_LEARNER_ID): Promise<string | null> {
  return navigate(map, await loadProgress(db, learnerId))?.topic.id ?? null;
}

/**
 * What a turn request says the Study Workspace shows: the Session on screen, or, before a Topic's
 * first turn has made its Session, the Topic (null: the every-Topic-passed Session).
 */
export type Shown = { sessionId: number } | { topicId: string | null };

/** A turn from a tab whose Topic is no longer the Learner's current one (it changed in another tab). */
export const STALE_TAB_MESSAGE = "This Topic changed in another tab. Reload to carry on.";

/** What the Study Workspace shows the Learner now: their current Topic's live Session, or that Topic before its first turn. */
export async function shownNow(db: Db, map: CourseMap, learnerId: number): Promise<Shown> {
  const topicId = await currentTopicId(db, map, learnerId);
  const live = await liveSession(db, learnerId, topicId);
  return live ? { sessionId: live.id } : { topicId };
}

/** Whether what a request says the page shows is the Learner's current Topic (a live Session of theirs for it, or the Topic itself). */
export async function showsCurrentTopic(db: Db, map: CourseMap, learnerId: number, shown: Shown): Promise<boolean> {
  const topicId = await currentTopicId(db, map, learnerId);
  if ("topicId" in shown) return shown.topicId === topicId;
  const [session] = await db
    .select({ topicId: sessions.topicId })
    .from(sessions)
    .where(and(eq(sessions.id, shown.sessionId), eq(sessions.learnerId, learnerId), eq(sessions.older, false)));
  return session !== undefined && session.topicId === topicId;
}

/**
 * The Learner's live Session for a Topic (null: the every-Topic-passed Session), if its first turn
 * has made it. Older Sessions, from before one Session per Topic, are never live.
 */
export async function liveSession(db: Db, learnerId: number, topicId: string | null): Promise<Session | undefined> {
  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.learnerId, learnerId), eq(sessions.older, false), topicId === null ? isNull(sessions.topicId) : eq(sessions.topicId, topicId)))
    .orderBy(asc(sessions.id))
    .limit(1);
  return row;
}

/**
 * The Session a new turn runs in: the Learner's live Session for the Topic, made by this turn if it
 * is the Topic's first. Made with on-conflict, so two tabs never make two for one Topic.
 */
export async function sessionForTurn(db: Db, now: Date, learnerId: number, topicId: string | null): Promise<Session> {
  const live = await liveSession(db, learnerId, topicId);
  if (live) return live;
  await db
    .insert(sessions)
    .values({ ...(await frozenNow(db)), learnerId, topicId, older: false, createdAt: now })
    .onConflictDoNothing();
  return (await liveSession(db, learnerId, topicId))!;
}

/**
 * After a deploy changed the instructions or tools, the next new turn (never a resume) refreezes the
 * instructions, tools, model and effort inside the same Session and records the seq of the first
 * message after it: thinking blocks before that seq are never sent again (see `openLog`).
 */
export async function refreezeIfChanged(db: Db, session: Session): Promise<Session> {
  const frozen = await frozenNow(db);
  if (session.fingerprint === frozen.fingerprint) return session;
  const [{ last }] = await db.select({ last: max(messages.seq) }).from(messages).where(eq(messages.sessionId, session.id));
  const [row] = await db
    .update(sessions)
    .set({ ...frozen, refrozenAtSeq: (last ?? -1) + 1 })
    .where(eq(sessions.id, session.id))
    .returning();
  return row;
}

/** The instructions, tools, model and effort a Session freezes now, with their fingerprint. */
async function frozenNow(db: Db) {
  const { model, effort } = await readSettings(db);
  const tools: ToolDefinition[] = TUTOR_TOOLS;
  return { instructions: TUTOR_INSTRUCTIONS, tools, model, effort, fingerprint: fingerprint(TUTOR_INSTRUCTIONS, tools) };
}

export const isCompaction = (content: unknown) => Array.isArray(content) && content.some((b) => b?.type === "compaction");

export type Row = { seq: number } & Message;

/**
 * A Session's stored history. Every row stays stored (add-only); what is sent to the model:
 * - starts at the latest compaction block, which stands in for everything before it;
 * - leaves out every row of a refused turn (the Learner's message, context and kept loop steps alike),
 *   which the Learner still sees;
 * - leaves out the thinking blocks of rows before the Session was last refrozen, because the API
 *   rejects thinking made under other instructions or tools. Everything else replays unchanged.
 */
export async function openLog(db: Db, sessionId: number, now: () => Date) {
  const rows = (await db
    .select({ seq: messages.seq, role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.seq))) as Row[];
  const [session] = await db.select({ refrozenAtSeq: sessions.refrozenAtSeq }).from(sessions).where(eq(sessions.id, sessionId));
  const refused = await refusedSeqs(db, sessionId);
  const refrozenAt = session?.refrozenAtSeq ?? 0;
  const sent: Message[] = rows
    .slice(Math.max(rows.findLastIndex((r) => isCompaction(r.content)), 0))
    .filter((r) => !refused(r.seq))
    .map((r) => ({ role: r.role, content: r.seq < refrozenAt ? withoutThinking(r.content) : r.content }) as Message);
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

/**
 * Whether a seq belongs to a refused turn of the Session: from the turn's first row (its turn seq)
 * up to the next turn's first row.
 */
async function refusedSeqs(db: Db, sessionId: number): Promise<(seq: number) => boolean> {
  const starts = await db
    .select({ seq: turns.turnSeq, stopReason: turns.stopReason })
    .from(turns)
    .where(and(eq(turns.sessionId, sessionId), isNotNull(turns.turnSeq)))
    .orderBy(asc(turns.turnSeq));
  const ranges = starts.flatMap((t, i) => (t.stopReason === "refusal" ? [[t.seq!, starts[i + 1]?.seq ?? Infinity] as const] : []));
  return (seq) => ranges.some(([from, to]) => seq >= from && seq < to);
}

/** Assistant content without its thinking blocks; anything else unchanged. */
function withoutThinking(content: unknown): unknown {
  return Array.isArray(content) ? content.filter((b) => b?.type !== "thinking" && b?.type !== "redacted_thinking") : content;
}
export type Log = Awaited<ReturnType<typeof openLog>>;

/** History as sent to the model, for a Session that isn't being written to. */
export async function history(db: Db, sessionId: number): Promise<Message[]> {
  return (await openLog(db, sessionId, () => new Date())).messages;
}

