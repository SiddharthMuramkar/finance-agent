import { Fragment, type ReactNode } from "react";

// The site's copy is plain strings (src/site/examples.ts, src/site/copy.ts), so tests can read it word for word. Two
// marks carry emphasis, as in the spec's copy deck: `**bold**` (strong, weight 600 in ink) and `*italic*` (em). Nothing
// else is parsed, and no HTML is ever injected.

export type RichPart = { text: string; mark?: "strong" | "em" };

/** Splits copy into plain, bold and italic runs. An unclosed mark stays as plain text. */
export function richParts(copy: string): RichPart[] {
  const parts: RichPart[] = [];
  const pattern = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let at = 0;
  for (const match of copy.matchAll(pattern)) {
    if (match.index > at) parts.push({ text: copy.slice(at, match.index) });
    parts.push(match[1] !== undefined ? { text: match[1], mark: "strong" } : { text: match[2], mark: "em" });
    at = match.index + match[0].length;
  }
  if (at < copy.length) parts.push({ text: copy.slice(at) });
  return parts;
}

/** The same copy with its marks taken out: what a screen reader or a title attribute reads. */
export function plain(copy: string): string {
  return richParts(copy)
    .map((p) => p.text)
    .join("");
}

/** Copy with its bold and italic runs drawn as strong and em. */
export function Rich({ children }: { children: string }): ReactNode {
  return richParts(children).map((part, i) =>
    part.mark === "strong" ? <strong key={i}>{part.text}</strong> : part.mark === "em" ? <em key={i}>{part.text}</em> : <Fragment key={i}>{part.text}</Fragment>,
  );
}
