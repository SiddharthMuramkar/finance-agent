import { createHash } from "node:crypto";
import { and, asc, eq, inArray, isNotNull, isNull, max, ne } from "drizzle-orm";
import type { CourseMap } from "@/course/map";
import { navigate } from "@/course/navigator";
import { learnerState, messages, sessions, settings, turns } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadProgress } from "@/learner/memory";
import { ENGINE_INSTRUCTIONS, ENGINE_TOOLS } from "./instructions";
import { rejectedSeqsOf } from "./reply-records";
import { DEFAULT_EFFORT, TUTOR_MODEL, type Effort, type Message } from "./model";

/**
 * Sessions and their add-only message log: the stored settings a Session is frozen from, which
 * Session a turn runs in (one per Learner and Topic, ADR 0004), and the history sent to the model.
 */

export type { Effort, Message } from "./model";
/**
 * The stored settings and their defaults, written the first time. There is no model setting: every Session runs on
 * TUTOR_MODEL (ADR 0015), so a `model` or `widget_compose_model` row left from before the switch is never read. There
 * is no widget engine setting either: every Session freezes the engine (#19), so a `widget_engine` row is never read.
 */
export const DEFAULT_SETTINGS = {
  effort: DEFAULT_EFFORT,
  session_idle_hours: "6",
  compact_at_tokens: "200000",
  review_cap: "10",
  // The Spend caps (decision #13, quota.ts), editable on /admin: a Learner's turns and dollars a day, everyone's dollars a
  // day, and each turn's steps (all its runs together) and resumes.
  turns_per_learner_day: "120",
  usd_per_learner_day: "5",
  usd_global_day: "30",
  steps_per_turn: "10",
  resumes_per_turn: "2",
};

export type Session = typeof sessions.$inferSelect;

/** The stored settings, written with defaults the first time. */
export async function readSettings(db: Db) {
  await db
    .insert(settings)
    .values(Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value })))
    .onConflictDoNothing();
  const rows = await db.select().from(settings);
  const get = (key: string) => rows.find((r) => r.key === key)?.value;
  return {
    /** The one model (ADR 0015); not a stored setting. */
    model: TUTOR_MODEL,
    effort: get("effort") as Effort,
    /** How long a gap counts as a break; it never starts a new Session (ADR 0004). */
    idleHours: Number(get("session_idle_hours")),
    compactAtTokens: Number(get("compact_at_tokens")),
    /** The most spaced reviews offered over the last 24 hours. */
    reviewCap: Number(get("review_cap")),
    /**
     * The Spend caps (quota.ts). Turn admission checks the daily ones before a new turn takes the Learner's lock, and the
     * resume limit before a resume; the step limit goes with the turn to its Step ledger (step-ledger.ts).
     */
    caps: {
      learnerTurnsPerDay: Number(get("turns_per_learner_day")),
      learnerUsdPerDay: Number(get("usd_per_learner_day")),
      globalUsdPerDay: Number(get("usd_global_day")),
      stepsPerTurn: Number(get("steps_per_turn")),
      resumesPerTurn: Number(get("resumes_per_turn")),
    },
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
 * each step from before that seq is sent rebuilt, without its reasoning (see `openLog`), and that turn folds
 * the earlier history into a summary before its reply (turn.ts). The Session keeps its effort (spec #229:
 * "existing Sessions keep theirs"); a changed default reaches new Sessions only.
 */
export async function refreezeIfChanged(db: Db, session: Session): Promise<Session> {
  // A Claude-era Session is retired before any turn runs in it (retireLegacySessions), never refrozen.
  if (isLegacySession(session)) throw new Error(`Session ${session.id} was frozen for ${session.model}, not ${TUTOR_MODEL}: it should have been retired.`);
  const { instructions, tools, fingerprint } = await frozenNow(db);
  if (session.fingerprint === fingerprint) return session;
  const [{ last }] = await db.select({ last: max(messages.seq) }).from(messages).where(eq(messages.sessionId, session.id));
  const [row] = await db
    .update(sessions)
    .set({ instructions, tools, fingerprint, refrozenAtSeq: (last ?? -1) + 1 })
    .where(eq(sessions.id, session.id))
    .returning();
  return row;
}

/** Whether a Session was frozen for another model than TUTOR_MODEL: a Claude-era Session (ADR 0015), never sent to OpenAI. */
export function isLegacySession(session: { model: string }): boolean {
  return session.model !== TUTOR_MODEL;
}

/**
 * Closes the Learner's live Claude-era Sessions for a Topic (null: the every-Topic-passed Session), ADR 0015. Each is
 * marked older, so it stays readable under Older sessions, and the Topic's next turn makes a fresh Session at the
 * Learner's saved step (their progress, misconceptions and profile reach it through code's context). One that holds
 * no message yet is simply refrozen in place, so no empty Older Session appears. Runs under the Learner's row lock,
 * which a Next and the study page's Widget step-finish also take, so none of them writes into a Session as it closes.
 * Never sets `restartedAt`: that marks a Learner's own Start a Topic over. Returns whether a Session was closed.
 */
export async function retireLegacySessions(db: Db, learnerId: number, topicId: string | null): Promise<boolean> {
  const liveLegacy = (q: Db) =>
    q
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.learnerId, learnerId), eq(sessions.older, false), ne(sessions.model, TUTOR_MODEL), topicId === null ? isNull(sessions.topicId) : eq(sessions.topicId, topicId)));
  // Almost every turn finds none: no lock is taken then.
  if (!(await liveLegacy(db)).length) return false;
  return db.transaction(async (transaction) => {
    const tx = transaction as unknown as Db;
    await tx.select({ id: learnerState.id }).from(learnerState).where(eq(learnerState.learnerId, learnerId)).for("update");
    const legacy = await liveLegacy(tx);
    const closed: number[] = [];
    for (const { id } of legacy) {
      const [used] = await tx.select({ seq: messages.seq }).from(messages).where(eq(messages.sessionId, id)).limit(1);
      if (used) {
        await tx.update(sessions).set({ older: true }).where(eq(sessions.id, id));
        closed.push(id);
      } else {
        const { instructions, tools, model, effort, fingerprint } = await frozenNow(tx);
        await tx.update(sessions).set({ instructions, tools, model, effort, fingerprint, refrozenAtSeq: null }).where(eq(sessions.id, id));
      }
    }
    if (closed.length) await tx.update(learnerState).set({ shownSessionId: null }).where(and(eq(learnerState.learnerId, learnerId), inArray(learnerState.shownSessionId, closed)));
    return closed.length > 0;
  });
}

/**
 * Whether `shownId` is a Claude-era Session closed in favour of `liveId`: the same Learner and Topic. A tab still showing
 * the old Session may then resume the new Session's unfinished turn (its page learns of the new Session only on "done").
 */
export async function closedInFavourOf(db: Db, learnerId: number, shownId: number, liveId: number | null): Promise<boolean> {
  if (liveId === null || shownId === liveId) return false;
  const rows = await db.select().from(sessions).where(and(eq(sessions.learnerId, learnerId), inArray(sessions.id, [shownId, liveId])));
  const shown = rows.find((r) => r.id === shownId);
  const live = rows.find((r) => r.id === liveId);
  return shown !== undefined && live !== undefined && shown.older && isLegacySession(shown) && !isLegacySession(live) && shown.topicId === live.topicId;
}

/**
 * The instructions, tools, model and effort a Session freezes now, with their fingerprint: the widget engine's (ADR
 * 0005), the only Widget lane since #19.
 */
export async function frozenNow(db: Db) {
  const { effort } = await readSettings(db);
  const model = TUTOR_MODEL;
  const instructions = ENGINE_INSTRUCTIONS;
  const tools = ENGINE_TOOLS;
  return { instructions, tools, model, effort, fingerprint: fingerprint(instructions, tools) };
}

export const isCompaction = (content: unknown) => Array.isArray(content) && content.some((b) => b?.type === "compaction");

export type Row = { seq: number } & Message;

/**
 * A Session's stored history. Every row stays stored (add-only); what is sent to the model:
 * - starts at the latest compaction block, which stands in for everything before it;
 * - leaves out every row of a refused turn (the Learner's message, context and kept loop steps alike),
 *   which the Learner still sees;
 * - sends the steps from before the Session was last refrozen rebuilt from their blocks, without their raw
 *   OpenAI output (`replay`, which holds the reasoning made under the old instructions and tools);
 * - leaves out what the reply checks rejected (reply_checks): a draft's or failed retry's text-only
 *   messages and the correction message go, and a rejected tool-use message keeps its tool calls but
 *   not its text, so every tool_use keeps its tool_result. An edited row also loses its `replay` block, so the
 *   adapter sends it rebuilt from what is left (openai-items.ts);
 * - in a turn where the checks rejected a row, sends every row after the earliest rejected one without its `replay`
 *   block too (A1, ADR 0016, `withoutReplayAfterEdits`): the accepted retry was written with the rejected draft and the
 *   correction before it in its turn, so its reasoning item no longer belongs to what is sent, and the API refuses it
 *   while that turn is current (the compaction after the reply, or a resumed turn). Everything else replays unchanged.
 * `rows` is the Session as the Learner saw it (rejected text left out too); rows appended later are kept whole.
 * `resuming` names a turn being resumed: its own rows stay whole, as they are in a live run, so its retry is asked with
 * its draft and the correction; the turn keeps its rejected rows itself (`rejectedRows`).
 */
export async function openLog(db: Db, sessionId: number, now: () => Date, resuming?: number) {
  const stored = (await db
    .select({ seq: messages.seq, role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.seq))) as Row[];
  let nextSeq = stored.length ? stored[stored.length - 1].seq + 1 : 0;
  const rows = withoutRejected(stored, await rejectedSeqsOf(db, sessionId, resuming), await turnStarts(db, sessionId));
  const [session] = await db.select({ refrozenAtSeq: sessions.refrozenAtSeq }).from(sessions).where(eq(sessions.id, sessionId));
  const refused = await refusedSeqs(db, sessionId);
  const refrozenAt = session?.refrozenAtSeq ?? 0;
  const sent: Message[] = rows
    .slice(Math.max(rows.findLastIndex((r) => isCompaction(r.content)), 0))
    // A refreeze's summary is stored before its turn begins, so it can fall in a refused turn's span of seqs; it is
    // code's, made from history that already left that turn out, and everything before it was sliced away above.
    .filter((r) => !refused(r.seq) || isCompaction(r.content))
    .map((r) => ({ role: r.role, content: r.seq < refrozenAt ? withoutReasoning(r.content) : r.content }) as Message);
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
 * with tool calls keeps everything but its text blocks and its raw `replay` output (the step is no longer as it came). A
 * row of tool results always stays, since its calls stay, and so does a compaction summary: no rejection drops either
 * (`rejectedRows`), but records saved before that rule could list one.
 */
export function withoutRejected<R extends { seq: number; role: string; content?: unknown }>(rows: R[], rejected: ReadonlySet<number>, starts: readonly number[] = []): R[] {
  if (!rejected.size) return rows;
  const kept = rows.flatMap((r) => {
    if (!rejected.has(r.seq) || (Array.isArray(r.content) && r.content.some((b) => b?.type === "tool_result")) || isCompaction(r.content)) return [r];
    if (r.role !== "assistant" || !Array.isArray(r.content)) return [];
    const content = r.content.filter((b) => b?.type !== "text" && b?.type !== "replay");
    return content.some((b) => b?.type === "tool_use" || b?.type === "server_tool_use") ? [{ ...r, content }] : [];
  });
  return withoutReplayAfterEdits(kept, editsOf(rejected, starts));
}

/**
 * An edit of what was sent (A1, ADR 0016): from the earliest row code left out or changed in a turn (`at`), up to the
 * next turn's first row (`until`). Every row after `at` in that span was written with the edited row before it.
 */
export type HistoryEdit = { at: number; until: number };

/** The edits a set of left-out or shortened rows makes: one per turn, from its earliest such row (see `HistoryEdit`). */
export function editsOf(changed: Iterable<number>, starts: readonly number[]): HistoryEdit[] {
  const sorted = [...starts].sort((a, b) => a - b);
  const earliest = new Map<number, number>();
  for (const seq of changed) {
    const turn = sorted.findLast((s) => s <= seq) ?? -Infinity;
    earliest.set(turn, Math.min(earliest.get(turn) ?? Infinity, seq));
  }
  return [...earliest.values()].map((at) => ({ at, until: sorted.find((s) => s > at) ?? Infinity }));
}

/**
 * Rows after an edit, in its turn, without their raw output (`replay`): the general rule any filter that leaves out or
 * shortens earlier content must apply (A1). Such a step is sent rebuilt from its readable blocks, without reasoning,
 * as main's adapter sends any edited step (openai-items.ts). Rows of other turns are untouched.
 */
export function withoutReplayAfterEdits<R extends { seq: number; content?: unknown }>(rows: R[], edits: readonly HistoryEdit[]): R[] {
  if (!edits.length) return rows;
  return rows.map((r) => (edits.some((e) => r.seq > e.at && r.seq < e.until) && hasReplay(r.content) ? { ...r, content: withoutReasoning(r.content) } : r));
}

const hasReplay = (content: unknown) => Array.isArray(content) && content.some((b) => b?.type === "replay" || b?.type === "thinking" || b?.type === "redacted_thinking");

/** Each turn's first row (its turn seq), in order. */
async function turnStarts(db: Db, sessionId: number): Promise<number[]> {
  const rows = await db
    .select({ seq: turns.turnSeq })
    .from(turns)
    .where(and(eq(turns.sessionId, sessionId), isNotNull(turns.turnSeq)))
    .orderBy(asc(turns.turnSeq));
  return rows.map((r) => r.seq!);
}

/** Assistant content without its reasoning: the raw `replay` output (and a Claude-era row's thinking blocks); anything else unchanged. */
function withoutReasoning(content: unknown): unknown {
  return Array.isArray(content) ? content.filter((b) => b?.type !== "replay" && b?.type !== "thinking" && b?.type !== "redacted_thinking") : content;
}
export type Log = Awaited<ReturnType<typeof openLog>>;

/** History as sent to the model, for a Session that isn't being written to. */
export async function history(db: Db, sessionId: number): Promise<Message[]> {
  return (await openLog(db, sessionId, () => new Date())).messages;
}

