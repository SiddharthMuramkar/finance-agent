import { EMOJI_DATA } from "./registry-data.ts";

// The emoji registry (spec 2026-11-05, ticket E1): every picture in public/emoji/, by kebab-case name. The data is written
// by scripts/vendor-emoji.mjs from the Fluent Emoji 3D subset; this file adds the lookup.
// Pure, with no "@/" imports, so `scripts/check-course.mjs` runs it under plain Node.

export type EmojiEntry = { readonly unicode: string; readonly file: string; readonly alt: string; readonly keywords: readonly string[] };

/** name -> { unicode, file, alt, keywords[] }. `alt` is 1 to 4 plain words ("money bag"). */
export const EMOJI = EMOJI_DATA satisfies Record<string, EmojiEntry>;

export type EmojiName = keyof typeof EMOJI_DATA;

export const EMOJI_NAMES = Object.keys(EMOJI_DATA) as EmojiName[];

export function isEmojiName(name: string): name is EmojiName {
  return Object.prototype.hasOwnProperty.call(EMOJI_DATA, name);
}

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/**
 * The best match for a keyword or short phrase: an exact name wins, then the entry whose keywords match the most of the
 * phrase's words (a word of the name beats another keyword, which beats a shared word start such as "coin" and "coins"), the shorter name on a tie ("money-bag" over "money-mouth-face"), then the earlier entry. Null when nothing matches.
 */
export function emojiFor(keyword: string): EmojiName | null {
  const asked = keyword.trim().toLowerCase();
  if (!asked) return null;
  const direct = asked.replace(/\s+/g, "-");
  if (isEmojiName(direct)) return direct;
  const wanted = words(asked);
  let best: EmojiName | null = null;
  let bestScore = 0;
  for (const name of EMOJI_NAMES) {
    const nameWords = new Set(words(name));
    const own = new Set([...EMOJI[name].keywords, ...nameWords]);
    let score = 0;
    for (const w of wanted) {
      if (own.has(w)) score += nameWords.has(w) ? 4 : 3;
      else if (w.length > 3 && [...own].some((k) => k.length > 3 && (k.startsWith(w) || w.startsWith(k)))) score += 1;
    }
    if (score > bestScore || (score > 0 && score === bestScore && best && words(name).length < words(best).length)) {
      best = name;
      bestScore = score;
    }
  }
  return best;
}
