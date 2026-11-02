import { passageIdOf } from "@/library/passage";

/**
 * Citations in the Tutor's replies. search_library hands Claude each Library passage as a
 * `search_result` block with citations on, so a reply's text comes back split into blocks, and a
 * block that rests on a passage carries citations naming the passage view (/passages/<id>) and the
 * sentences (block range) it drew on. Code turns those into what the Learner sees: a numbered link
 * after each cited claim, to the exact sentences in the passage view, and a list of the reply's
 * sources at its end. The stored reply is never changed; this is worked out the same way while it
 * streams and when it is read back, so the two always match.
 */

/** The part of a citation this needs; only `search_result_location` citations of a Library passage count. */
export type Citation = { type: string; source?: string; title?: string | null; start_block_index?: number; end_block_index?: number };

const FENCE = "```";

/** Square brackets would end a Markdown link's text early. */
const linkText = (text: string) => text.replace(/[[\]]/g, (c) => `\\${c}`);

/** One reply's citation marks: fed its text and citations in order, it gives the markers and source list to show. */
export class CitationMarks {
  private text = "";
  /** Where the current block's text starts. */
  private blockStart = 0;
  private passages: { source: string; title: string }[] = [];

  /** Records shown text (a streamed delta or a whole block) and gives it back. */
  add(text: string): string {
    this.text += text;
    return text;
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
      if (c.type !== "search_result_location" || !c.source || passageIdOf(c.source) === null) continue;
      let n = this.passages.findIndex((p) => p.source === c.source) + 1;
      if (!n) n = this.passages.push({ source: c.source, title: c.title || "Library passage" });
      out += `[${n}](${c.source}?blocks=${c.start_block_index}-${c.end_block_index})`;
    }
    this.add(out);
    this.blockStart = this.text.length;
    return out;
  }

  /** The list of passages the reply cited, numbered as in its markers, to show at its end; empty when none. */
  sources(): string {
    if (!this.passages.length) return "";
    return this.add(`\n\nSources:\n\n${this.passages.map((p, i) => `${i + 1}. [${linkText(p.title)}](${p.source})\n`).join("")}`);
  }
}

type Block = { type?: string; text?: string; citations?: Citation[] | null };

/** A stored Tutor reply as the Learner sees it: its text with citation markers, then its sources. */
export function displayText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const marks = new CitationMarks();
  let out = "";
  for (const b of content as Block[]) {
    if (b?.type !== "text" || typeof b.text !== "string") continue;
    out += marks.add(b.text) + marks.markers(b.citations);
  }
  return out + marks.sources();
}
