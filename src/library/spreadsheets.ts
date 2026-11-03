import { Parser } from "htmlparser2";
import * as XLSX from "xlsx";
import type { SourceDocument } from "./prepare";

// The spreadsheets behind Damodaran's blog posts, as the Library reads them. Packages and
// type-only imports, so the laptop command runs this file with Node's type stripping and the weekly
// refresh can import it from the app. Nothing here touches the database.

/** At most this many passages come from one workbook. */
export const MAX_PASSAGES_PER_WORKBOOK = 12;
/** A passage is a chunk of a sheet's rows; the intro sentence and the rows together stay under the 300-word cut. */
const BODY_WORDS = 240;
const CELL_WORDS = 40;
/** Files above this size are not read (a workbook this big is a dataset, not a worked example). */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

const HOSTS = new Set(["www.stern.nyu.edu", "pages.stern.nyu.edu", "people.stern.nyu.edu"]);
/** His yearly datasets and the implied-premium files are left out: they are tables of the whole market, not the worked examples behind a post. */
const EXCLUDED_PATH = /\/(datasets|implprem)\//i;

/** The link in canonical form (https, pages.stern.nyu.edu, a plain ~), or null when it is not one of his .xls/.xlsx files or is a left-out kind. */
export function normaliseSpreadsheetUrl(href: string): string | null {
  const cleaned = href.trim().replace(/^https?:\/\/https?\/\//i, "http://").replace(/%7E/gi, "~");
  let url: URL;
  try {
    url = new URL(cleaned);
  } catch {
    return null;
  }
  if (!HOSTS.has(url.hostname) || !/\.xlsx?$/i.test(url.pathname)) return null;
  if (!/\/~?adamodar\//i.test(url.pathname) || EXCLUDED_PATH.test(url.pathname)) return null;
  url.protocol = "https:";
  url.hostname = "pages.stern.nyu.edu";
  url.pathname = url.pathname.replace(/^\/adamodar\//, "/~adamodar/");
  url.search = "";
  url.hash = "";
  return url.toString();
}

/** The spreadsheets a post's HTML links to, in the order linked, each once. */
export function spreadsheetLinks(html: string): string[] {
  const found: string[] = [];
  const parser = new Parser(
    {
      onopentag(tag, attrs) {
        if (tag !== "a" || !attrs.href) return;
        const url = normaliseSpreadsheetUrl(attrs.href);
        if (url && !found.includes(url)) found.push(url);
      },
    },
    { decodeEntities: true },
  );
  parser.write(html);
  parser.end();
  return found;
}

export type SheetText = { name: string; lines: string[] };

const words = (text: string) => text.split(/\s+/).filter(Boolean);

/**
 * The visible sheets of a workbook as lines of text, one line per non-empty row ("cell | cell").
 * Values are the ones Excel saved in the file (SheetJS does not recalculate), shown as formatted
 * there. Hidden and very hidden sheets are skipped.
 */
export function readWorkbook(bytes: Uint8Array): { sheets: SheetText[]; hiddenSkipped: number } {
  const wb = XLSX.read(bytes, { type: "array", cellFormula: false, cellHTML: false, cellStyles: false });
  const sheets: SheetText[] = [];
  let hiddenSkipped = 0;
  wb.SheetNames.forEach((name, i) => {
    if ((wb.Workbook?.Sheets?.[i]?.Hidden ?? 0) !== 0) {
      hiddenSkipped++;
      return;
    }
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: false, defval: "", blankrows: false });
    const lines = rows
      .map((row) =>
        row
          .map((cell) => words(String(cell ?? "")).slice(0, CELL_WORDS).join(" "))
          .filter(Boolean)
          .join(" | "),
      )
      .filter(Boolean);
    if (lines.length) sheets.push({ name, lines });
  });
  return { sheets, hiddenSkipped };
}

/** Input, output and valuation sheets first; the rest follow in workbook order. */
const FIRST = /input|output|valuation|story|summary/i;
export function orderSheets(sheets: SheetText[]): SheetText[] {
  return [...sheets.filter((s) => FIRST.test(s.name)), ...sheets.filter((s) => !FIRST.test(s.name))];
}

/** The later of the post's date and the file's last-modified date, as YYYY-MM-DD, so a file changed after its post is hidden until that later date. */
export function passageDate(postDate: string, lastModified: string | null): string {
  const post = postDate.slice(0, 10);
  const modified = lastModified ? new Date(lastModified) : null;
  if (!modified || Number.isNaN(modified.getTime())) return post;
  const day = modified.toISOString().slice(0, 10);
  return day > post ? day : post;
}

export type PostRef = { ref: string; title: string; publishedOn: string };

const fileName = (url: string) => decodeURIComponent(url.split("/").pop() ?? url);
const slugOf = (name: string) => name.toLowerCase().replace(/\.xlsx?$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** The Library document ref of one (post, file): the post's ref plus the file's name, so a file linked twice from a post (even by two different URLs) is the same document. */
export function documentRef(post: PostRef, url: string): string {
  return `${post.ref}-${slugOf(fileName(url))}`;
}

/** Keeps the first of any (post, file) pairs that share a document ref, so no document ref is repeated. */
export function dedupeByDocument<T extends { post: PostRef; url: string }>(pairs: T[]): T[] {
  const seen = new Set<string>();
  return pairs.filter((p) => {
    const ref = documentRef(p.post, p.url);
    if (seen.has(ref)) return false;
    seen.add(ref);
    return true;
  });
}

/**
 * One workbook as a Library document: each section is one passage of up to ~240 words of a sheet's
 * rows, opening with a sentence that names the post, the file and the sheet. At most 12 passages.
 */
export function workbookDocument(input: { post: PostRef; url: string; lastModified: string | null; sheets: SheetText[] }): SourceDocument | null {
  const { post, url } = input;
  const file = fileName(url);
  const sections: SourceDocument["sections"] = [];
  outer: for (const sheet of orderSheets(input.sheets)) {
    const chunks: string[][] = [];
    let current: string[] = [];
    let count = 0;
    for (const line of sheet.lines) {
      const n = words(line).length;
      if (current.length && count + n > BODY_WORDS) {
        chunks.push(current);
        current = [];
        count = 0;
      }
      current.push(words(line).slice(0, BODY_WORDS).join(" "));
      count += Math.min(n, BODY_WORDS);
    }
    if (current.length) chunks.push(current);
    for (const [i, chunk] of chunks.entries()) {
      if (sections.length >= MAX_PASSAGES_PER_WORKBOOK) break outer;
      const part = chunks.length > 1 ? `, part ${i + 1} of ${chunks.length}` : "";
      const intro = `This is the sheet "${sheet.name}"${part} of the spreadsheet ${file}, linked from Aswath Damodaran's post "${post.title}", published ${post.publishedOn} on Musings on Markets.`;
      sections.push({ heading: `${sheet.name}${part}`, paragraphs: [intro, ...chunk] });
    }
  }
  if (!sections.length) return null;
  return {
    ref: documentRef(post, url),
    title: `Spreadsheet ${file} (from the post "${post.title}")`,
    url,
    publishedOn: passageDate(post.publishedOn, input.lastModified),
    sections,
  };
}

/** Downloads one spreadsheet. Returns null for a missing or oversized file; `fetchFn` is injectable so tests need no network. */
export async function fetchSpreadsheet(
  url: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ bytes: Uint8Array; lastModified: string | null } | null> {
  const res = await fetchFn(url, {
    headers: { "User-Agent": "finance-agent-library/1.0 (siddharth.muramkar@icloud.com; private study use)" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) return null;
  if (Number(res.headers.get("content-length") ?? 0) > MAX_FILE_BYTES) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_FILE_BYTES) return null;
  return { bytes, lastModified: res.headers.get("last-modified") };
}

/** Numbers (with thousands commas and percent signs dropped) found in a text. */
function numbersIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/-?\d[\d,]*\.?\d*/g)) {
    const n = m[0].replace(/,/g, "").replace(/\.$/, "");
    if (n.replace(/\D/g, "").length >= 3) out.add(String(Number(n)));
  }
  return out;
}

/** The cross-check between a post picture's text and a spreadsheet's: the figures (three digits or more) the two readings share, and those only the picture holds. */
export function crossCheck(pictureText: string, sheetText: string): { shared: string[]; pictureOnly: string[] } {
  const sheet = numbersIn(sheetText);
  const picture = [...numbersIn(pictureText)];
  return { shared: picture.filter((n) => sheet.has(n)), pictureOnly: picture.filter((n) => !sheet.has(n)) };
}
