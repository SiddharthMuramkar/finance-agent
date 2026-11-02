import type { CourseMap } from "@/course/map";
import { navigate, type Progress } from "@/course/navigator";
import type { Db } from "@/db/types";
import { loadProgress } from "@/learner/memory";
import { allSources, searchPassages, sourcesMatching, type LibraryHit } from "./search";

/** Turns the Learner's search into its Voyage embedding; absent when no Voyage key is set. */
export type QueryEmbedder = (query: string) => Promise<number[]>;

export type LibraryDeps = { db: Db; map: CourseMap; embedQuery?: QueryEmbedder };

export type LibrarySearch = {
  query: string;
  /** The as-of date hiding later dated passages, or null when no Case is before its reveal. */
  asOf: string | null;
  /** `combined` is keyword and vector results fused; `keyword` is the fallback without Voyage. */
  mode: "combined" | "keyword";
  /** The source or writer the search was scoped to, if any. */
  source: string | null;
  /** When `source` matched nothing: the sources the Library does hold, so the Tutor can name one. */
  knownSources: string[] | null;
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
 * If Voyage is missing or fails, it falls back to keyword results and says so. `source` scopes the
 * search to the sources whose id, title or credit contain that text, such as a writer's name.
 */
export async function searchLibrary(deps: LibraryDeps, query: string, { source, limit = 5 }: { source?: string; limit?: number } = {}): Promise<LibrarySearch> {
  const asOf = libraryAsOf(deps.map, await loadProgress(deps.db));
  const scope = source?.trim() || undefined;
  if (scope && !(await sourcesMatching(deps.db, scope)).length) {
    const known = (await allSources(deps.db)).map((s) => s.title);
    return { query, asOf, mode: "keyword", source: scope, knownSources: known, fallback: null, results: [] };
  }
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
  const results = await searchPassages(deps.db, { query, asOf, embedding, limit, source: scope });
  return { query, asOf, mode: embedding ? "combined" : "keyword", source: scope ?? null, knownSources: null, fallback, results };
}

/** What the Tutor's search_library tool returns: each passage with its heading, credit line, licence, date and link. */
export function searchResultText(search: LibrarySearch): string {
  if (search.knownSources) return `No Library source matches "${search.source}". The Library holds: ${search.knownSources.join("; ")}. Use a name that appears in one of these, or leave the source filter out.`;
  const scope = search.source ? ` within sources matching "${search.source}"` : "";
  const lines = [`Library search for "${search.query}"${scope}: ${search.mode === "combined" ? "keyword and vector results combined." : "keyword results only."}`];
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
  const limited = new Map(search.results.filter((r) => r.quoteWords).map((r) => [r.sourceTitle, r.quoteWords]));
  for (const [title, words] of limited) lines.push("", `Quote at most ${words} words from "${title}" at a time, with credit; put the rest in your own words.`);
  lines.push("", "When you quote or draw on a passage, name its source in plain text, keep quotes short, and never present it as your own words.");
  return lines.join("\n");
}
