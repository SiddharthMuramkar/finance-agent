import { createHash } from "node:crypto";
import { PRICES } from "../tutor/pricing.ts";

// The pictures in Damodaran's posts (his valuation tables, his charts) as text the Tutor can search.
// Everything here is pure: which pictures to read, the request for one, what a reading costs, the
// code checks on a reading, and how a reading sits in a post. The laptop command that actually calls
// the Message Batches API is scripts/library-pictures.mjs. Packages and `.ts` imports only, so Node
// can run this file with type stripping.

/** Every line of a picture's text starts with this, so a passage that holds picture text can be told from one that does not (even after the passage is cut). */
export const PICTURE_TAG = "[picture] ";

/** True when the text holds a line read from a picture by a machine. */
export const isMachineRead = (text: string): boolean => text.includes(PICTURE_TAG);

/** The note shown with search results and in the Passage view when a passage holds picture text. */
export const MACHINE_READ_NOTE =
  "Lines starting with \"[picture]\" were read from a picture in the post by a machine (Claude), not typed by the author. Numbers there can be misread: check them against the original picture before relying on one.";

/** The model that reads every picture, and the stronger one that re-reads a sample to check it. */
export const READER_MODEL = "claude-haiku-5-5";
export const CHECKER_MODEL = "claude-opus-5-5";
/** The most tokens one reading may use. */
export const READ_MAX_TOKENS = 1500;
/** How many readings the stronger model re-reads. */
export const SAMPLE_SIZE = 40;

/** Blogger's own image hosts. Pictures anywhere else (other sites, embeds) are not read. */
const HOST = /^(?:blogger\.googleusercontent\.com|(?:\d+\.)?bp\.blogspot\.com)$/i;
/** A path segment or `=` suffix that sets a picture's size: s320, s1600-h, w400-h300, h300-w400. */
const SIZE = /^(?:s\d+|w\d+(?:-h\d+)?|h\d+(?:-w\d+)?)(?:-[a-z]+)*$/i;

/**
 * The original-size address of a picture on one of Blogger's image hosts, or null for any other
 * picture. Blogger serves a resized copy when the address holds a size (`/s320/`, `/w400-h300/`,
 * `=s320`); size `s0` asks for the original. https is used throughout.
 */
export function originalPictureUrl(src: string): string | null {
  let url: URL;
  try {
    url = new URL(src.trim().startsWith("//") ? `https:${src.trim()}` : src.trim());
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol) || !HOST.test(url.hostname)) return null;
  url.protocol = "https:";
  url.hash = "";
  url.search = "";
  const parts = url.pathname.split("/");
  const sized = parts.findIndex((p, i) => i > 0 && i < parts.length - 1 && SIZE.test(p));
  if (sized >= 0) parts[sized] = "s0";
  const last = parts.length - 1;
  const eq = parts[last].lastIndexOf("=");
  if (eq > 0 && SIZE.test(parts[last].slice(eq + 1))) parts[last] = `${parts[last].slice(0, eq)}=s0`;
  url.pathname = parts.join("/");
  return url.toString();
}

/** A picture's lines as paragraphs, each marked as machine-read. */
export function pictureParagraphs(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => PICTURE_TAG + l);
}

/** What the model returns for a picture with nothing of substance (a logo, a portrait, decoration). */
export const NOTHING = "NONE";

export const PICTURE_PROMPT =
  "This is a picture from a finance blog post. If it holds a table, chart, graph, diagram or a screenshot of numbers, transcribe it for a search index. " +
  "For a table, give the title, then one line per row with cells separated by \" | \", keeping every number exactly as printed with its units. " +
  "For a chart, give its title, the axes and units, each series and every value you can read clearly, then one sentence on what it shows. " +
  "Describe only what is visible: do not add outside knowledge, and write \"unreadable\" for a value you cannot read rather than guessing. " +
  `If the picture has nothing of substance (a logo, a portrait, a decorative picture), reply exactly ${NOTHING}.`;

/** The request that reads one picture: the picture goes in by address, so nothing is downloaded or re-uploaded. */
export function readParams(url: string, model: string = READER_MODEL) {
  return {
    model,
    max_tokens: READ_MAX_TOKENS,
    messages: [
      {
        role: "user" as const,
        content: [
          { type: "image" as const, source: { type: "url" as const, url } },
          { type: "text" as const, text: PICTURE_PROMPT },
        ],
      },
    ],
  };
}

/** A batch request id for a picture: letters and digits only, as the Batches API requires, and the same for the same address. */
export const pictureId = (url: string): string => `p${createHash("sha256").update(url).digest("hex").slice(0, 40)}`;

/** One picture's stored reading. `text` is null when the picture has nothing of substance. */
export type PictureReading = { text: string | null; model: string; stopReason: string | null; problems: string[] };

/** The reading cache: original-size picture address to its reading. Nothing is paid for twice. */
export type PictureReadings = Record<string, PictureReading>;

/** The pictures still to read, in order, each once. */
export function unreadPictures(urls: string[], readings: PictureReadings): string[] {
  return [...new Set(urls)].filter((u) => !readings[u]);
}

/** The lines a post gets for a picture, or undefined when it is unread or has nothing of substance. */
export function readingLines(readings: PictureReadings | undefined, url: string): string[] | undefined {
  const text = readings?.[url]?.text;
  return text ? pictureParagraphs(text) : undefined;
}

// ---- Cost -------------------------------------------------------------------------------------

/** Batch requests cost half the usual price. */
const BATCH_DISCOUNT = 0.5;

/** Assumed tokens per picture: a typical one (a mid-size table or chart) and a worst case (a full-size picture, the longest reading allowed). */
const TYPICAL = { input: 1100, output: 450 };
const WORST = { input: 1800, output: READ_MAX_TOKENS };

function priced(model: string, count: number, tokens: { input: number; output: number }, discount: number): number {
  const p = PRICES[model];
  return (count * (tokens.input * p.input + tokens.output * p.output) * discount) / 1_000_000;
}

/** What reading `count` pictures costs, in US dollars: a typical figure and a worst case, through the Batches API or one at a time. */
export function estimateReadCost(count: number, { batch = true }: { batch?: boolean } = {}) {
  const discount = batch ? BATCH_DISCOUNT : 1;
  return { expected: priced(READER_MODEL, count, TYPICAL, discount), worst: priced(READER_MODEL, count, WORST, discount) };
}

/** What the stronger model's re-read of a sample costs, one at a time. */
export function estimateCheckCost(count: number = SAMPLE_SIZE) {
  return { expected: priced(CHECKER_MODEL, count, TYPICAL, 1), worst: priced(CHECKER_MODEL, count, WORST, 1) };
}

/** What a reading really cost, from the tokens it used. */
export function actualCost(model: string, usage: { input_tokens: number; output_tokens: number }, batch: boolean): number {
  const p = PRICES[model];
  return ((usage.input_tokens * p.input + usage.output_tokens * p.output) * (batch ? BATCH_DISCOUNT : 1)) / 1_000_000;
}

// ---- Code checks on every reading ------------------------------------------------------------

const REFUSAL = /\b(i (?:can(?:no|')t|am unable|'m unable|am not able)|unable to (?:read|see|view|transcribe)|i'm sorry|i apologi[sz]e|as an ai|the image (?:is|appears) (?:blank|too))/i;

/** The numbers in a text as plain values: commas, currency signs and percent signs dropped, (5) read as -5. */
export function numbersIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/(\()?(-|−)?\$?(\d[\d,]*(?:\.\d+)?|\.\d+)\s*(%|x|bn|b|m|k)?(\))?/gi)) {
    const value = Number(m[3].replace(/,/g, ""));
    if (Number.isNaN(value)) continue;
    out.push(m[1] && m[5] ? -value : m[2] ? -value : value);
  }
  return out;
}

const cells = (line: string) => line.split("|").map((c) => c.trim());

/**
 * The problems code can see in a reading, without a second model: cut off by the length limit,
 * empty, a refusal, table rows with a different number of cells from the rest, digits typed as
 * letters, a line repeated over and over, and a "Total" row that does not add up its column.
 * Empty list: nothing to fix. Each problem is a plain sentence.
 */
export function checkReading(text: string, stopReason: string | null): string[] {
  const problems: string[] = [];
  if (stopReason === "max_tokens") problems.push("cut off by the length limit");
  if (!text.trim()) return [...problems, "empty"];
  if (REFUSAL.test(text)) problems.push("reads like a refusal or an apology, not a transcript");
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  const rows = lines.filter((l) => l.includes("|"));
  if (rows.length >= 3) {
    const counts = new Map<number, number>();
    for (const r of rows) counts.set(cells(r).length, (counts.get(cells(r).length) ?? 0) + 1);
    const usual = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    const odd = rows.filter((r) => cells(r).length !== usual);
    if (odd.length) problems.push(`${odd.length} table row(s) do not have the usual ${usual} cells, e.g. "${odd[0].slice(0, 60)}"`);
  }

  if (/\d[OoIl][\d.,%]|[.,][Oo]\d/.test(text)) problems.push("a letter stands where a digit should (O, l or I between digits)");
  const counts = new Map<string, number>();
  for (const l of lines) counts.set(l, (counts.get(l) ?? 0) + 1);
  if ([...counts.entries()].some(([l, n]) => n >= 4 && l.length > 8)) problems.push("a line repeats four or more times");
  if (lines.some((l) => l.split(/\s+/).length > 250)) problems.push("one line is over 250 words");

  // A row labelled Total (or Sum) must add up the numbers directly above it in each column, whether or not
  // earlier subtotals are counted; a year heading at the top of the column is not part of the sum.
  rows.forEach((row, i) => {
    const [label, ...rest] = cells(row);
    if (!/^(total|sum)\b/i.test(label)) return;
    rest.forEach((cell, col) => {
      const total = numbersIn(cell)[0];
      if (total === undefined) return;
      const above: { label: string; value: number }[] = [];
      for (let j = i - 1; j >= 0; j--) {
        const [name, ...values] = cells(rows[j]);
        const value = numbersIn(values[col] ?? "")[0];
        if (value === undefined) break;
        above.unshift({ label: name, value });
      }
      if (above.length && Number.isInteger(above[0].value) && above[0].value >= 1900 && above[0].value <= 2100) above.shift();
      if (above.length < 2) return;
      const sums = [above, above.filter((a) => !/total/i.test(a.label))].map((list) => list.reduce((x, a) => x + a.value, 0));
      if (sums.every((sum) => Math.abs(sum - total) > Math.max(0.011 * Math.abs(total), 0.51))) {
        problems.push(`the Total row says ${total} in column ${col + 2} but the rows above add up to ${Math.round(sums[1] * 100) / 100}`);
      }
    });
  });
  return problems;
}

// ---- The stronger model's re-read ------------------------------------------------------------

/** Picks `n` readings spread evenly through the list (by address, so the same pictures are picked on a re-run). */
export function pickSamples(urls: string[], n: number = SAMPLE_SIZE): string[] {
  const sorted = [...new Set(urls)].sort();
  if (sorted.length <= n) return sorted;
  return Array.from({ length: n }, (_, i) => sorted[Math.floor(((i + 0.5) * sorted.length) / n)]);
}

/** Numbers a reading has that the other lacks, and the reverse. The same number twice counts twice. */
export function compareReadings(a: string, b: string): { agree: boolean; onlyFirst: number[]; onlySecond: number[] } {
  const left = numbersIn(a);
  const right = [...numbersIn(b)];
  const onlyFirst: number[] = [];
  for (const v of left) {
    const at = right.indexOf(v);
    if (at < 0) onlyFirst.push(v);
    else right.splice(at, 1);
  }
  return { agree: !onlyFirst.length && !right.length, onlyFirst, onlySecond: right };
}

export type AccuracyReport = {
  /** Readings that failed a code check. */
  flagged: { url: string; problems: string[] }[];
  /** Sampled pictures where the stronger model read different numbers: the disagreeing numbers on each side. */
  disagreements: { url: string; haikuOnly: number[]; strongerOnly: number[] }[];
  sampled: number;
  /** Share of sampled readings with identical numbers, 0 to 1; null when nothing was sampled. */
  agreement: number | null;
  readings: number;
};

/** The accuracy picture: code checks on every reading, and the stronger model's re-read of the sample. */
export function accuracyReport(readings: PictureReadings, rereads: Record<string, string>): AccuracyReport {
  const flagged = Object.entries(readings)
    .filter(([, r]) => r.text !== null && r.problems.length)
    .map(([url, r]) => ({ url, problems: r.problems }));
  const disagreements: AccuracyReport["disagreements"] = [];
  let sampled = 0;
  for (const [url, again] of Object.entries(rereads)) {
    const first = readings[url]?.text;
    if (first == null) continue;
    sampled++;
    const diff = compareReadings(first, again);
    if (!diff.agree) disagreements.push({ url, haikuOnly: diff.onlyFirst, strongerOnly: diff.onlySecond });
  }
  return { flagged, disagreements, sampled, agreement: sampled ? (sampled - disagreements.length) / sampled : null, readings: Object.values(readings).filter((r) => r.text !== null).length };
}
