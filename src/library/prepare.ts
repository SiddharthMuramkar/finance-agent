// Packages only (no "@/" paths): the Library scripts run this from the laptop with Node's type stripping.
import { isMachineRead } from "./pictures.ts";

/** A source document as an extractor hands it over: titled sections of paragraphs, in reading order. */
export type SourceDocument = {
  /** Stable key within the source (a module ID, a post ID). */
  ref: string;
  title: string;
  url: string;
  publishedOn: string | null;
  sections: { heading: string; paragraphs: string[] }[];
};

/** A cut passage, ready for `importLibrary`. */
export type PreparedPassage = { ref: string; heading: string; url: string; publishedOn: string | null; text: string };

/** Folds ligatures and odd spaces, joins words hyphenated across a line break, and collapses whitespace. */
export function cleanText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[­​-‍﻿]/g, "")
    .replace(/(\p{L})-\s*\n\s*(\p{L})/gu, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Why a passage looks corrupted, the way PDF extraction breaks text, so it is kept out of the
 * Library rather than stored unfindable: "CreaAon" for "Creation" (a lost ligature became a
 * capital), letters spaced apart, PDF character codes such as "(cid:12)", and replacement characters.
 */
export function corruptionReasons(text: string): string[] {
  const reasons: string[] = [];
  const tokens = text.split(/\s+/).filter(Boolean);
  const broken = text.match(/\b[a-z]{2,}[A-Z][a-z]+\b/g) ?? [];
  if (broken.length >= 2 || broken.length / Math.max(tokens.length, 1) > 0.02) reasons.push("broken ligatures");
  const singles = tokens.filter((t) => /^\p{L}$/u.test(t)).length;
  if (tokens.length >= 8 && singles / tokens.length > 0.4) reasons.push("letters spaced apart");
  if (/\(cid:\d+\)/.test(text)) reasons.push("PDF character codes");
  if (text.includes("�")) reasons.push("replacement characters");
  return reasons;
}

/** What a lost ligature glyph usually stood for: the capital in "CreaAon" replaced "ti". */
const LIGATURE_LETTERS = ["ti", "tt", "ft", "fi", "fl", "ff", "ffi", "ffl"];

/** The clean lowercase words of some text: the source's own spelling, used to check a repair. */
export function wordsOf(text: string): Set<string> {
  return new Set((text.match(/\b[A-Za-z][a-z]*\b/g) ?? []).map((w) => w.toLowerCase()));
}

/** Fills each interior capital of `word` with the letters a ligature stood for, until the result is a known word. */
function mend(word: string, vocabulary: Set<string>): string | null {
  // Each capital tries eight spellings, so a long run-together token would take forever: only a word with up to three capitals is a lost-ligature candidate.
  if ((word.match(/[A-Z]/g) ?? []).length > 3) return null;
  const at = [...word].findIndex((c, i) => i > 0 && /[A-Z]/.test(c) && /[a-z]/.test(word[i - 1]));
  if (at < 0) return vocabulary.has(word.toLowerCase()) ? word : null;
  for (const letters of LIGATURE_LETTERS) {
    const done = mend(word.slice(0, at) + letters + word.slice(at + 1), vocabulary);
    if (done) return done;
  }
  return null;
}

/** "firmStatus" or "ofDecember" read from a table or a PDF: a lowercase known word run into a capitalised one (of three letters or more), split back apart. Names such as LatinWorks or MetLife start with a capital and are left alone. */
function glued(word: string, vocabulary: Set<string>): string | null {
  const at = [...word].findIndex((c, i) => i >= 2 && /[A-Z]/.test(c) && /[a-z]/.test(word[i - 1]));
  if (at < 0 || word.length - at < 3) return null;
  const [head, tail] = [word.slice(0, at), word.slice(at)];
  return /^[a-z][a-z]+$/.test(head) && /^[A-Z][a-z]+$/.test(tail) && vocabulary.has(head.toLowerCase()) && vocabulary.has(tail.toLowerCase()) ? `${head} ${tail}` : null;
}

/**
 * Repairs the way PDF extraction loses ligatures ("CreaAon" for "Creation") when, and only when,
 * the repaired word already appears clean elsewhere in the same source (`vocabulary`). A broken
 * word with no known clean spelling is left as it is, so the corruption check still flags it.
 */
export function repairBrokenLigatures(text: string, vocabulary: Set<string>): { text: string; fixed: number } {
  let fixed = 0;
  const out = text.replace(/\b[A-Za-z]*[a-z][A-Z][A-Za-z]*\b/g, (word) => {
    const mended = mend(word, vocabulary) ?? glued(word, vocabulary);
    if (!mended || mended === word) return word;
    fixed++;
    return word[0] === word[0].toUpperCase() ? mended[0].toUpperCase() + mended.slice(1) : mended;
  });
  return { text: out, fixed };
}

/** One PDF page as extracted: its text and how many pictures it holds. */
export type PdfPage = { number: number; text: string; images: number };

/** Pages with a picture but hardly any words, as a chart or scanned slide leaves: only vision can read them. */
export function pagesNeedingVision(pages: PdfPage[], { maxWords = 40 }: { maxWords?: number } = {}): PdfPage[] {
  return pages.filter((p) => p.images > 0 && p.text.split(/\s+/).filter(Boolean).length <= maxWords);
}

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** Packs pieces in order into groups of at most `max` words; a piece is never split here. */
function pack(pieces: string[], max: number, joiner: string): string[] {
  const groups: string[] = [];
  let current: string[] = [];
  let size = 0;
  for (const piece of pieces) {
    const n = wordCount(piece);
    if (current.length && size + n > max) {
      groups.push(current.join(joiner));
      current = [];
      size = 0;
    }
    current.push(piece);
    size += n;
  }
  if (current.length) groups.push(current.join(joiner));
  return groups;
}

/**
 * Cuts a document into passages: whole paragraphs packed up to `maxWords`, never across a section,
 * with a paragraph longer than that split at sentence ends. Refs are `<document ref>#<n>`, so a
 * reload of the same text keeps them (and their embeddings).
 */
export function cutPassages(doc: SourceDocument, { maxWords = 300 }: { maxWords?: number } = {}): PreparedPassage[] {
  const passages: PreparedPassage[] = [];
  for (const section of doc.sections) {
    const pieces = section.paragraphs
      .map(cleanText)
      .filter(Boolean)
      .flatMap((p) => (wordCount(p) > maxWords ? pack(p.split(/(?<=[.!?])\s+/), maxWords, " ") : [p]));
    const heading = section.heading && section.heading !== doc.title ? `${doc.title}: ${section.heading}` : doc.title;
    for (const text of pack(pieces, maxWords, "\n\n")) {
      passages.push({ ref: `${doc.ref}#${passages.length + 1}`, heading, url: doc.url, publishedOn: doc.publishedOn, text });
    }
  }
  return passages;
}

/** A sentence of running prose: seven or more words ending in a full stop, question mark or exclamation mark. */
const PROSE = /\b\w+(?:\s+\S+){6,}[a-z)"”']\s*[.!?][)"”']*(\s|$)/;

/**
 * Front matter: a title page or running header, a short passage of names, a title and a date with
 * no sentence in it. Search ranks these first when a question names the author, ahead of the
 * writing itself, so they stay out of the Library.
 */
export function isFrontMatter(text: string): boolean {
  // A picture's text is the post's own content, however short: a post that opens with a table keeps it.
  if (isMachineRead(text)) return false;
  return wordCount(text) < 60 && (!PROSE.test(text) || AUTHOR_LINE.test(text));
}

/** An e-mail address or school line, which a title page has even when the title itself is a question. */
const AUTHOR_LINE = /\b[\w.-]+@[\w-]+\.[\w.]+|\bSchool of (Business|Management|Economics)\b/i;

/** Cuts every document, repairs broken ligatures where the source itself shows the clean word, and keeps still-corrupted passages out, listing them with their reasons, and leaves out each document's title page (front matter). */
export function prepareDocuments(docs: SourceDocument[], options?: { maxWords?: number }) {
  const passages: PreparedPassage[] = [];
  const rejected: { ref: string; heading: string; reasons: string[] }[] = [];
  const frontMatter: { ref: string; heading: string }[] = [];
  let repaired = 0;
  const vocabulary = wordsOf(docs.flatMap((d) => d.sections.flatMap((s) => s.paragraphs.map(cleanText))).join(" "));
  for (const doc of docs) {
    for (const [i, cut] of cutPassages(doc, options).entries()) {
      const mended = repairBrokenLigatures(cut.text, vocabulary);
      repaired += mended.fixed;
      const p = { ...cut, text: mended.text };
      const reasons = corruptionReasons(p.text);
      if (i === 0 && isFrontMatter(p.text)) frontMatter.push({ ref: p.ref, heading: p.heading });
      else if (reasons.length) rejected.push({ ref: p.ref, heading: p.heading, reasons });
      else passages.push(p);
    }
  }
  return { passages, rejected, repaired, frontMatter };
}
