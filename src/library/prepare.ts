// Packages only (no "@/" paths): the Library scripts run this from the laptop with Node's type stripping.

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

/** Cuts every document and keeps corrupted passages out, listing them with their reasons. */
export function prepareDocuments(docs: SourceDocument[], options?: { maxWords?: number }) {
  const passages: PreparedPassage[] = [];
  const rejected: { ref: string; heading: string; reasons: string[] }[] = [];
  for (const doc of docs) {
    for (const p of cutPassages(doc, options)) {
      const reasons = corruptionReasons(p.text);
      if (reasons.length) rejected.push({ ref: p.ref, heading: p.heading, reasons });
      else passages.push(p);
    }
  }
  return { passages, rejected };
}
