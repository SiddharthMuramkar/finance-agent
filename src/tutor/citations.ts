import { passageIdOf } from "@/library/passage";

/**
 * Citations in the Tutor's replies. search_library hands Claude each Library passage as a
 * `search_result` block with citations on, so a reply's text comes back split into blocks, and a
 * block that rests on a passage carries citations naming the passage view (/passages/<id>) and the
 * sentences (block range) it drew on. Code turns those into what the Learner sees: a numbered link
 * after each cited claim, to the exact sentences in the passage view, and one folded list of the
 * reply's sources at its end (see src/tutor/sources.ts). The stored reply is never changed; this is
 * worked out the same way while it streams and when it is read back, so the two always match.
 */

/** The part of a citation this needs; only `search_result_location` citations of a Library passage count. */
export type Citation = { type: string; source?: string; title?: string | null; start_block_index?: number; end_block_index?: number };

const FENCE = "```";

/** Shown in the folded sources instead of the heading of a passage the as-of rule hides now. */
export const HIDDEN_SOURCE_TITLE = "Library passage (hidden until the reveal)";

/** One line of a reply's folded sources. `n` is the number its citation markers carry; null for a source no marker points to (Case Data). */
export type SourceEntry = { n: number | null; title: string; href: string; credit: string | null };

/** The language of the Markdown fence that carries a reply's folded sources, drawn by the reply renderer as a small "N sources" line. */
export const SOURCES_FENCE = "sources";

/** A reply's folded sources as the text that ends it; empty when there are none. */
export function foldText(entries: SourceEntry[]): string {
  if (!entries.length) return "";
  // A backtick in a title could end the fence early.
  return `\n\n${FENCE}${SOURCES_FENCE}\n${JSON.stringify(entries).replace(/`/g, "\\u0060")}\n${FENCE}`;
}

/** The entries inside a sources fence; none if it is not what `foldText` wrote. */
export function parseFold(code: string): SourceEntry[] {
  try {
    const v: unknown = JSON.parse(code);
    if (!Array.isArray(v)) return [];
    return v.filter((e): e is SourceEntry => typeof e?.title === "string" && typeof e?.href === "string");
  } catch {
    return [];
  }
}

/**
 * One reply's citation marks: fed its text and citations in order, it gives the markers to show and,
 * at the end, the passages to list. One of these serves the whole reply (every loop step of the turn),
 * so a number never means two different passages.
 */
export class CitationMarks {
  private text = "";
  /** Where the current block's text starts. */
  private blockStart = 0;
  private passages: { id: number; source: string; title: string }[] = [];

  /** Records shown text (a streamed delta or a whole block) and gives it back. */
  add(text: string): string {
    this.text += text;
    return text;
  }

  /** Starts a new loop step's text: a widget fence cannot run from one step into the next. */
  newStep(): void {
    this.blockStart = this.text.length;
  }

  /**
   * The markers to show after a text block with these citations: one numbered link per cited
   * passage range. Called at the end of every block. None for a block that is in or touches a
   * widget block, where a link would break the widget's code.
   */
  markers(citations: Citation[] | null | undefined): string {
    const before = this.text.slice(0, this.blockStart);
    const touchesWidget = before.split(FENCE).length % 2 === 0 || this.text.slice(this.blockStart).includes(FENCE);
    this.blockStart = this.text.length;
    if (touchesWidget || !citations?.length) return "";
    let out = "";
    for (const c of citations) {
      const id = c.type === "search_result_location" && c.source ? passageIdOf(c.source) : null;
      if (id === null || !c.source) continue;
      let n = this.passages.findIndex((p) => p.source === c.source) + 1;
      if (!n) n = this.passages.push({ id, source: c.source, title: c.title || "Library passage" });
      out += `[${n}](${c.source}?blocks=${c.start_block_index}-${c.end_block_index})`;
    }
    this.add(out);
    this.blockStart = this.text.length;
    return out;
  }

  /** The IDs of the passages cited so far, for looking up their credit and which the as-of rule hides. */
  cited(): number[] {
    return this.passages.map((p) => p.id);
  }

  /**
   * The passages the reply cited, numbered as in its markers. A passage in `hidden` (one the as-of
   * rule hides now) is listed without its heading, which could tell a Case's ending, and without credit.
   */
  entries(credits: ReadonlyMap<number, string>, hidden: ReadonlySet<number> = new Set()): SourceEntry[] {
    return this.passages.map((p, i) => ({
      n: i + 1,
      title: hidden.has(p.id) ? HIDDEN_SOURCE_TITLE : p.title,
      href: p.source,
      credit: hidden.has(p.id) ? null : (credits.get(p.id) ?? null),
    }));
  }
}

type Block = { type?: string; text?: string; citations?: Citation[] | null };

/**
 * One stored Tutor message as the Learner sees it: its text with citation markers. The reply's sources
 * are not part of it; they follow the whole reply (see `foldText`), numbered by the shared `marks`.
 */
export function displayText(content: unknown, marks: CitationMarks = new CitationMarks()): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  marks.newStep();
  let out = "";
  for (const b of content as Block[]) {
    if (b?.type !== "text" || typeof b.text !== "string") continue;
    out += marks.add(b.text) + marks.markers(b.citations);
  }
  return out;
}

/** The Library passage IDs cited in these stored messages' contents, for asking which the as-of rule hides. */
export function citedPassageIds(contents: unknown[]): number[] {
  const ids = new Set<number>();
  for (const content of contents) {
    if (!Array.isArray(content)) continue;
    for (const b of content as Block[]) {
      for (const c of b?.citations ?? []) {
        const id = c.type === "search_result_location" && c.source ? passageIdOf(c.source) : null;
        if (id !== null) ids.add(id);
      }
    }
  }
  return [...ids];
}
