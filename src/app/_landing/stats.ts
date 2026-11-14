import { loadCourseMap, readOutlineText } from "@/course/map";
import { parseOutline } from "@/course/outline";

export type LandingStats = { topics: number; subjects: number; cases: number };

/** The Topics written, the subjects they cover, and every Case in the outline. Read from files, no database. */
export function courseStats(): LandingStats {
  const { outline } = parseOutline(readOutlineText());
  const written = loadCourseMap().topics;
  const cases = (outline?.topics ?? []).reduce((n, t) => n + t.cases.length, 0);
  const subjects = new Set(written.map((t) => t.subject).filter((s): s is NonNullable<typeof s> => !!s)).size;
  return { topics: written.length, subjects, cases };
}

/** The counts Home puts into sentences. Nothing here reads the database. */
export async function landingStats(): Promise<LandingStats> {
  return courseStats();
}
