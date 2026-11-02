/**
 * How a Library passage is cut into citable pieces. Claude cites whole text blocks, so each passage
 * goes to the Tutor as one block per sentence, and a citation names the exact sentences it rests on.
 * The passage view cuts the stored text the same way, so a citation's block numbers find the same sentences.
 */

/** The passage's sentences, in order, each with its trailing space; joined they give the text back unchanged. */
export function passageSentences(text: string): string[] {
  // A sentence ends at . ! or ? (and any closing quote or bracket) followed by white space, which it keeps.
  const out = text.split(/(?<=[.!?]["'’”)\]]*\s+)(?=\S)/).filter((s) => s.length > 0);
  return out.length ? out : [text];
}

/** The passage path the search result names as its source: the Learner's passage view. */
export function passagePath(id: number): string {
  return `/passages/${id}`;
}

/** The passage ID in a search result's source, or null when the source is not a Library passage. */
export function passageIdOf(source: string): number | null {
  const m = /^\/passages\/(\d+)$/.exec(source);
  return m ? Number(m[1]) : null;
}

/** The first `words` words of `text`, with an ellipsis when something was cut. */
export function firstWords(text: string, words: number): { text: string; cut: boolean } {
  const all = text.trim().split(/\s+/).filter(Boolean);
  if (all.length <= words) return { text: text.trim(), cut: false };
  return { text: `${all.slice(0, words).join(" ")} …`, cut: true };
}
