import { splitReply } from "@/widgets/split";
import { WIDGET_OPENED } from "@/course/written-ahead";
import { WIDGET_SHOWN } from "@/widgets/shown-widget";
import { checkReply, correctionText, countWords, dropSumAsks, fixReply, trimToCap, type ReplyCheckContext, type ReplyDraft, type ReplyProblem, type ReplyWidget } from "./reply-checks";
import { replyCheckContext, type TurnFacts } from "./turn-facts";
import type { StoredItem } from "./session-items";
import type { TurnEvent } from "./turn";
import { widgetValidator } from "./ready-made-widgets";
import { PARAGRAPH, textOf } from "./transcript";
import { REPLY_CHECK_PREFIX } from "./turn-status";

/**
 * The reply gate (spec #229, ticket #239, ADR 0008): code holds the Tutor's whole reply, fixes what it can, checks it
 * (V1 to V7), and gives it one retry while the turn is young; after that it falls back. This module holds the pure
 * part: what the draft is, what it broke, what the retry is told, which rows a rejected reply drops and the trimmed
 * fallback. turn.ts runs the loop around it, and reply-records.ts keeps the record.
 */

/** The one retry runs only while the turn has used less than this, counted from the start of its run. */
export const RETRY_WITHIN_MS = 30_000;

/** The writing indicator's label while code checks the reply, and while its retry runs. */
export const CHECKING_LABEL = "Checking the reply…";

/** The V4 reason for Widget code in a reply (ADR 0009): ready-made Widgets only. */
export const FENCE_IN_ENGINE = "Write no Widget code; call open_widget or show_widget, or teach in words.";

export { REPLY_CHECK_PREFIX };

type Row = { seq: number; role: string; content?: unknown };

/** Code's correction message for the one retry (`retryMessage`). */
const isCorrection = (r: Row) => r.role === "user" && textOf(r.content).startsWith(REPLY_CHECK_PREFIX);

/**
 * The rows of the turn at `turnSeq` that the reply checks rejected, by seq: the one rule for which rows a rejected reply
 * drops (ADR 0008), for the live turn, a resumed turn and the tools alike. A rejected reply drops every assistant row it
 * wrote and the correction message code sent about it. Never a tool result, the Learner's message or the context: a
 * rejected row keeps its tool calls in later requests (`withoutRejected`), because they ran and their effects stand, and
 * OpenAI refuses a function call sent without its output as it refuses an output without its call.
 *
 * It counts the seqs the turn's record holds (`saved`, saved at each rejection); the draft before the turn's correction
 * message, with the correction (the marker, for rows stored before the record was saved as it happened, or with no
 * reply_checks table); and, with `rejecting`, the reply written after that seq (the turn's, or the correction's on the
 * retry), which code is rejecting now.
 */
export function rejectedRows(rows: readonly Row[], turnSeq: number, o: { saved?: Iterable<number>; rejecting?: number } = {}): Set<number> {
  const out = new Set(o.saved);
  const correction = rows.findLast((r) => r.seq > turnSeq && isCorrection(r));
  // A compaction summary is code's, stored after the checks: never part of a reply, so never rejected with one.
  const written = (r: Row, after: number) => r.seq > after && r.role === "assistant" && !isCompactionRow(r);
  for (const r of rows) {
    if (correction && r.seq <= correction.seq && (written(r, turnSeq) || r === correction)) out.add(r.seq);
    if (o.rejecting !== undefined && written(r, o.rejecting)) out.add(r.seq);
  }
  return out;
}

const isCompactionRow = (r: Row) => Array.isArray(r.content) && r.content.some((b) => b?.type === "compaction");

/** The text of the reply written after `fromSeq` (the turn's seq, or the correction's): every loop step's, in order. */
export function replyTextAfter(rows: readonly Row[], fromSeq: number): string {
  return rows
    .filter((r) => r.seq > fromSeq && r.role === "assistant")
    .map((r) => textOf(r.content))
    .filter(Boolean)
    .join(PARAGRAPH);
}

const toolUses = (rows: readonly Row[], fromSeq: number) =>
  rows
    .filter((r) => r.seq > fromSeq && r.role === "assistant" && Array.isArray(r.content))
    .flatMap((r) => (r.content as { type?: string; id?: string; name?: string; input?: { id?: unknown } }[]).filter((b) => b?.type === "tool_use"));

/**
 * The Widgets the draft itself showed: those its own show_widget and open_widget calls stored. Items
 * code stored (a step's own Widget, a Concept card's preset, a Next's) are never the draft's.
 */
export function toolWidgets(rows: readonly Row[], fromSeq: number, items: readonly StoredItem[]): ReplyWidget[] {
  const uses = toolUses(rows, fromSeq);
  const later = items.filter((i) => i.afterSeq >= fromSeq);
  const used = new Set<number>();
  return uses.flatMap((use): ReplyWidget[] => {
    if (use.name === "show_widget") {
      const shown = later.find((i) => i.kind === WIDGET_SHOWN && i.data.id === use.id);
      if (!shown) return [];
      const recipe = typeof shown.data.recipe === "string" && shown.data.recipe ? shown.data.recipe : String(shown.data.title ?? "Widget");
      return [{ kind: "recipe", id: recipe, params: (shown.data.params as Record<string, unknown>) ?? {} }];
    }
    if (use.name === "open_widget" && typeof use.input?.id === "string") {
      const id = use.input.id;
      // Each stored chip answers one call: a refused call (a blocked preset) stored none.
      const opened = later.findIndex((i, k) => i.kind === WIDGET_OPENED && i.data.id === id && !used.has(k));
      if (opened < 0) return [];
      used.add(opened);
      return [{ kind: "written", id }];
    }
    return [];
  });
}

/** The titles of the Widgets the draft's own tool calls put on screen: the retry is told they are there. */
export function widgetsOnScreen(rows: readonly Row[], fromSeq: number, items: readonly StoredItem[]): string[] {
  const ids = new Set(toolUses(rows, fromSeq).flatMap((u) => [u.id, typeof u.input?.id === "string" ? u.input.id : undefined]));
  return items
    .filter((i) => i.afterSeq >= fromSeq && (i.kind === WIDGET_SHOWN || i.kind === WIDGET_OPENED) && ids.has(i.data.id as string))
    .map((i) => String(i.data.title ?? i.data.id));
}

const fenceId = (index: number) => `openui-lang block ${index + 1}`;

export type Judged = {
  /** The draft after the fixes that cost no retry. */
  draft: ReplyDraft;
  /** Whether the fixes changed its text. */
  changed: boolean;
  problems: ReplyProblem[];
  ctx: ReplyCheckContext;
};

/**
 * Fixes the reply, then checks it with the turn's facts. Widgets the draft's tools stored pass V4 (code checked them
 * as it stored them). An openui-lang fence always fails V4: the Tutor writes no Widget code (ADR 0009).
 */
export function judgeReply(
  text: string,
  stored: ReplyWidget[],
  facts: TurnFacts,
  o: { savedRule?: string | null; writtenAhead?: readonly { id: string; code: string }[] } = {},
): Judged {
  const fences = splitReply(text).filter((s) => s.type === "widget");
  const fenceWidgets: ReplyWidget[] = fences.map((_, i) => ({ kind: "recipe", id: fenceId(i) }));
  const reasons = new Map(fenceWidgets.map((w) => [w.id, FENCE_IN_ENGINE]));
  // A Widget a tool stored passes unless it names a written-ahead Widget this Topic lacks or a preset that does not fit.
  const validate = widgetValidator(o.writtenAhead ?? []);
  const ctx = replyCheckContext(facts, { widgetOk: (w) => reasons.get(w.id) ?? (w.kind === "written" && o.writtenAhead ? validate(w) : null) });
  // The Learner's rule saved this turn is held to V5, V6 and V7 like the reply.
  const fixed = { ...fixReply({ text, widgets: [...stored, ...fenceWidgets] }), savedRule: o.savedRule ?? null };
  return { draft: fixed, changed: fixed.text !== text, problems: checkReply(fixed, ctx), ctx };
}

/** The correction message for the one retry: code's prefix, every failed check with its reason, and the Widgets on screen. */
export function retryMessage(j: Judged, onScreen: readonly string[]): string {
  const screen = onScreen.length ? [`Already on screen from your reply: ${onScreen.map((t) => `"${t}"`).join(", ")}. Do not show it again; talk about it.`] : [];
  return [REPLY_CHECK_PREFIX, correctionText(j.problems, j.draft, j.ctx), ...screen].join("\n");
}

/**
 * The fallback with no card: the fixed reply cut at its last full sentence within the cap, its ask kept. When a Widget
 * failed its checks (V4), the reply's openui-lang blocks are left out; when it asked for a sum (V8), that question is.
 */
export function trimmedFallback(text: string, cap: number, dropWidgets = false, dropSums = false): string {
  const withWidgets = dropWidgets
    ? splitReply(text)
        .filter((s) => s.type === "prose")
        .map((s) => (s as { text: string }).text)
        .join("")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
    : text;
  // A sum the reply asked (V8) is never shown: its question goes, and the Choices carry the next move.
  const kept = dropSums ? dropSumAsks(withWidgets) : withWidgets;
  return trimToCap(fixReply({ text: kept, widgets: [] }).text, cap);
}

/** The words of a reply as the checks count them. */
export const replyWords = (text: string) => countWords(text);

/** Held events as the browser gets them: in order, with neighbouring text joined into one text event. */
export function joinedEvents(held: readonly TurnEvent[]): TurnEvent[] {
  const out: TurnEvent[] = [];
  for (const e of held) {
    const last = out.at(-1);
    if (e.type === "text" && last?.type === "text") out[out.length - 1] = { type: "text", text: last.text + e.text };
    else out.push(e);
  }
  return out.filter((e) => e.type !== "text" || e.text);
}
