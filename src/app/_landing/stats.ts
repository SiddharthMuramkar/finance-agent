import { count } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { loadCourseMap, readOutlineText } from "@/course/map";
import { parseOutline } from "@/course/outline";
import { getDb } from "@/db/client";
import { librarySources } from "@/db/schema";
import type { Db } from "@/db/types";

export type LandingStats = { topics: string; cases: number; librarySources: number };

/** Topics as "written of planned" and every Case in the outline. Read from files, no database. */
export function courseStats(): Omit<LandingStats, "librarySources"> {
  const map = loadCourseMap();
  const written = map.topics.length;
  const planned = written + map.coming.length;
  const { outline } = parseOutline(readOutlineText());
  const cases = (outline?.topics ?? []).reduce((n, t) => n + t.cases.length, 0);
  return { topics: `${written} of ${planned}`, cases };
}

/** How many sources the Library holds. A count only: no passage text is read. */
export async function librarySourceCount(db: Db) {
  const [row] = await db.select({ n: count() }).from(librarySources);
  return row?.n ?? 0;
}

// Cached for a day, so bots hitting the public page don't wake the database.
const cachedSourceCount = unstable_cache(() => librarySourceCount(getDb()), ["landing-library-sources"], {
  revalidate: 86400,
});

/** The three numbers the landing page shows. */
export async function landingStats(): Promise<LandingStats> {
  return { ...courseStats(), librarySources: await cachedSourceCount() };
}
