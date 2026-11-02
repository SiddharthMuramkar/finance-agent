import type { CourseMap } from "@/course/map";
import { navigate, type Progress } from "@/course/navigator";
import type { Db } from "@/db/types";
import { loadProgress } from "@/learner/memory";
import { searchPassages, type LibraryHit } from "./search";

/** Turns the Learner's search into its Voyage embedding; absent when no Voyage key is set. */
export type QueryEmbedder = (query: string) => Promise<number[]>;

export type LibraryDeps = { db: Db; map: CourseMap; embedQuery?: QueryEmbedder };

export type LibrarySearch = {
  query: string;
  /** The as-of date hiding later dated passages, or null when no Case is before its reveal. */
  asOf: string | null;
  /** `combined` is keyword and vector results fused; `keyword` is the fallback without Voyage. */
  mode: "combined" | "keyword";
  /** Why the search fell back to keyword results only, for the Tutor. */
  fallback: string | null;
  results: LibraryHit[];
};

export const NO_VOYAGE_KEY = "Vector search is not set up (no Voyage key), so these are keyword matches only.";
export const VOYAGE_DOWN = "Vector search is unavailable right now (Voyage did not answer), so these are keyword matches only.";

/**
 * The as-of rule for the Library: while the Learner's current Topic has a Case whose reveal has not
 * been shown, search hides dated passages published after the Case's as-of date (the earliest one,
 * if the Topic has several Cases). Null when nothing is withheld.
 */
export function libraryAsOf(map: CourseMap, progress: Progress): string | null {
  const place = navigate(map, progress);
  if (!place || !place.topic.cases.length || progress.topics[place.topic.id]?.revealShown) return null;
  return place.topic.cases.map((c) => c.asOf).sort()[0];
}

/**
 * Searches the Library for the Tutor: combined keyword and vector search under the as-of rule.
 * If Voyage is missing or fails, it falls back to keyword results and says so.
 */
export async function searchLibrary(deps: LibraryDeps, query: string, limit = 5): Promise<LibrarySearch> {
  const asOf = libraryAsOf(deps.map, await loadProgress(deps.db));
  let embedding: number[] | undefined;
  let fallback: string | null = null;
  if (!deps.embedQuery) fallback = NO_VOYAGE_KEY;
  else {
    try {
      embedding = await deps.embedQuery(query);
    } catch (error) {
      console.error("Voyage query embedding failed", error);
      fallback = VOYAGE_DOWN;
    }
  }
  const results = await searchPassages(deps.db, { query, asOf, embedding, limit });
  return { query, asOf, mode: embedding ? "combined" : "keyword", fallback, results };
}

/** What the Tutor's search_library tool returns: each passage with its heading, credit line, licence, date and link. */
export function searchResultText(search: LibrarySearch): string {
  const lines = [`Library search for "${search.query}": ${search.mode === "combined" ? "keyword and vector results combined." : "keyword results only."}`];
  if (search.fallback) lines.push(search.fallback);
  if (search.asOf) lines.push(`The Case is before its reveal, so dated passages published after ${search.asOf}, and reference passages that mention a later year, are hidden. Do not use what is shown to hint at the Case's outcome.`);
  if (!search.results.length) {
    lines.push("", "No Library passage matched. Say so plainly rather than quoting from memory; you can try other words.");
    return lines.join("\n");
  }
  search.results.forEach((r, i) => {
    const date = r.publishedOn ? `, published ${r.publishedOn}` : "";
    lines.push("", `[${i + 1}] ${r.heading}`, `Source: ${r.credit} (${r.licence}${date}). ${r.url}`, r.text);
  });
  lines.push("", "When you quote or draw on a passage, name its source in plain text, keep quotes short, and never present it as your own words.");
  return lines.join("\n");
}
