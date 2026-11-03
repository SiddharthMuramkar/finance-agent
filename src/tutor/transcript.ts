import { and, asc, desc, eq } from "drizzle-orm";
import { messages, OWNER_LEARNER_ID, sessions } from "@/db/schema";
import type { Db } from "@/db/types";
import { flaggedWidgets, replaceBrokenWidgets, WIDGET_CHECK_PREFIX } from "@/widgets/check";
import type { CaseDataset } from "@/case-data/case-data";
import { loadCourseMap, type CourseMap } from "@/course/map";
import { CitationMarks, citedPassageIds, displayText } from "./citations";
import { replyFold, sourceContext, topicDatasets, type SourceDeps } from "./sources";
import { topicTitleIn } from "./session-summary";
import { OPENING_PREFIX } from "./context";
import { PASTE_PREFIX, pasteLabel } from "./pasted";
import { currentTopicId, liveSession, type Message, type Row } from "./session-log";
import { OPENER_PREFIX } from "./turn-status";
import { loadTurnUsages, type TurnUsage } from "./usage";

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
  // The widgets the last correction message named, while its corrected reply is awaited.
  let correcting: number[] | null = null;
  for (const r of rows.filter((r) => r.seq > turnSeq)) {
    if (r.role === "user" && textOf(r.content).startsWith(WIDGET_CHECK_PREFIX)) correcting = flaggedWidgets(textOf(r.content));
    if (r.role !== "assistant") continue;
    const added = displayText(r.content, correcting ? new CitationMarks() : marks);
    text = correcting ? replaceBrokenWidgets(text, added, correcting) : text && added ? text + PARAGRAPH + added : text + added;
    correcting = null;
  }
  return text ? text + replyFold(marks, text, ctx) : text;
}

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
  // A turn's loop steps make one reply: one line, whose citation numbers run through all its steps and whose sources fold at its end.
  const lines: (Line & { turnSeq?: number; marks?: CitationMarks; topic?: string })[] = [];
  // The Topic the Tutor's context named by each reply: its Case Data credits follow that Topic, not today's.
  let topic: string | undefined;
  // The widgets the last correction message named, while its corrected reply is awaited.
  let correcting: number[] | null = null;
  let turnSeq = 0;
  const rows = await db
    .select({ seq: messages.seq, role: messages.role, content: messages.content })
    .from(messages)
    .innerJoin(sessions, eq(sessions.id, messages.sessionId))
    .where(and(eq(messages.sessionId, sessionId), eq(sessions.learnerId, learnerId)))
    .orderBy(asc(messages.seq));
  const deps = { db, map, learnerId };
  const ctx = await sourcesFor(deps, rows.filter((m) => m.role === "assistant").map((m) => m.content));
  for (const m of rows as (Message & { seq: number })[]) {
    topic = topicTitleIn(m.content) ?? topic;
    const fix = correcting !== null && m.role === "assistant";
    // A reply is shown with its citation markers; its sources are added once the reply is complete.
    const marks = fix ? new CitationMarks() : (lines.at(-1)?.role === "assistant" ? lines.at(-1)!.marks : undefined) ?? new CitationMarks();
    const text = m.role === "assistant" ? displayText(m.content, marks) : textOf(m.content);
    if (!text || m.role === "system") continue;
    if (m.role === "user" && text.startsWith(WIDGET_CHECK_PREFIX)) {
      correcting = flaggedWidgets(text);
      continue;
    }
    // An opener's note is written by code, not the Learner: it starts the turn but is never drawn as a bubble.
    if (m.role === "user" && text.startsWith(OPENER_PREFIX)) {
      turnSeq = m.seq;
      continue;
    }
    const flagged = correcting ?? undefined;
    correcting = null;
    const last = lines.at(-1);
    if (fix) {
      const target = lines.findLast((l) => l.role === "assistant");
      if (target) target.text = replaceBrokenWidgets(target.text, text, flagged);
      else lines.push({ role: m.role, text, turnSeq, marks });
    } else if (m.role === "assistant" && last?.role === "assistant") {
      last.text += PARAGRAPH + text;
      last.topic = topic;
    } else {
      if (m.role === "user") turnSeq = m.seq;
      lines.push({ role: m.role, text, turnSeq, ...(m.role === "assistant" && { marks, topic }) });
    }
  }
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
  return lines.map((l) => ({ role: l.role, text: l.text, ...(l.usage && { usage: l.usage }), ...(l.role === "assistant" && { ref: { sessionId, turnSeq: l.turnSeq! } }) }));
}

export function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b): b is { type: "text"; text: string } => b?.type === "text" && !b.text.startsWith(OPENING_PREFIX))
    .map((b) => (b.text.startsWith(PASTE_PREFIX) ? `${PARAGRAPH}${pasteLabel(b.text)}` : b.text))
    .join("");
}
