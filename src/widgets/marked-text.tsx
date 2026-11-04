import { Fragment } from "react";
import { splitMarkers } from "@/finance/formula-markers";
import { formulaById } from "@/finance/formulas";
import { FormulaFigure, type CardValue } from "./formula-card-view";

/** A marker that cannot be drawn: its raw text, muted, so the gap is visible (the problem is its tooltip and a development warning). */
function BadMarker({ raw, problem }: { raw: string; problem: string }) {
  if (process.env.NODE_ENV !== "production") console.warn(`Formula marker not drawn: ${raw} (${problem})`);
  return (
    <p data-testid="bad-formula-marker" title={problem} className="text-[var(--muted)]">
      {raw}
    </p>
  );
}

/**
 * Topic text (a quiz or review explanation) with each formula marker drawn as a small static Formula
 * Card. The inputs are the marker's own example numbers (plain, not assumptions) and the results come
 * from the formula's calculator, so nothing here types or computes a formula. A marker that cannot be
 * drawn is shown as its raw text (and warns in development), not left out; the course check already rejects those.
 */
export function MarkedText({ text, className }: { text: string; className?: string }) {
  const segments = splitMarkers(text);
  if (segments.every((s) => s.kind === "text")) return <p className={className}>{text}</p>;
  return (
    <div className={className}>
      {segments.map((s, i) => {
        if (s.kind === "text") return s.text.trim() ? <p key={i}>{s.text.trim()}</p> : <Fragment key={i} />;
        // A marker that cannot be drawn shows as its raw text in production, so the gap is visible; in development it warns too.
        if (s.kind === "bad") return <BadMarker key={i} raw={s.raw} problem={s.problem} />;
        const formula = formulaById(s.formulaId);
        if (!formula) return <BadMarker key={i} raw={s.raw} problem={`unknown formula "${s.formulaId}"`} />;
        const values: Record<string, CardValue> = Object.fromEntries(Object.entries(s.values).map(([k, v]) => [k, { value: v, from: "fixed" as const }]));
        return <FormulaFigure key={i} formula={formula} values={values} />;
      })}
    </div>
  );
}
