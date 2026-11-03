import { asc, eq } from "drizzle-orm";
import { exploreWidgetInSession, type ExploreWidget } from "@/course/explore-widget";
import type { CourseMap } from "@/course/map";
import { messages } from "@/db/schema";
import type { Db } from "@/db/types";
import { WIDGET_CHECK_PREFIX } from "@/widgets/check";

/** What a past Sessions card shows about one Session, worked out by code from its saved messages. No model call. */
export type SessionSummary = { topics: string[]; widgets: number };

const TOPIC_LINE = /^Topic: (.+) \([A-Za-z]+ Stage\)\.$/gm;
const WIDGET_FENCE = /```openui-lang/g;

/** Every string inside a stored message content (text blocks, tool results, plain strings). */
function stringsIn(content: unknown): string[] {
  if (typeof content === "string") return [content];
  if (Array.isArray(content)) return content.flatMap(stringsIn);
  if (content && typeof content === "object") return Object.values(content).flatMap(stringsIn);
  return [];
}

/** Topics named by the Tutor context lines, in order of first appearance, and the Widgets the Tutor wrote (a correction replaces one). */
export function summariseRows(rows: { role: string; content: unknown }[]): SessionSummary {
  const topics: string[] = [];
  let fences = 0;
  let corrections = 0;
  for (const r of rows) {
    const text = stringsIn(r.content).join("\n");
    if (r.role === "assistant") fences += text.match(WIDGET_FENCE)?.length ?? 0;
    else if (r.role === "user" && text.startsWith(WIDGET_CHECK_PREFIX)) corrections++;
    for (const m of text.matchAll(TOPIC_LINE)) if (!topics.includes(m[1])) topics.push(m[1]);
  }
  return { topics, widgets: Math.max(0, fences - corrections) };
}

/** Every Session's summary in one query, keyed by Session id. */
export async function loadSessionSummaries(db: Db): Promise<Map<number, SessionSummary>> {
  const rows = await db
    .select({ sessionId: messages.sessionId, role: messages.role, content: messages.content })
    .from(messages)
    .orderBy(asc(messages.sessionId), asc(messages.seq));
  const bySession = new Map<number, { role: string; content: unknown }[]>();
  for (const r of rows) {
    const list = bySession.get(r.sessionId) ?? [];
    list.push(r);
    bySession.set(r.sessionId, list);
  }
  return new Map([...bySession].map(([id, rs]) => [id, summariseRows(rs)]));
}

/** The explore Widget an old Session showed (the Topic's own, not one the Tutor drew), or null. No model call. */
export async function loadSessionExplore(db: Db, sessionId: number, map: CourseMap): Promise<ExploreWidget | null> {
  const rows = await db.select({ content: messages.content }).from(messages).where(eq(messages.sessionId, sessionId)).orderBy(asc(messages.seq));
  return exploreWidgetInSession(map, rows.flatMap((r) => stringsIn(r.content)).join("\n"));
}
