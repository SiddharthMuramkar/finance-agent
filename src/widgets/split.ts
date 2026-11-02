export type Segment =
  | { type: "prose"; text: string }
  | { type: "widget"; code: string; complete: boolean };

const OPEN = "```openui-lang\n";
const CLOSE = "\n```";

/** Length of the longest tail of `text` that is a proper start of `token`. */
function partialTail(text: string, token: string): number {
  for (let k = Math.min(token.length - 1, text.length); k > 0; k--) {
    if (text.endsWith(token.slice(0, k))) return k;
  }
  return 0;
}

/**
 * Splits a Tutor reply, complete or still streaming, into prose and OpenUI
 * widget blocks (```openui-lang fences). A fence that has only partly arrived
 * is held back while streaming, so widget code never flashes up as prose.
 */
export function splitReply(text: string, { streaming = false } = {}): Segment[] {
  const segments: Segment[] = [];
  const prose = (t: string) => t && segments.push({ type: "prose", text: t });
  let rest = text;
  for (;;) {
    const start = rest.indexOf(OPEN);
    if (start === -1 || (start > 0 && rest[start - 1] !== "\n")) {
      if (start !== -1) {
        // A fence must start a line; treat this one as prose and keep looking.
        const next = splitReply(rest.slice(start + 1), { streaming });
        prose(rest.slice(0, start + 1));
        return mergeProse([...segments, ...next]);
      }
      const tail = streaming ? partialTail(rest, OPEN) : 0;
      const lineStart = rest.length - tail;
      prose(tail && (lineStart === 0 || rest[lineStart - 1] === "\n") ? rest.slice(0, lineStart) : rest);
      return mergeProse(segments);
    }
    prose(rest.slice(0, start));
    const body = rest.slice(start + OPEN.length);
    const end = body.indexOf(CLOSE);
    if (end === -1) {
      const code = body.slice(0, body.length - partialTail(body, CLOSE));
      segments.push({ type: "widget", code, complete: false });
      return segments;
    }
    segments.push({ type: "widget", code: body.slice(0, end), complete: true });
    rest = body.slice(end + CLOSE.length);
  }
}

function mergeProse(segments: Segment[]): Segment[] {
  return segments.reduce<Segment[]>((out, s) => {
    const last = out[out.length - 1];
    if (s.type === "prose" && last?.type === "prose") last.text += s.text;
    else out.push({ ...s });
    return out;
  }, []);
}
