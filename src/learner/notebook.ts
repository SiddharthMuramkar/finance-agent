import type { CourseMap, Topic } from "@/course/map";
import { courseOverview, type TopicOverview } from "@/course/navigator";
import type { Db } from "@/db/types";
import { loadPastSessions, type EarlierAttemptRow, type OlderSessionRow } from "@/tutor/past-sessions";
import { loadProgress } from "./memory";
import { loadNotes, type TopicNote } from "./notes";

/**
 * The Notebook (spec 2026-11-05 B2a): one row per Topic, in course order, joining what two pages listed
 * apart. A Topic has a row when it has a Session, an Earlier attempt or a note (a passed Topic, a line or a saved item), or when `all` asks
 * for every Topic. Worked out by code from the Learner's own records; no model call.
 */

export type NotebookRow = {
  topicId: string;
  title: string;
  stage: Topic["stage"];
  status: TopicOverview["status"];
  /** The Topic's Session (the live one), if it has one. */
  sessionId: number | null;
  /** When the Learner last worked in that Session. */
  lastActive: Date | null;
  /** Resume: an in-progress Topic. Read: a passed Topic that has a Session. Nothing otherwise. */
  action: "resume" | "read" | null;
  /** What the Learner found, a line each. */
  found: string[];
  /** Earlier attempts (the Topic started over), newest first. */
  earlier: EarlierAttemptRow[];
  /** The Topic Note: filled part, own lines, saved replies and Widgets. */
  note: TopicNote;
};

export type Notebook = { rows: NotebookRow[]; older: OlderSessionRow[] };

/** A note worth a row: the Topic is passed, or the Learner wrote or saved something on it. */
const hasNote = (n: TopicNote) => n.passed || n.lines.length > 0 || n.saved.length > 0;

export async function loadNotebook(db: Db, map: CourseMap, learnerId: number, opts: { all: boolean }): Promise<Notebook> {
  const [past, notes, progress] = await Promise.all([loadPastSessions(db, map, learnerId), loadNotes(db, map, learnerId), loadProgress(db, learnerId)]);
  const overview = new Map(courseOverview(map, progress).map((t) => [t.id, t]));
  const sessionOf = new Map(past.topics.flatMap((s) => (s.topicId ? [[s.topicId, s] as const] : [])));
  const rows: NotebookRow[] = [];
  for (const note of notes) {
    const session = sessionOf.get(note.topicId);
    const earlier = past.earlier.filter((e) => e.topicId === note.topicId);
    if (!opts.all && !session && earlier.length === 0 && !hasNote(note)) continue;
    const status = overview.get(note.topicId)?.status ?? "not_started";
    const action = status === "in_progress" ? "resume" : status === "passed" && session ? "read" : null;
    rows.push({
      topicId: note.topicId,
      title: note.title,
      stage: note.stage,
      status,
      sessionId: session?.id ?? null,
      lastActive: session?.lastActive ?? null,
      action,
      found: session?.found ?? [],
      earlier,
      note,
    });
  }
  return { rows, older: past.older };
}
