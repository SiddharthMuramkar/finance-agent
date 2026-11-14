import type { SavedStory } from "./value-levers-model";

// Saving a Learner's own Valuation story to the Notebook (spec 2026-11-12, C4 Spine Topic 15): Value levers in all open
// mode hands its one-page note (storyNote) to SaveStoryContext, and the Topic flow (conversation.tsx) posts it here as one
// of the Learner's own lines on the Topic's note, through the existing POST /api/notes (addLine in src/learner/notes.ts).
// A second Save replaces that same line (PATCH /api/notes with its id) instead of adding another, so the Notebook holds
// one current story, not a pile. No new table or kind: the note is the title and the lines, one per row.

/** The story as the text of one note line: its title, then each line under it. */
export function storyNoteText(story: SavedStory): string {
  return [story.title, ...story.lines].join("\n");
}

/** The result of a save: the stored line's id to replace next time, or null when nothing was stored. */
export type SaveResult = { id: number } | null;

/**
 * Saves the story to the Topic's note. With no `existingId` it adds a line (POST) and returns its id; with one it replaces
 * that line (PATCH). On any failure it returns null and throws nothing, and a failed replace falls back to a fresh add so
 * the Learner's story is not lost (e.g. the Learner deleted the old line in the Notebook).
 */
export async function postStoryToNotebook(topicId: string, story: SavedStory, existingId?: number, send: typeof fetch = fetch): Promise<SaveResult> {
  const text = storyNoteText(story);
  if (existingId !== undefined) {
    const patched = await send("/api/notes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: existingId, text }) }).catch(() => null);
    if (patched?.ok) return { id: existingId };
    // The line is gone (deleted) or the edit failed: add a fresh one below.
  }
  const response = await send("/api/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topicId, text }) }).catch(() => null);
  if (!response?.ok) return null;
  const line = (await response.json().catch(() => null)) as { id?: number } | null;
  return typeof line?.id === "number" ? { id: line.id } : { id: -1 };
}
