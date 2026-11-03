/** The Topic complete card's kind and data, with no server imports, so the browser can draw it (see topic-complete.ts). */

/** The kind of a Topic complete card. */
export const TOPIC_COMPLETE = "topic_complete";

/** The card's data: the passed Topic, its principle's first sentence, and What comes next's label when it was stored (null: every Topic passed). */
export type TopicCompleteData = { topicId: string; title: string; principle: string; next: string | null };

/** The principle in one or two lines: its first sentence. */
export function principleLine(principle: string): string {
  const flat = principle.replace(/\s+/g, " ").trim();
  return flat.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? flat;
}
