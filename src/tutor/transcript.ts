import { and, asc, desc, eq } from "drizzle-orm";
import { messages, OWNER_LEARNER_ID, sessions } from "@/db/schema";
import type { Db } from "@/db/types";
import { leaveOutWidgets, replaceBrokenWidgets, WIDGET_CHECK_PREFIX } from "@/widgets/check";
import type { CaseDataset } from "@/case-data/case-data";
import { loadCourseMap, type CourseMap } from "@/course/map";
import { CitationMarks, citedPassageIds, displayText } from "./citations";
import { replyFold, sourceContext, topicDatasets, type SourceDeps } from "./sources";
import { topicTitleIn } from "./session-summary";
import { OPENING_PREFIX } from "./context";
import { PASTE_PREFIX, pasteLabel } from "./pasted";
import { currentTopicId, liveSession, type Message, type Row } from "./session-log";
import { isCodeWritten } from "./turn-status";
import { loadTurnUsages, type TurnUsage } from "./usage";
import { loadSessionItems, type StoredItem } from "./session-items";

/** A Session turned into plain lines for display: the workspace after a reload, old Session pages, a replayed reply. No model call. */

/** What separates the text of one loop step from the next within a reply. */
export const PARAGRAPH = "\n\n";

/**
 * What a reply's sources need: each cited passage's credit, the passages the as-of rule hides now, and the Case Data allowed now.
 * Without the Course Map nothing is withheld, so every page that shows replies passes it.
 */
const sourcesFor = (deps: SourceDeps, contents: unknown[]) => sourceContext(deps, citedPassageIds(contents));

/**
 * The reply text a turn has saved so far, with any widget correction swapped in, as the browser shows it:
 * the text of every loop step, then one folded list of the reply's sources (under the as-of rule for the Learner).
 */
export async function turnText(rows: Row[], turnSeq: number, deps: SourceDeps & { map: CourseMap }): Promise<string> {
  const ctx = await sourcesFor(deps, rows.filter((r) => r.seq > turnSeq && r.role === "assistant").map((r) => r.content));
  const marks = new CitationMarks();
  let text = "";
  // After a correction message: the widgets it names that a corrected block replaces, until one has.
  let correcting: Correcting = undefined;
  for (const r of rows.filter((r) => r.seq > turnSeq)) {
    if (r.role === "user" && textOf(r.content).startsWith(WIDGET_CHECK_PREFIX)) {
      // Widgets a written-ahead Widget covers leave the reply at once; the Tutor opens that one instead.
      const out = leaveOutWidgets(text, textOf(r.content));
      text = out.text;
      correcting = out.left ? { flagged: out.flagged } : "done";
    }
    if (r.role !== "assistant") continue;
    const added = displayText(r.content, correcting ? new CitationMarks() : marks);
    if (correcting === undefined) text = text && added ? text + PARAGRAPH + added : text + added;
    else if (correcting !== "done" && hasWidgetBlock(added)) {
      text = replaceBrokenWidgets(text, added, correcting.flagged);
      correcting = "done";
    }
  }
  return text ? text + replyFold(marks, text, ctx) : text;
}

/**
 * Where a turn's widget correction stands: no correction message yet (undefined), the widgets it named that its
 * corrected block replaces (positions from 0, after any left out), or done. Everything the Tutor writes after a
 * correction message is the correction: only its widget blocks are used, never its prose.
 */
type Correcting = { flagged: number[] } | "done" | undefined;

const hasWidgetBlock = (text: string) => text.includes("```openui-lang\n");

/** Which Session and turn a reply belongs to (the turn is the seq of the Learner's message that began it): what "Save to notes" keys on. */
export type TurnRef = { sessionId: number; turnSeq: number };

export type Line = { role: "user" | "assistant"; text: string; /** On a turn's last reply: what the turn cost. */ usage?: TurnUsage; /** On a reply: where it sits in its Session. */ ref?: TurnRef };

/**
 * The Learner's live Session for their current Topic, if its first turn has made it: what the Study
 * Workspace shows. Rendering makes no Session. Without a Course Map, the real one is read.
 */
export async function currentTopicSession(db: Db, map?: CourseMap, learnerId = OWNER_LEARNER_ID) {
  return liveSession(db, learnerId, await currentTopicId(db, map ?? loadCourseMap(), learnerId));
}

/** The Learner's live Session for their current Topic as plain text lines, for showing after a reload. No model call. */
export async function loadCurrentSession(db: Db, map?: CourseMap, learnerId = OWNER_LEARNER_ID): Promise<Line[]> {
  const session = await currentTopicSession(db, map, learnerId);
  return session ? loadSession(db, session.id, map, learnerId) : [];
}

/** Every Session of the Learner's, newest first, for reading old ones. */
export async function listSessions(db: Db, learnerId = OWNER_LEARNER_ID): Promise<{ id: number; createdAt: Date }[]> {
  return db
    .select({ id: sessions.id, createdAt: sessions.createdAt })
    .from(sessions)
    .where(eq(sessions.learnerId, learnerId))
    .orderBy(desc(sessions.id));
}

/**
 * One of the Learner's Sessions as plain text lines; another Learner's Session has none. No model call.
 * A widget correction is shown in place of the broken widget it replaced. Given the Course Map, a cited
 * passage the as-of rule hides now (for this Learner) is listed without its heading.
 */
export async function loadSession(db: Db, sessionId: number, map?: CourseMap, learnerId = OWNER_LEARNER_ID): Promise<Line[]> {
  return (await sessionEntries(db, sessionId, map, learnerId, [])) as Line[];
}

/** A Session item as the thread draws it, by its kind (session-items.ts). */
export type ItemEntry = { role: "item"; kind: string; data: Record<string, unknown> };
/**
 * One entry of a Session's thread: a message, a part of a reply, or a Session item. A reply that a Session
 * item cuts into parts has `more` on every part but its last: the reply goes on after the item.
 */
export type ThreadEntry = (Line & { more?: true }) | ItemEntry;

/**
 * One of the Learner's Sessions as the Study Workspace and the old Session page draw it: `loadSession`'s
 * lines with the Session's items in place, each after the message it follows. An item that falls inside a
 * reply (a step finished partway through it) cuts the reply in two there. No model call.
 */
export async function loadThread(db: Db, sessionId: number, map?: CourseMap, learnerId = OWNER_LEARNER_ID): Promise<ThreadEntry[]> {
  return sessionEntries(db, sessionId, map, learnerId, await loadSessionItems(db, sessionId, learnerId));
}

/** Marks where an item falls inside a reply's text while the reply is put together; never shown. */
const itemMark = (i: number) => `\u0000item:${i}\u0000`;
const ITEM_MARK = /\u0000item:(\d+)\u0000/;

const itemEntry = (item: StoredItem): ItemEntry => ({ role: "item", kind: item.kind, data: item.data });

async function sessionEntries(db: Db, sessionId: number, map: CourseMap | undefined, learnerId: number, items: StoredItem[]): Promise<ThreadEntry[]> {
  // A turn's loop steps make one reply: one line, whose citation numbers run through all its steps and whose sources fold at its end.
  const lines: (Line & { turnSeq?: number; marks?: CitationMarks; topic?: string })[] = [];
  // The Topic the Tutor's context named by each reply: its Case Data credits follow that Topic, not today's.
  let topic: string | undefined;
  // After a correction message: the widgets it named that its corrected block replaces, until one has.
  let correcting: Correcting = undefined;
  let turnSeq = 0;
  // The last row drawn-or-skipped was a code-written note, so the next reply starts its own line.
  let newTurn = false;
  const rows = await db
    .select({ seq: messages.seq, role: messages.role, content: messages.content })
    .from(messages)
    .innerJoin(sessions, eq(sessions.id, messages.sessionId))
    .where(and(eq(messages.sessionId, sessionId), eq(sessions.learnerId, learnerId)))
    .orderBy(asc(messages.seq));
  const deps = { db, map, learnerId };
  const ctx = await sourcesFor(deps, rows.filter((m) => m.role === "assistant").map((m) => m.content));
  // Items, in seq order, wait for the next row that is drawn: they go inside the reply that row continues, else before its line.
  let nextItem = 0;
  const waiting: number[] = [];
  const entries: (ItemEntry | (typeof lines)[number])[] = [];
  const push = (line: (typeof lines)[number]) => {
    for (const i of waiting.splice(0)) entries.push(itemEntry(items[i]));
    lines.push(line);
    entries.push(line);
  };
  for (const m of rows as (Message & { seq: number })[]) {
    while (nextItem < items.length && items[nextItem].afterSeq < m.seq) waiting.push(nextItem++);
    topic = topicTitleIn(m.content) ?? topic;
    const fix = correcting !== undefined && m.role === "assistant";
    // A reply is shown with its citation markers; its sources are added once the reply is complete.
    const marks = fix ? new CitationMarks() : (lines.at(-1)?.role === "assistant" ? lines.at(-1)!.marks : undefined) ?? new CitationMarks();
    const text = m.role === "assistant" ? displayText(m.content, marks) : textOf(m.content);
    if (!text || m.role === "system") continue;
    const target = lines.findLast((l) => l.role === "assistant");
    if (m.role === "user" && text.startsWith(WIDGET_CHECK_PREFIX)) {
      // Widgets a written-ahead Widget covers leave the reply at once; the Tutor opens that one instead.
      const out = leaveOutWidgets(target?.text ?? "", text);
      if (target) target.text = out.text;
      correcting = out.left ? { flagged: out.flagged } : "done";
      continue;
    }
    if (m.role === "user") correcting = undefined;
    // A note code wrote (an opener's, a Next's) is not the Learner's: it starts the turn but is never drawn as a bubble.
    if (m.role === "user" && isCodeWritten(text)) {
      turnSeq = m.seq;
      newTurn = true;
      continue;
    }
    const last = lines.at(-1);
    // A reply after a code-written note is a new turn's: it never carries on the reply before the note.
    const continues = !newTurn;
    newTurn = false;
    if (fix) {
      // Everything after a correction message is the correction: its first widget block replaces the flagged widgets.
      if (correcting === "done" || !hasWidgetBlock(text)) continue;
      if (target) target.text = replaceBrokenWidgets(target.text, text, correcting?.flagged);
      else push({ role: m.role, text, turnSeq, marks });
      correcting = "done";
    } else if (m.role === "assistant" && last?.role === "assistant" && continues) {
      // Items waiting here fall inside this reply: marked in its text, which is cut there once the reply is complete.
      last.text += (waiting.length ? waiting.splice(0).map(itemMark).join("") : PARAGRAPH) + text;
      last.topic = topic;
    } else {
      if (m.role === "user") turnSeq = m.seq;
      push({ role: m.role, text, turnSeq, ...(m.role === "assistant" && { marks, topic }) });
    }
  }
  // Items after the last drawn row come last.
  for (const i of waiting) entries.push(itemEntry(items[i]));
  for (const item of items.slice(nextItem)) entries.push(itemEntry(item));
  const datasetsByTopic = new Map<string | undefined, CaseDataset[]>();
  for (const l of lines) {
    if (!l.marks) continue;
    if (map && !datasetsByTopic.has(l.topic)) datasetsByTopic.set(l.topic, await topicDatasets({ ...deps, map }, l.topic));
    l.text += replyFold(l.marks, l.text, map ? { ...ctx, datasets: datasetsByTopic.get(l.topic) ?? [] } : ctx);
  }
  // The panel hangs off the last reply of each turn.
  for (const [seq, usage] of await loadTurnUsages(db, sessionId)) {
    const last = lines.findLast((l) => l.role === "assistant" && l.turnSeq === seq);
    if (last) last.usage = usage;
  }
  return entries.flatMap((l): ThreadEntry[] => {
    if (l.role === "item") return [l];
    const ref = l.role === "assistant" ? { ref: { sessionId, turnSeq: l.turnSeq! } } : {};
    const pieces = l.text.split(ITEM_MARK);
    if (pieces.length === 1) return [{ role: l.role, text: l.text, ...(l.usage && { usage: l.usage }), ...ref }];
    // A reply with items inside: its parts, with the items between them. The usage and sources stay on the last part.
    const out: ThreadEntry[] = [];
    for (let k = 0; k < pieces.length; k += 2) {
      const lastPart = k === pieces.length - 1;
      if (pieces[k]) out.push({ role: l.role, text: pieces[k], ...(lastPart ? l.usage && { usage: l.usage } : { more: true as const }), ...ref });
      if (!lastPart) out.push(itemEntry(items[Number(pieces[k + 1])]));
    }
    return out;
  });
}

export function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b): b is { type: "text"; text: string } => b?.type === "text" && !b.text.startsWith(OPENING_PREFIX))
    .map((b) => (b.text.startsWith(PASTE_PREFIX) ? `${PARAGRAPH}${pasteLabel(b.text)}` : b.text))
    .join("");
}
