import { asc, desc, eq } from "drizzle-orm";
import { messages, sessions } from "@/db/schema";
import type { Db } from "@/db/types";
import { replaceBrokenWidgets, WIDGET_CHECK_PREFIX } from "@/widgets/check";
import type { CourseMap } from "@/course/map";
import { hiddenPassages } from "@/library/library";
import { citedPassageIds, displayText } from "./citations";
import { OPENING_PREFIX } from "./context";
import { PASTE_PREFIX, pasteLabel } from "./pasted";
import { currentSession, type Message, type Row } from "./session-log";
import { loadTurnUsages, type TurnUsage } from "./usage";

/** A Session turned into plain lines for display: the workspace after a reload, old Session pages, a replayed reply. No model call. */

/** What separates the text of one loop step from the next within a reply. */
export const PARAGRAPH = "\n\n";

/**
 * The as-of rule for what these stored replies cite: the passages whose headings the Sources lists withhold now.
 * Without the Course Map nothing is withheld, so every page that shows replies passes it.
 */
async function hiddenIn(db: Db, map: CourseMap | undefined, contents: unknown[]): Promise<Set<number>> {
  return map ? hiddenPassages({ db, map }, citedPassageIds(contents)) : new Set();
}

/** The reply text a turn has saved so far, with any widget correction swapped in, as the browser shows it. */
export async function turnText(rows: Row[], turnSeq: number, { db, map }: { db: Db; map: CourseMap }): Promise<string> {
  const hidden = await hiddenIn(db, map, rows.filter((r) => r.seq > turnSeq && r.role === "assistant").map((r) => r.content));
  let text = "";
  let correcting = false;
  for (const r of rows.filter((r) => r.seq > turnSeq)) {
    if (r.role === "user" && textOf(r.content).startsWith(WIDGET_CHECK_PREFIX)) correcting = true;
    if (r.role !== "assistant") continue;
    const added = displayText(r.content, hidden);
    text = correcting ? replaceBrokenWidgets(text, added) : text && added ? text + PARAGRAPH + added : text + added;
    correcting = false;
  }
  return text;
}

export type Line = { role: "user" | "assistant"; text: string; /** On a turn's last reply: what the turn cost. */ usage?: TurnUsage };

/** The latest Session as plain text lines, for showing after a reload. No model call. */
export async function loadCurrentSession(db: Db, map?: CourseMap): Promise<Line[]> {
  const session = await currentSession(db);
  return session ? loadSession(db, session.id, map) : [];
}

/** Every Session, newest first, for reading old ones. */
export async function listSessions(db: Db): Promise<{ id: number; createdAt: Date }[]> {
  return db.select({ id: sessions.id, createdAt: sessions.createdAt }).from(sessions).orderBy(desc(sessions.id));
}

/**
 * One Session's conversation as plain text lines. No model call. A widget
 * correction is shown in place of the broken widget it replaced. Given the Course Map, a cited
 * passage the as-of rule hides now is listed without its heading.
 */
export async function loadSession(db: Db, sessionId: number, map?: CourseMap): Promise<Line[]> {
  const lines: (Line & { turnSeq?: number })[] = [];
  let correcting = false;
  let turnSeq = 0;
  const rows = await db
    .select({ seq: messages.seq, role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.seq));
  const hidden = await hiddenIn(db, map, rows.filter((m) => m.role === "assistant").map((m) => m.content));
  for (const m of rows as (Message & { seq: number })[]) {
    // A reply is shown with its citation markers and sources.
    const text = m.role === "assistant" ? displayText(m.content, hidden) : textOf(m.content);
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

export function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b): b is { type: "text"; text: string } => b?.type === "text" && !b.text.startsWith(OPENING_PREFIX))
    .map((b) => (b.text.startsWith(PASTE_PREFIX) ? `${PARAGRAPH}${pasteLabel(b.text)}` : b.text))
    .join("");
}
