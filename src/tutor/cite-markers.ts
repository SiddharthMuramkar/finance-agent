import { passageIdOf, passagePath } from "@/library/passage";
import type { Citation } from "./citations";

/**
 * Citation markers: how the Tutor's replies cite Library passages now. OpenAI has no citations for what a function
 * returns, so search_library shows the model each passage as `Passage <id>: <heading>`, its credit header, then one
 * numbered sentence per line (`§1 …`, `§2 …`; sentence n is the search result's block n, block 0 being the header).
 * The model writes a marker straight after a claim that rests on a passage: `⟦<id>:<from>-<to>⟧` for sentences from..to,
 * or `⟦<id>:<n>⟧` for one. Code takes the markers out of the text and turns each into the citation the app has always
 * stored (citations.ts), so a reply is shown, stored and read back exactly as before, with the cited text in its own
 * block. Pure and dependency-free (beyond the passage path helpers): citations.ts, which uses it, ships to the browser.
 *
 * The grammar is read tolerantly: spaces anywhere, an en or em dash for the hyphen, a leading `p` or `passage` before
 * the id, a `§` before either number, and several references in one marker separated by `;` or `,` (a reference
 * without an id, `⟦12:2, 5⟧`, takes the one before it). Anything else between the brackets is not a marker and stays
 * as text.
 *
 * How a reply's text is cut into blocks (segments):
 * - A marker ends the text before it, which takes the marker's citations. Markers that follow it (with only spaces
 *   between) add to the same block. Spaces and line breaks just before such a marker are dropped, so `claim ⟦1:2⟧`
 *   shows as `claim` with its link straight after, the way cited blocks always looked.
 * - A paragraph break (a run of white space holding two line breaks) also ends a block; the break starts the next one.
 * - A ``` fence line opens a fenced block (a Widget) that runs to the next fence line; it is one block, never cited,
 *   and a marker inside it is just text. The text before it is its own block, so its citation links still show.
 * - A block with no text never carries citations: a marker with nothing before it in its block (the reply's start,
 *   straight after a paragraph break or a fence) is dropped, as is a passage id the reply's searches never returned.
 *   A dropped marker is just taken out: the text around it reads as if it had never been written.
 * - A marker is held back while it is still being written and shown as text once it proves not to be one.
 * The incremental splitter gives exactly the segments the batch one does, however the text arrives in pieces.
 */

export const MARKER_OPEN = "⟦";
export const MARKER_CLOSE = "⟧";
const FENCE = "```";
/** The longest a marker's body may be; a longer bracket is text. */
const MAX_MARKER = 120;

/** A passage a marker may cite: its heading, and how many sentences it has (to keep a range inside it). */
export type CitedPassage = { title: string; sentences?: number };

/** Finds a passage the reply's searches returned, by id; undefined for any other id. */
export type PassageResolver = (id: number) => CitedPassage | undefined;

/** A piece of a reply's text and the citations it rests on (none for most). */
export type CitedSegment = { text: string; citations: Citation[] };

/** One reference in a marker: a passage id and the sentences cited, from..to inclusive, counted from 1. */
export type MarkerRef = { id: number; from: number; to: number };

const REF = /^(?:(?:passage|p)\s*\.?\s*)?(\d+)\s*:\s*(.+)$/i;
const RANGE = /^§?\s*(\d+)(?:\s*[-–—]\s*§?\s*(\d+))?$/;

/** The references in a marker's body (between the brackets), or null when it is not a marker. */
export function parseMarker(body: string): MarkerRef[] | null {
  const refs: MarkerRef[] = [];
  let id: number | null = null;
  for (const part of body.split(/[;,]/)) {
    let range = part.trim();
    const named = REF.exec(range);
    if (named) {
      id = Number(named[1]);
      range = named[2].trim();
    }
    const r = RANGE.exec(range);
    if (!r || id === null) return null;
    const a = Number(r[1]);
    const b = r[2] === undefined ? a : Number(r[2]);
    refs.push({ id, from: Math.min(a, b), to: Math.max(a, b) });
  }
  return refs.length ? refs : null;
}

/** A marker for sentences from..to of a passage, as the model is asked to write it. */
export function markerFor(id: number, from: number, to: number = from): string {
  return to > from ? `${MARKER_OPEN}${id}:${from}-${to}${MARKER_CLOSE}` : `${MARKER_OPEN}${id}:${from}${MARKER_CLOSE}`;
}

/**
 * The stored citation for one reference: sentences from..to are the search result's blocks from..to, and the range is
 * end-exclusive (`end_block_index` = to + 1), as the passage view's `?blocks=` reads it. Undefined for a passage the
 * resolver does not know, or a range wholly outside it; a range running past its last sentence is cut there.
 */
export function citationOf(ref: MarkerRef, resolve: PassageResolver): Citation | undefined {
  const passage = resolve(ref.id);
  if (!passage) return undefined;
  const from = Math.max(ref.from, 1);
  const to = passage.sentences === undefined ? ref.to : Math.min(ref.to, passage.sentences);
  if (to < from) return undefined;
  return { type: "search_result_location", source: passagePath(ref.id), title: passage.title, start_block_index: from, end_block_index: to + 1 };
}

const sameCitation = (a: Citation, b: Citation) => a.source === b.source && a.start_block_index === b.start_block_index && a.end_block_index === b.end_block_index;
const isParagraphBreak = (ws: string) => (ws.match(/\n/g)?.length ?? 0) >= 2;

/**
 * Cuts a reply's text into cited segments as it streams: `push` each delta and take the segments it finished; `end`
 * flushes the rest. Whatever the pieces, the segments are the same as `splitCited` gives for the whole text.
 */
export class CitationSplitter {
  /** Text not yet decided (a marker or fence still being written). */
  private buf = "";
  /** White space held until what follows says where it goes. */
  private ws = "";
  private cur: CitedSegment = { text: "", citations: [] };
  /** The current segment has taken a marker's citations: the next text starts a new one. */
  private closing = false;
  /** Inside a ``` fence: its text so far, from the white space before its opening line. */
  private fence: string | null = null;
  /** The reply's visible text since its last line break is blank (or there is none yet): a fence opens only at a line start. */
  private lineBlank = true;
  private done: CitedSegment[] = [];

  constructor(private readonly resolve: PassageResolver) {}

  /** Adds streamed text; returns the segments it finished. */
  push(delta: string): CitedSegment[] {
    this.buf += delta;
    this.scan(false);
    return this.take();
  }

  /** The text has ended: returns the segments still open. */
  end(): CitedSegment[] {
    this.scan(true);
    if (this.fence !== null) {
      // A fence never closed runs to the end.
      this.emit({ text: this.fence, citations: [] });
      this.fence = null;
    }
    const ws = this.ws;
    this.ws = "";
    if (ws && this.closing) {
      this.flush();
      this.cur.text = ws;
    } else this.cur.text += ws;
    this.flush();
    return this.take();
  }

  private take(): CitedSegment[] {
    const out = this.done;
    this.done = [];
    return out;
  }

  /** Consumes as much of the buffer as can be decided now; at the end (`final`) all of it. */
  private scan(final: boolean) {
    while (this.buf) {
      if (this.fence !== null) {
        if (!this.scanFence(final)) return;
        continue;
      }
      const c = this.buf[0];
      if (/\s/.test(c)) {
        const run = /^\s+/.exec(this.buf)![0];
        this.ws += run;
        this.buf = this.buf.slice(run.length);
        continue;
      }
      if (c === MARKER_OPEN) {
        if (!this.scanMarker(final)) return;
        continue;
      }
      if (c === "`" && this.atLineStart()) {
        if (this.buf.startsWith(FENCE)) {
          this.openFence();
          continue;
        }
        // "`" or "``" may still become a fence.
        if (!final && FENCE.startsWith(this.buf)) return;
      }
      // Plain text runs to the next white space or marker; only a run's first character can be at a line start.
      const run = /^[^\s⟦]+/.exec(this.buf)![0];
      this.text(run);
      this.buf = this.buf.slice(run.length);
    }
  }

  /** A marker at the buffer's start: taken out, shown as text, or (false) still being written. */
  private scanMarker(final: boolean): boolean {
    for (let i = 1; i < this.buf.length; i++) {
      const ch = this.buf[i];
      if (ch === MARKER_CLOSE) {
        const refs = parseMarker(this.buf.slice(1, i));
        if (!refs) return this.literalOpen();
        this.buf = this.buf.slice(i + 1);
        this.marker(refs.flatMap((r) => citationOf(r, this.resolve) ?? []));
        return true;
      }
      if (ch === "\n" || ch === MARKER_OPEN || i > MAX_MARKER) return this.literalOpen();
    }
    return final ? this.literalOpen() : false;
  }

  /** The opening bracket is not a marker's: it is text, and what follows it is read on. */
  private literalOpen(): true {
    this.buf = this.buf.slice(1);
    this.text(MARKER_OPEN);
    return true;
  }

  /** Whether what comes next starts a line of the visible text (markers taken out). */
  private atLineStart(): boolean {
    const nl = this.ws.lastIndexOf("\n");
    return /^[ \t]*$/.test(this.ws.slice(nl + 1)) && (nl >= 0 || this.lineBlank);
  }

  /** Notes text made visible, for `atLineStart`. */
  private seen(t: string) {
    const nl = t.lastIndexOf("\n");
    const blank = /^[ \t]*$/.test(t.slice(nl + 1));
    this.lineBlank = nl >= 0 ? blank : this.lineBlank && blank;
  }

  private text(t: string) {
    const ws = this.ws;
    this.ws = "";
    this.seen(ws + t);
    if (this.closing || isParagraphBreak(ws)) {
      this.flush();
      this.cur.text = ws + t;
    } else this.cur.text += ws + t;
  }

  /**
   * A marker attaches its citations to the text before it in its block, dropping the white space between. One that
   * cites nothing (no text before it, a paragraph break between, no passage it names was returned) is taken out and
   * changes nothing else: the white space before it stays, and the text reads as if it had never been written.
   */
  private marker(citations: Citation[]) {
    if (isParagraphBreak(this.ws) || !this.cur.text.trim() || !citations.length) return;
    this.ws = "";
    for (const c of citations) if (!this.cur.citations.some((d) => sameCitation(c, d))) this.cur.citations.push(c);
    this.closing = true;
  }

  private openFence() {
    const ws = this.ws;
    this.ws = "";
    this.flush();
    this.fence = ws + FENCE;
    this.buf = this.buf.slice(FENCE.length);
  }

  /** Inside a fence: reads to its closing fence line, or (false) waits for more text to tell. */
  private scanFence(final: boolean): boolean {
    while (this.buf) {
      if (this.fence!.endsWith("\n")) {
        const indent = /^[ \t]*/.exec(this.buf)![0];
        const rest = this.buf.slice(indent.length);
        if (rest.startsWith(FENCE)) {
          this.seen(this.fence + indent + FENCE);
          this.emit({ text: this.fence + indent + FENCE, citations: [] });
          this.fence = null;
          this.buf = rest.slice(FENCE.length);
          return true;
        }
        if (!final && FENCE.startsWith(rest)) return false;
      }
      const nl = this.buf.indexOf("\n");
      const line = nl < 0 ? this.buf : this.buf.slice(0, nl + 1);
      this.fence += line;
      this.buf = this.buf.slice(line.length);
    }
    return true;
  }

  /** Ends the current segment (kept if it has text) and starts an empty one. */
  private flush() {
    this.emit(this.cur);
    this.cur = { text: "", citations: [] };
    this.closing = false;
  }

  private emit(segment: CitedSegment) {
    if (!segment.text) return;
    this.done.push(segment.text.trim() ? segment : { text: segment.text, citations: [] });
  }
}

/** A reply's whole text cut into cited segments (see the rules above). */
export function splitCited(text: string, resolve: PassageResolver): CitedSegment[] {
  const splitter = new CitationSplitter(resolve);
  return [...splitter.push(text), ...splitter.end()];
}

/**
 * A stored text block written back with its citations as markers, as the model wrote it: for a step sent rebuilt from
 * its blocks (one a filter edited). Only Library passage citations become markers. Splitting the rendered blocks
 * gives them back, unless the text they were split from held a marker that cited nothing: it is gone from the blocks,
 * and taking it out can join the text around it into something else (a fence, say).
 */
export function renderMarkers(text: string, citations: Citation[] | null | undefined): string {
  let out = text;
  for (const c of citations ?? []) {
    const id = c.type === "search_result_location" && c.source ? passageIdOf(c.source) : null;
    if (id === null || typeof c.start_block_index !== "number") continue;
    const from = c.start_block_index;
    const to = typeof c.end_block_index === "number" ? Math.max(from, c.end_block_index - 1) : from;
    out += markerFor(id, from, to);
  }
  return out;
}
