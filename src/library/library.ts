import type { CourseMap } from "@/course/map";
import { navigate, type Progress } from "@/course/navigator";
import type { Db } from "@/db/types";
import { loadProgress } from "@/learner/memory";
import type { BetaSearchResultBlockParam } from "@anthropic-ai/sdk/resources/beta/messages";
import { firstWords, passagePath, passageSentences } from "./passage";
import { allSources, hiddenAmong, passageById, searchPassages, sourcesMatching, type LibraryHit } from "./search";

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
 * The as-of rule for citations: which of these cited passages are hidden now. A reply can cite a passage
 * found by a search made before the Learner reached a Case, so its heading is withheld in the Sources list
 * until the reveal, as the passage view withholds its text.
 */
export async function hiddenPassages(deps: Pick<LibraryDeps, "db" | "map">, ids: number[]): Promise<Set<number>> {
  if (!ids.length) return new Set();
  return hiddenAmong(deps.db, ids, libraryAsOf(deps.map, await loadProgress(deps.db)));
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

/** The notes that open a search's answer: what was searched, any fallback, and the as-of rule. */
function searchNotes(search: LibrarySearch): string[] {
  const scope = search.source ? ` within sources matching "${search.source}"` : "";
  const lines = [`Library search for "${search.query}"${scope}: ${search.mode === "combined" ? "keyword and vector results combined." : "keyword results only."}`];
  if (search.fallback) lines.push(search.fallback);
  if (search.asOf) lines.push(`The Case is before its reveal, so dated passages published after ${search.asOf}, and reference passages that mention a later year, are hidden. Do not use what is shown to hint at the Case's outcome.`);
  return lines;
}

const QUOTING = "When you quote or draw on a passage, name its source in plain text, keep quotes short, and never present it as your own words.";

/** A source's quoting terms: the most words that may be quoted at once, where the source sets a limit. */
function quoteLimit(title: string, words: number): string {
  return `Quote at most ${words} words from "${title}" at a time, with credit; put the rest in your own words.`;
}

/** What the Tutor's search_library tool returns when nothing was found: plain text. */
export function searchResultText(search: LibrarySearch): string {
  if (search.knownSources) return `No Library source matches "${search.source}". The Library holds: ${search.knownSources.join("; ")}. Use a name that appears in one of these, or leave the source filter out.`;
  const lines = searchNotes(search);
  if (!search.results.length) {
    lines.push("", "No Library passage matched. Say so plainly rather than quoting from memory; you can try other words.");
    return lines.join("\n");
  }
  search.results.forEach((r, i) => {
    const date = r.publishedOn ? `, published ${r.publishedOn}` : "";
    lines.push("", `[${i + 1}] ${r.heading}`, `Source: ${r.credit} (${r.licence}${date}). ${r.url}`, r.text);
  });
  const limited = new Map(search.results.filter((r) => r.quoteWords).map((r) => [r.sourceTitle, r.quoteWords!]));
  for (const [title, words] of limited) lines.push("", quoteLimit(title, words));
  lines.push("", QUOTING);
  return lines.join("\n");
}

/**
 * What the Tutor's search_library tool returns: plain text when nothing was found, otherwise one
 * `search_result` block per passage with citations enabled, so Claude's reply cites the exact
 * sentences it drew on. Each result's source is the passage view (/passages/<id>) and its title the
 * passage heading. Its first block carries the credit line, licence, date, link and any quote limit
 * (a tool result that holds search results may hold nothing else, so the search notes go in the
 * first result's first block); then come the passage's sentences, one block each.
 */
export function searchResultBlocks(search: LibrarySearch): string | BetaSearchResultBlockParam[] {
  if (search.knownSources || !search.results.length) return searchResultText(search);
  return search.results.map((r, i) => {
    const date = r.publishedOn ? `, published ${r.publishedOn}` : "";
    const header = [
      ...(i === 0 ? [...searchNotes(search), QUOTING, ""] : []),
      `Source: ${r.credit} (${r.licence}${date}). ${r.url}`,
      ...(r.quoteWords ? [quoteLimit(r.sourceTitle, r.quoteWords)] : []),
    ].join("\n");
    return {
      type: "search_result" as const,
      source: passagePath(r.id),
      title: r.heading,
      content: [{ type: "text" as const, text: `${header}\n\n` }, ...passageSentences(r.text).map((text) => ({ type: "text" as const, text }))],
      citations: { enabled: true },
    };
  });
}

/** What the passage view shows for a cited passage. */
export type PassageView =
  | { status: "missing" }
  /** The Case is before its reveal and this passage could tell its outcome. */
  | { status: "hidden"; asOf: string }
  | {
      status: "shown";
      heading: string;
      sourceTitle: string;
      credit: string;
      licence: string;
      url: string;
      publishedOn: string | null;
      /** The source's quote limit in words, or null for none. */
      quoteWords: number | null;
      /** True when the quote limit cut the passage down: the rest is read at `url`. */
      shortened: boolean;
      /** The sentences shown, each marked if the citation rests on it. */
      sentences: { text: string; cited: boolean }[];
    };

/**
 * The passage view behind a citation: the stored passage, its credit and link, with the sentences
 * the citation rests on marked. `blocks` is the citation's block range in the search result, whose
 * block 0 is the credit line and block k the passage's sentence k-1. The as-of rule applies: while a
 * Case is before its reveal, a passage search would hide is hidden here too. A source's terms apply:
 * for a source with a quote limit only the cited sentences are shown (the first ones when none are
 * named), cut to that many words, and the Learner reads the rest at the original.
 */
export async function loadPassageView(deps: LibraryDeps, id: number, blocks?: { from: number; to: number }): Promise<PassageView> {
  const asOf = libraryAsOf(deps.map, await loadProgress(deps.db));
  const passage = await passageById(deps.db, id, asOf);
  if (!passage) return { status: "missing" };
  if (!passage.allowed) return { status: "hidden", asOf: asOf! };
  const cited = (i: number) => (blocks ? i + 1 >= blocks.from && i + 1 < blocks.to : false);
  let sentences = passageSentences(passage.text).map((text, i) => ({ text, cited: cited(i) }));
  let shortened = false;
  if (passage.quoteWords) {
    const chosen = blocks && sentences.some((s) => s.cited) ? sentences.filter((s) => s.cited) : sentences;
    const cut = firstWords(chosen.map((s) => s.text).join(""), passage.quoteWords);
    shortened = cut.cut || chosen.length < sentences.length;
    sentences = [{ text: cut.text, cited: chosen.some((s) => s.cited) }];
  }
  const { heading, sourceTitle, credit, licence, url, publishedOn, quoteWords } = passage;
  return { status: "shown", heading, sourceTitle, credit, licence, url, publishedOn, quoteWords, shortened, sentences };
}
