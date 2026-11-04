import type { CourseMap } from "@/course/map";
import type { Place } from "@/course/navigator";
import type { Db } from "@/db/types";
import type { SessionItem } from "./session-item-kinds";

/**
 * The card hook of the reply checks' fallback (spec #229, ticket #239): when a reply fails its checks and its one retry
 * fails too (or there is no time left to retry), the Tutor Turn shows what this returns instead, when it returns
 * something. A later ticket (#240) fills it with the step's Concept card; until then it returns null, and the turn
 * shows the reply cut to its word limit (`trimToCap`).
 *
 * `text` is stored as the turn's final assistant text, so the history holds what the Learner saw; `items` are stored
 * as Session items after it and sent to the browser with it.
 */
export async function cardFallback(
  db: Db,
  map: CourseMap,
  learnerId: number,
  place: Place | null,
): Promise<{ text: string; items: SessionItem[] } | null> {
  void db;
  void map;
  void learnerId;
  void place;
  return null;
}
