import { loadCourseMap, readOutlineText } from "@/course/map";
import { parseOutline, spineTopics, type Outline, type Stage, type Subject } from "@/course/outline";

/** The Stages after the Spine and the Electives, whose Topics read real arguments. */
export type ReadingStage = Extract<Stage, "follow" | "judge" | "analyse">;
const READING_STAGES: readonly ReadingStage[] = ["follow", "judge", "analyse"];

/**
 * What the public site says about the course, read from the outline so every Spine change reaches Home, About, How it
 * works and Examples by itself (#72). `topics` and `subjects` count the Topics written and the Subjects they cover.
 */
export type CourseFacts = {
  topics: number;
  subjects: number;
  cases: number;
  /** The Spine in order: number, title and the minutes its Topic file says it takes. */
  spine: { n: number; title: string; minutes?: number }[];
  /** The shortest and longest Spine Topic, in minutes (0 and 0 while the Spine is empty). */
  minutes: { low: number; high: number };
  electives: number;
  /** The Electives per Subject, in the order the outline first names each Subject. */
  bySubject: { name: Subject; count: number }[];
  /** The Topics per reading Stage, in Stage order. */
  byStage: { stage: ReadingStage; count: number }[];
};

/** The facts of one outline, given the ids of the Topics written so far. Pure: no files, no database. */
export function courseFacts(outline: Outline, written: ReadonlySet<string>): CourseFacts {
  const spine = spineTopics(outline).map((t) => ({ n: t.spine as number, title: t.title, minutes: t.minutes }));
  const mins = spine.map((t) => t.minutes).filter((m): m is number => m !== undefined);
  const bySubject = new Map<Subject, number>();
  for (const t of outline.topics) if (t.stage === "foundation" && t.subject) bySubject.set(t.subject, (bySubject.get(t.subject) ?? 0) + 1);
  const writtenTopics = outline.topics.filter((t) => written.has(t.id));
  return {
    topics: writtenTopics.length,
    subjects: new Set(writtenTopics.map((t) => t.subject).filter(Boolean)).size,
    cases: outline.topics.reduce((n, t) => n + t.cases.length, 0),
    spine,
    minutes: mins.length ? { low: Math.min(...mins), high: Math.max(...mins) } : { low: 0, high: 0 },
    electives: outline.topics.filter((t) => t.stage === "foundation").length,
    bySubject: [...bySubject].map(([name, count]) => ({ name, count })),
    byStage: READING_STAGES.map((stage) => ({ stage, count: outline.topics.filter((t) => t.stage === stage).length })),
  };
}

/** The ids of the Topics written in `course/topics`. */
export function writtenTopicIds(): ReadonlySet<string> {
  return new Set(loadCourseMap().topics.map((t) => t.id));
}

/** The facts of the real course, from `course/outline.yaml` and the Topic files. No database. */
export function courseStats(): CourseFacts {
  const { outline, errors } = parseOutline(readOutlineText());
  if (!outline) throw new Error(`Invalid Course Map outline:\n${errors.join("\n")}`);
  return courseFacts(outline, writtenTopicIds());
}

/** The counts Home puts into sentences. Nothing here reads the database. */
export async function landingStats(): Promise<CourseFacts> {
  return courseStats();
}
