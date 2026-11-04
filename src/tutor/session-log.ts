import { createHash } from "node:crypto";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages";
import { and, asc, eq, isNotNull, isNull, max } from "drizzle-orm";
import type { CourseMap } from "@/course/map";
import { navigate } from "@/course/navigator";
import { learnerState, messages, sessions, settings, turns } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadProgress } from "@/learner/memory";
import { ENGINE_INSTRUCTIONS, ENGINE_TOOLS, ENGINE_TOOLS_WITH_COMPOSE, TUTOR_INSTRUCTIONS, TUTOR_TOOLS, type ToolDefinition } from "./instructions";
import { rejectedSeqsOf } from "./reply-records";

/**
 * Sessions and their add-only message log: the stored settings a Session is frozen from, which
 * Session a turn runs in (one per Learner and Topic, ADR 0004), and the history sent to the model.
 */

export type Message = BetaMessageParam;

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export const DEFAULT_SETTINGS = { model: "claude-opus-5-5", effort: "medium", session_idle_hours: "6", compact_at_tokens: "200000", review_cap: "10", widget_engine: "on", widget_compose_model: "claude-sonnet-5-5" };

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
    /** The widget engine (ADR 0005): "on" freezes new and refrozen Sessions with show_widget. Read only by frozenNow. */
    widgetEngine: get("widget_engine") === "on" ? ("on" as const) : ("off" as const),
    /** The model compose_widget asks for a free-form Widget (UX audit ★.4, lane 2). Read when the tool runs, never frozen. */
    composeModel: get("widget_compose_model") || DEFAULT_SETTINGS.widget_compose_model,
  };
}

export function fingerprint(instructions: string, tools: unknown[]) {
  return createHash("sha256").update(JSON.stringify({ instructions, tools })).digest("hex");
}

/**
 * The Topic the Learner's next turn talks about: the Course Navigator's current Topic, or null when
 * every Topic is passed (the one Session with no Topic).
 */
export async function currentTopicId(db: Db, map: CourseMap, learnerId: number): Promise<string | null> {
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

/**
 * What the Study Workspace renders: the Learner's shown Session. A turn shows the Session it runs in,
 * and choosing a Topic shows that Topic's; a Topic passed in a turn stays on screen until the Learner
 * chooses where to go, though their current Topic has moved on. With none saved (or one no longer
 * live), the current Topic's Session, or the Topic before its first turn.
 */
export async function shownInWorkspace(db: Db, map: CourseMap, learnerId: number): Promise<Shown> {
  const [saved] = await db
    .select({ id: sessions.id })
    .from(learnerState)
    .innerJoin(sessions, eq(sessions.id, learnerState.shownSessionId))
    .where(and(eq(learnerState.learnerId, learnerId), eq(sessions.learnerId, learnerId), eq(sessions.older, false)));
  return saved ? { sessionId: saved.id } : shownNow(db, map, learnerId);
}

/**
 * The Topic of the shown Session when it is no longer the Learner's current Topic: one passed in a turn,
 * kept on screen until the Learner chooses where to go. Null while the shown Session is the current Topic's.
 */
export async function passedTopicShown(db: Db, map: CourseMap, learnerId: number, shown: Shown): Promise<string | null> {
  if (!("sessionId" in shown) || (await showsCurrentTopic(db, map, learnerId, shown))) return null;
  const [session] = await db.select({ topicId: sessions.topicId }).from(sessions).where(and(eq(sessions.id, shown.sessionId), eq(sessions.learnerId, learnerId)));
  return session?.topicId ?? null;
}

/** Saves the Learner's shown Session (null: their current Topic, before its first turn). */
export async function saveShownSession(db: Db, learnerId: number, sessionId: number | null): Promise<void> {
  await db
    .insert(learnerState)
    .values({ id: learnerId, learnerId, shownSessionId: sessionId })
    .onConflictDoUpdate({ target: learnerState.id, set: { shownSessionId: sessionId } });
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
 * Each Topic's live Session for the Learner, by Topic id: what a passed row on the Course Map opens,
 * read-only. Older Sessions and the every-Topic-passed Session are left out.
 */
export async function topicSessions(db: Db, learnerId: number): Promise<Record<string, number>> {
  const rows = await db
    .select({ id: sessions.id, topicId: sessions.topicId })
    .from(sessions)
    .where(and(eq(sessions.learnerId, learnerId), eq(sessions.older, false), isNotNull(sessions.topicId)))
    .orderBy(asc(sessions.id));
  const byTopic: Record<string, number> = {};
  for (const r of rows) if (r.topicId && !(r.topicId in byTopic)) byTopic[r.topicId] = r.id;
  return byTopic;
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
 * instructions and tools inside the same Session and records the seq of the first message after it:
 * thinking blocks before that seq are never sent again (see `openLog`), and that turn folds the earlier
 * history into a summary before its reply (turn.ts). The Session keeps its model and effort (spec #229:
 * "existing Sessions keep theirs"); a changed default reaches new Sessions only.
 */
export async function refreezeIfChanged(db: Db, session: Session): Promise<Session> {
  const { instructions, tools, fingerprint } = await frozenNow(db, session);
  if (session.fingerprint === fingerprint) return session;
  const [{ last }] = await db.select({ last: max(messages.seq) }).from(messages).where(eq(messages.sessionId, session.id));
  const [row] = await db
    .update(sessions)
    .set({ instructions, tools, fingerprint, refrozenAtSeq: (last ?? -1) + 1 })
    .where(eq(sessions.id, session.id))
    .returning();
  return row;
}

/** Whether a Session was frozen with the widget engine: its tools include show_widget. Engine-only behaviour reads this, never the setting. */
export function usesWidgetEngine(session: { tools: unknown } | undefined): boolean {
  return Array.isArray(session?.tools) && session.tools.some((t) => (t as { name?: unknown })?.name === "show_widget");
}

/**
 * The instructions, tools, model and effort a Session freezes now, with their fingerprint. The widget engine's
 * (ADR 0005) when the `widget_engine` setting is "on", or when the Session already has show_widget: one way per
 * Session, so no history ever holds a show_widget call its tools no longer list. Off, today's exactly, so the
 * fingerprint of every Session without the engine is unchanged.
 */
export async function frozenNow(db: Db, session?: { tools: unknown }) {
  const { model, effort, widgetEngine } = await readSettings(db);
  const engine = widgetEngine === "on" || usesWidgetEngine(session);
  const instructions = engine ? ENGINE_INSTRUCTIONS : TUTOR_INSTRUCTIONS;
  // compose_widget is not offered to new Sessions (ADR 0007); a Session whose tools already list it keeps it.
  const keepsCompose = Array.isArray(session?.tools) && session.tools.some((t) => (t as { name?: unknown })?.name === "compose_widget");
  const tools: ToolDefinition[] = engine ? (keepsCompose ? ENGINE_TOOLS_WITH_COMPOSE : ENGINE_TOOLS) : TUTOR_TOOLS;
  return { instructions, tools, model, effort, fingerprint: fingerprint(instructions, tools) };
}

export const isCompaction = (content: unknown) => Array.isArray(content) && content.some((b) => b?.type === "compaction");

export type Row = { seq: number } & Message;

/**
 * A Session's stored history. Every row stays stored (add-only); what is sent to the model:
 * - starts at the latest compaction block, which stands in for everything before it;
 * - leaves out every row of a refused turn (the Learner's message, context and kept loop steps alike),
 *   which the Learner still sees;
 * - leaves out the thinking blocks of rows before the Session was last refrozen, because the API
 *   rejects thinking made under other instructions or tools;
 * - leaves out what the reply checks rejected (reply_checks): a draft's or failed retry's text-only
 *   messages and the correction message go, and a rejected tool-use message keeps its tool calls but
 *   not its text, so every tool_use keeps its tool_result. Everything else replays unchanged.
 * `rows` is the Session as the Learner saw it (rejected text left out too); rows appended later are kept whole.
 */
export async function openLog(db: Db, sessionId: number, now: () => Date) {
  const stored = (await db
    .select({ seq: messages.seq, role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.seq))) as Row[];
  let nextSeq = stored.length ? stored[stored.length - 1].seq + 1 : 0;
  const rows = withoutRejected(stored, await rejectedSeqsOf(db, sessionId));
  const [session] = await db.select({ refrozenAtSeq: sessions.refrozenAtSeq }).from(sessions).where(eq(sessions.id, sessionId));
  const refused = await refusedSeqs(db, sessionId);
  const refrozenAt = session?.refrozenAtSeq ?? 0;
  const sent: Message[] = rows
    .slice(Math.max(rows.findLastIndex((r) => isCompaction(r.content)), 0))
    .filter((r) => !refused(r.seq))
    .map((r) => ({ role: r.role, content: r.seq < refrozenAt ? withoutThinking(r.content) : r.content }) as Message);
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

/**
 * Rows without what the reply checks rejected: a rejected user or text-only row goes, and a rejected assistant row
 * with tool calls keeps everything but its text blocks.
 */
export function withoutRejected<R extends { seq: number; role: string; content?: unknown }>(rows: R[], rejected: ReadonlySet<number>): R[] {
  if (!rejected.size) return rows;
  return rows.flatMap((r) => {
    if (!rejected.has(r.seq)) return [r];
    if (r.role !== "assistant" || !Array.isArray(r.content)) return [];
    const content = r.content.filter((b) => b?.type !== "text");
    return content.some((b) => b?.type === "tool_use" || b?.type === "server_tool_use") ? [{ ...r, content }] : [];
  });
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

