import { splitReply } from "@/widgets/split";

const WIDGET_OPEN = "```openui-lang\n";
const WIDGET_CLOSE = "\n```";
const FENCE = "```";

/**
 * The reply text without a Widget it had not finished: an unclosed openui-lang fence (and anything after it) is
 * cut off, so a stopped reply is never saved or replayed with a Widget that cannot draw. The one copy the server (a
 * stopped turn) and the browser (the reply on screen) both use.
 */
export function withoutOpenWidget(text: string): string {
  const segments = splitReply(text);
  const kept = segments.flatMap((s) => (s.type === "prose" ? [s.text] : s.complete ? [WIDGET_OPEN + s.code + WIDGET_CLOSE] : [])).join("");
  // A fence only partly typed ("```openui") at the start of the last line goes too.
  for (let k = WIDGET_OPEN.length - 1; k > FENCE.length; k--) {
    const start = kept.length - k;
    if (kept.endsWith(WIDGET_OPEN.slice(0, k)) && (start === 0 || kept[start - 1] === "\n")) return kept.slice(0, start).trimEnd();
  }
  // A bare "```" the reply stopped on, with no fence open before it in the same prose, opens a fence that never got its name: it goes.
  // (One that closes a fence has an odd count before it, and a finished Widget's closing fence is not in prose.)
  const last = segments.at(-1);
  if (last?.type === "prose" && kept.endsWith(last.text)) {
    const prose = last.text.trimEnd();
    const start = prose.length - FENCE.length;
    const fences = prose.split(FENCE).length - 1;
    if (prose.endsWith(FENCE) && (start === 0 || prose[start - 1] === "\n") && fences % 2 === 1) {
      return kept.slice(0, kept.length - (last.text.length - start)).trimEnd();
    }
  }
  return kept.trimEnd();
}
