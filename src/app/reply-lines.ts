import { TOPIC_START } from "@/course/topic-start";
import { withoutOpenWidget } from "@/tutor/open-widget";
import { STOPPED } from "@/tutor/session-item-kinds";
import type { TurnRef } from "@/tutor/transcript";
import type { TurnUsage } from "@/tutor/usage";
import { WIDGET_SHOWN } from "@/widgets/shown-widget";
import type { SessionItemData } from "./session-item-view";
import type { ThreadLine } from "./thread";

/**
 * Where a streamed reply's lines go in the thread on screen, as plain functions (no React). The turn stream
 * (turn-stream.ts) hands their results to setMessages as its events arrive. They draw what the server's loadThread
 * (src/tutor/transcript.ts) draws from the saved Session, so a reload shows the same thread: a Session item that falls
 * inside a reply cuts it into parts, every part but the last has `more`, and the reply's Choices stand after it.
 */

/**
 * Where one reply has got to: the id of its first line, the part text streams into now, and every part id so far.
 * Each change works out the next cursor at once, so lines placed in one burst of events (one render) still land in
 * the part that was current when each event arrived.
 */
export type ReplyCursor = { readonly first: string; readonly current: string; readonly parts: readonly string[] };

/** A change to the lines on screen, for setMessages. */
export type LinesUpdate = (lines: ThreadLine[]) => ThreadLine[];

/** A cursor change and the lines it draws. */
export type Placed = { cursor: ReplyCursor; update: LinesUpdate };

/** A new reply's cursor: one part, its first line. */
export const replyCursor = (first: string): ReplyCursor => ({ first, current: first, parts: [first] });

/** True for every line the reply drew: its parts and the items between them. */
export const inReply = (c: ReplyCursor) => (x: ThreadLine) => x.id === c.first || x.id.startsWith(`${c.first}-`);

/**
 * The lines as a turn starts. With the Learner's message (`user`): it and an empty reply under it. A resume carries on
 * the reply on screen (renamed to `first`), or starts one after the Learner's last message. Anything else (a Next,
 * Finish this reply, a widget report, the opener, a drill) is a new turn with no Learner bubble: its reply starts below
 * what is on screen.
 */
export function startReply(lines: ThreadLine[], first: string, start: { user?: { id: string; text: string }; resume?: boolean }): ThreadLine[] {
  const reply: ThreadLine = { id: first, role: "assistant", text: "" };
  if (start.user) return [...lines, { id: start.user.id, role: "user", text: start.user.text }, reply];
  const last = lines.at(-1);
  if (start.resume && last?.role === "assistant") return [...lines.slice(0, -1), { ...last, id: first }];
  return [...lines, reply];
}

/** The reply part `id` with its text changed by `f`: streamed words added, an unfinished Widget cut. */
export const editText = (lines: ThreadLine[], id: string, f: (text: string) => string): ThreadLine[] =>
  lines.map((x) => (x.id === id && x.role !== "item" ? { ...x, text: f(x.text) } : x));

/** Streamed words, added to the part the reply has got to. */
export const addText = (c: ReplyCursor, text: string): LinesUpdate => (lines) => editText(lines, c.current, (t) => t + text);

/**
 * Draws a Session item where the reply has got to: before the reply if it has no text yet (the reply carries on after
 * it), else between two parts of it, and the words that follow go into the new part. `after`: straight after the reply
 * part, which carries on unsplit (the reply's Choices, D3a; the Stopped note).
 */
export function placeItem(c: ReplyCursor, item: SessionItemData, after = false): Placed {
  const at = c.current;
  const part = `${c.first}-${c.parts.length}`;
  const itemLine: ThreadLine = { id: `${part}-item`, role: "item", ...item };
  const parts = [...c.parts, part];
  if (after) {
    return {
      cursor: { ...c, parts },
      update: (lines) => {
        const i = lines.findIndex((x) => x.id === at);
        return i < 0 ? [...lines, itemLine] : [...lines.slice(0, i + 1), itemLine, ...lines.slice(i + 1)];
      },
    };
  }
  return {
    cursor: { first: c.first, current: part, parts },
    update: (lines) => {
      const i = lines.findIndex((x) => x.id === at);
      const current = lines[i];
      if (!current || current.role === "item") return [...lines, itemLine, { id: part, role: "assistant", text: "" }];
      // Nothing written yet: the item goes before the reply, which carries on as the new part.
      if (!current.text) return [...lines.slice(0, i), itemLine, { ...current, id: part }, ...lines.slice(i + 1)];
      return [...lines.slice(0, i), { ...current, more: true }, itemLine, { id: part, role: "assistant", text: "" }, ...lines.slice(i + 1)];
    },
  };
}

/**
 * A replay (a resume, or a refusal) sends the whole reply's saved text: it replaces every part of the reply and the items
 * between them, as one part again (a reload draws those items again from what was saved). Parts of this reply the page
 * loaded before a resume go too, with their items; never the Topic Start card, which opens the conversation and is drawn
 * by the page, not saved with the reply.
 */
export function replayReply(c: ReplyCursor, text: string): Placed {
  const ours = inReply(c);
  return {
    cursor: replyCursor(c.first),
    update: (lines) => {
      const first = lines.findIndex(ours);
      if (first < 0) return lines;
      let start = first;
      const earlierPart = (x: ThreadLine) => (x.role === "item" && x.kind !== TOPIC_START) || (x.role === "assistant" && x.more === true);
      while (start > 0 && earlierPart(lines[start - 1])) start--;
      return [...lines.slice(0, start), { id: c.first, role: "assistant", text }, ...lines.slice(first).filter((x) => !ours(x))];
    },
  };
}

/**
 * The Learner stopped the reply: the reply in progress is dropped (ADR 0008, kept for streamed replies by ADR 0017), so
 * the words a streamed own-question reply had shown go too, as a reload would show it, and only the Stopped note stays
 * where the reply ended. Items the turn showed (a step divider, a Widget) stay, as they are saved.
 */
export function stopReply(c: ReplyCursor): Placed {
  const ours = inReply(c);
  const note = placeItem(c, { kind: STOPPED, data: {} }, true);
  return {
    cursor: note.cursor,
    update: (lines) => {
      // The note goes after the part the reply ended in; then every part of the reply's words is taken off.
      const placed = note.update(editText(lines, c.current, withoutOpenWidget));
      return placed.filter((x) => !(ours(x) && x.role === "assistant"));
    },
  };
}

/**
 * The finished reply: its usage on the part it ended in, and its place in the Session on every part (Save to Notebook).
 * A Widget code showed in this turn is the reply's too (reply-items.ts), a Next's step Widget drawn before it among them,
 * so it gets the ref as well.
 */
export const finishReply = (c: ReplyCursor, done: { usage?: TurnUsage; ref?: TurnRef }): LinesUpdate => (lines) =>
  lines.map((x) => {
    if (x.role === "item") return done.ref && x.kind === WIDGET_SHOWN && inReply(c)(x) ? { ...x, ref: done.ref } : x;
    const usage = done.usage && x.id === c.current;
    const ref = done.ref && x.role === "assistant" && c.parts.includes(x.id);
    return usage || ref ? { ...x, ...(usage && { usage: done.usage }), ...(ref && { ref: done.ref }) } : x;
  });

/** The turn could not start (another one runs, nothing was saved): its Learner message and empty reply go back off the screen. */
export const takeBack = (c: ReplyCursor, userId: string): LinesUpdate => (lines) => lines.filter((x) => x.id !== userId && x.id !== c.current);
