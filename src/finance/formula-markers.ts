import { formulaById } from "./formulas.ts";

// Formula markers (ADR 0002): a Topic's text names a registry formula and its example inputs, and code
// does the rest. Written as {{formula:present-value amount=1100 ratePercent=10 years=1}}. The screens
// draw a marker as a static Formula Card, and the Tutor is sent plain words plus the computed result
// (see formula-text.ts), so a marker never reaches the Learner or the Tutor raw.
// No "@/" imports, so `scripts/check-course.mjs` can run it under plain Node.

export type Segment =
  | { kind: "text"; text: string }
  | { kind: "formula"; raw: string; formulaId: string; values: Record<string, number> }
  /** A marker that cannot be drawn; the course check reports `problem`. */
  | { kind: "bad"; raw: string; problem: string };

const MARKER = /\{\{formula:([^}]*)\}\}/g;

function parseMarker(raw: string, body: string, allowed?: readonly string[]): Segment {
  const [id, ...pairs] = body.trim().split(/\s+/);
  const bad = (problem: string): Segment => ({ kind: "bad", raw, problem });
  const formula = formulaById(id ?? "");
  if (!formula) return bad(`unknown formula "${id}"`);
  if (allowed && !allowed.includes(formula.id)) return bad(`"${formula.id}" is not in this Topic's formulas list`);
  const values: Record<string, number> = {};
  for (const pair of pairs) {
    const m = /^([A-Za-z]+)=(-?\d+(?:\.\d+)?)$/.exec(pair);
    if (!m) return bad(`"${pair}" is not key=number`);
    if (m[1] in values) return bad(`"${m[1]}" is given twice`);
    values[m[1]] = Number(m[2]);
  }
  const keys = formula.symbols.map((s) => s.key);
  const missing = keys.filter((k) => !(k in values));
  const extra = Object.keys(values).filter((k) => !keys.includes(k));
  if (missing.length || extra.length) {
    return bad(`"${formula.id}" takes ${keys.join(", ")}${missing.length ? `; missing ${missing.join(", ")}` : ""}${extra.length ? `; not a key: ${extra.join(", ")}` : ""}`);
  }
  return { kind: "formula", raw, formulaId: formula.id, values };
}

/** Splits text into plain text and markers. `allowed` limits the formulas a marker may name (a Topic's own list). */
export function splitMarkers(text: string, allowed?: readonly string[]): Segment[] {
  const out: Segment[] = [];
  let at = 0;
  for (const m of text.matchAll(MARKER)) {
    if (m.index > at) out.push({ kind: "text", text: text.slice(at, m.index) });
    out.push(parseMarker(m[0], m[1], allowed));
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ kind: "text", text: text.slice(at) });
  return out;
}

export function hasMarkers(text: string): boolean {
  return text.includes("{{formula:");
}

/** What is wrong with the markers in `text`, one line each. A stray "{{formula:" that does not close counts. */
export function markerProblems(text: string, allowed?: readonly string[]): string[] {
  const problems = splitMarkers(text, allowed).flatMap((s) => (s.kind === "bad" ? [`${s.raw}: ${s.problem}`] : []));
  const opened = text.split("{{formula:").length - 1;
  const closed = [...text.matchAll(MARKER)].length;
  if (opened !== closed) problems.push("a formula marker is not closed with }}");
  return problems;
}
