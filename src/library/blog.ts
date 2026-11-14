import { Parser } from "htmlparser2";
import { z } from "zod";
import { originalPictureUrl, readingLines, type PictureReadings } from "./pictures.ts";
import type { SourceDocument } from "./prepare.ts";

// Damodaran's blog (Musings on Markets) as the Library reads it: Blogger's JSON feed in, documents
// out. Packages and type-only imports, so the laptop backfill command runs this file with Node's
// type stripping and the weekly refresh (src/library/refresh.ts) uses the same reader from the app.

const BLOCK = new Set(["p", "div", "br", "li", "ul", "ol", "tr", "table", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article", "pre", "hr"]);
/** Tags whose contents never reach the text: scripts and styles, and embedded players (video iframes, objects, embeds) whose fallback text is not the post's. */
const SKIP = new Set(["script", "style", "noscript", "svg", "nav", "footer", "header", "form", "button", "iframe", "object", "video", "audio"]);
const HEADING = /^h[1-6]$/;

export type Block = { kind: "h" | "p"; text: string };
export type Section = { heading: string; paragraphs: string[] };

const squash = (text: string) => text.split(/\s+/).filter(Boolean).join(" ");

/** What to do with the pictures in a post: `onPicture` hears each original-size address in order; `readings` supplies the text read from them, placed where the picture is. */
export type PictureOptions = { onPicture?: (url: string) => void; readings?: PictureReadings };

/** Icons and tracking pixels: a picture declared smaller than 100 pixels either way. */
const tiny = (attrs: Record<string, string>) => [attrs.width, attrs.height].some((v) => v !== undefined && Number(v) > 0 && Number(v) < 100);

/**
 * Turns HTML into blocks, `h` for headings and `p` for everything else. Block tags end a block;
 * a table row becomes one block "a | b | c"; a list item starts with a bullet. Same rules, tag
 * for tag, as the Python reader in scripts/library/sources.py (a parity test holds them together).
 */
export function htmlBlocks(markup: string, pictures: PictureOptions = {}): Block[] {
  const blocks: Block[] = [];
  /** Picture paragraphs waiting for the end of a table row: a picture in a cell is placed just before its row. */
  let waiting: Block[] = [];
  let buf: string[] = [];
  let skip = 0;
  let heading = 0;
  let cells: string[] | null = null;
  let cell: string[] | null = null;

  const flush = () => {
    const text = squash(buf.join(""));
    buf = [];
    if (text) blocks.push({ kind: heading ? "h" : "p", text });
  };

  const parser = new Parser(
    {
      onopentag(tag, attrs) {
        if (tag === "img" && !skip) {
          const url = originalPictureUrl(attrs.src ?? "");
          if (url && !tiny(attrs)) {
            pictures.onPicture?.(url);
            const lines = (readingLines(pictures.readings, url) ?? []).map((text): Block => ({ kind: "p", text }));
            if (cells) waiting.push(...lines);
            else {
              flush();
              blocks.push(...lines);
            }
          }
        }
        if (SKIP.has(tag)) skip++;
        else if (tag === "td" || tag === "th") cell = [];
        else if (tag === "tr") {
          flush();
          cells = [];
        } else if (BLOCK.has(tag)) {
          flush();
          if (HEADING.test(tag)) heading = Number(tag[1]);
        }
        if (tag === "li") buf.push("• ");
      },
      onclosetag(tag) {
        if (SKIP.has(tag)) skip = Math.max(0, skip - 1);
        else if ((tag === "td" || tag === "th") && cells && cell) {
          cells.push(squash((cell as string[]).join("")));
          cell = null;
        } else if (tag === "tr" && cells) {
          const row = cells.filter(Boolean).join(" | ");
          cells = null;
          blocks.push(...waiting);
          waiting = [];
          if (row) blocks.push({ kind: "p", text: row });
        } else if (BLOCK.has(tag)) {
          flush();
          if (HEADING.test(tag)) heading = 0;
        }
      },
      ontext(data) {
        if (skip) return;
        (cell ?? buf).push(data);
      },
    },
    { decodeEntities: true, recognizeSelfClosing: true },
  );
  parser.write(markup);
  parser.end();
  flush();
  return blocks;
}

/** Groups blocks into sections: a heading block starts a new section. */
export function sectionsFromBlocks(blocks: Block[], firstHeading = ""): Section[] {
  const sections: Section[] = [];
  let heading = firstHeading;
  let paragraphs: string[] = [];
  for (const block of blocks) {
    if (block.kind === "h") {
      if (paragraphs.length) sections.push({ heading, paragraphs });
      heading = block.text;
      paragraphs = [];
    } else paragraphs.push(block.text);
  }
  if (paragraphs.length) sections.push({ heading, paragraphs });
  return sections;
}

const text$ = z.object({ $t: z.string() });
const feedEntry = z.object({
  id: text$,
  title: text$,
  published: text$,
  updated: text$.optional(),
  content: text$.optional(),
  link: z.array(z.object({ rel: z.string(), href: z.string() })).default([]),
});

/** One page of Blogger's JSON feed (`alt=json`), as far as the reader needs it. */
export const bloggerFeed = z.object({
  feed: z.object({
    entry: z.array(feedEntry).default([]),
    openSearch$totalResults: text$,
  }),
});

/** A blog post as a Library document, with the published and updated times Blogger gives (for dating later edits). */
export type BlogDocument = SourceDocument & { publishedAt: string; updatedAt: string | null };

/** The posts of one feed page that hold text. A post with no link or no text is left out. */
export function blogDocuments(page: unknown, { readings }: { readings?: PictureReadings } = {}): BlogDocument[] {
  const docs: BlogDocument[] = [];
  for (const e of bloggerFeed.parse(page).feed.entry) {
    const url = e.link.find((l) => l.rel === "alternate")?.href;
    if (!url) continue;
    const sections = sectionsFromBlocks(htmlBlocks(e.content?.$t ?? "", { readings }));
    if (!sections.length) continue;
    docs.push({
      ref: `post-${e.id.$t.split("post-").pop()}`,
      title: e.title.$t || "Untitled post",
      url,
      publishedOn: e.published.$t.slice(0, 10),
      publishedAt: e.published.$t,
      updatedAt: e.updated?.$t ?? null,
      sections,
    });
  }
  return docs;
}

/** How many posts the feed holds in all, so a reader knows when to stop paging. */
export const feedTotal = (page: unknown): number => Number(bloggerFeed.parse(page).feed.openSearch$totalResults.$t);
/** How many posts this feed page holds. */
export const feedCount = (page: unknown): number => bloggerFeed.parse(page).feed.entry.length;

/** Every picture of the posts on one feed page, in reading order: the post it is in and its original-size address. */
export function blogPictures(page: unknown): { ref: string; url: string }[] {
  const found: { ref: string; url: string }[] = [];
  for (const e of bloggerFeed.parse(page).feed.entry) {
    const ref = `post-${e.id.$t.split("post-").pop()}`;
    htmlBlocks(e.content?.$t ?? "", { onPicture: (url) => found.push({ ref, url }) });
  }
  return found;
}
