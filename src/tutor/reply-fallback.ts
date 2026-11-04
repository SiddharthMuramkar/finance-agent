import type { CourseMap } from "@/course/map";
import type { Place } from "@/course/navigator";
import type { Db } from "@/db/types";
import { practiceFallback } from "./practice";
import type { SessionItem } from "./session-item-kinds";

/**
 * The card hook of the reply checks' fallback (spec #229, ticket #239): when a reply fails its checks and its one retry
 * fails too (or there is no time left to retry), the Tutor Turn shows what this returns instead, when it returns
 * something. Ticket #243 fills it: at a converted step with a Concept card, the card's write-down line, then at Your
 * turn the next Quick try. Elsewhere it returns null, and the turn shows the reply cut to its word limit (`trimToCap`).
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
  return practiceFallback(db, map, learnerId, place);
}
