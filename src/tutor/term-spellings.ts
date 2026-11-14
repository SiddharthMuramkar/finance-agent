/**
 * How a Topic term is found in a reply, shared by the Companion's Lingo card (companion.ts) and the word Choice
 * (choices.ts, spec 2026-11-12 G6). Pure, with no imports, so the browser bundle can use it too.
 */

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The ways a term is written: "compound annual growth rate (CAGR)" is found as the phrase or as "CAGR". */
export function spellings(term: string): string[] {
  const inner = term.match(/\(([^)]+)\)/)?.[1]?.trim();
  const outer = term.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  return [outer, ...(inner ? [inner] : [])].filter(Boolean);
}

/**
 * Where a term first appears in the text (case-insensitive, at word boundaries, a plural "s" allowed) and the spelling
 * found there, as the Topic writes it: the phrase without its brackets, or the bracketed short form. Null when absent.
 * Where both start at the same place, the phrase wins.
 */
export function termFound(text: string, term: string): { at: number; spelling: string } | null {
  let found: { at: number; spelling: string } | null = null;
  for (const s of spellings(term)) {
    const m = new RegExp(`(?<![\\p{L}\\p{N}])${escape(s)}s?(?![\\p{L}\\p{N}])`, "iu").exec(text);
    if (m && (!found || m.index < found.at)) found = { at: m.index, spelling: s };
  }
  return found;
}

/** Where a term first appears in the text, or -1 (see `termFound`). */
export const termAt = (text: string, term: string): number => termFound(text, term)?.at ?? -1;

/**
 * The first of the terms the text uses, by where it appears, as the spelling the text used (see `termFound`); ties go to
 * the term listed first. Null when the text uses none of them.
 */
export function firstTermIn(text: string, terms: readonly { term: string }[]): string | null {
  let first: { at: number; spelling: string } | null = null;
  for (const t of terms) {
    const f = termFound(text, t.term);
    if (f && (!first || f.at < first.at)) first = f;
  }
  return first?.spelling ?? null;
}
