import type { TopicNote } from "@/learner/notes";
import { formulaById } from "@/finance/formulas";
import { FormulaFigure, type CardValue } from "@/widgets/formula-card-view";
import { MarkedText } from "@/widgets/marked-text";

/** A sub-part's label: small capitals in muted (ADR 0015). */
function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="type-eyebrow text-[var(--muted)]">{children}</h3>;
}

/**
 * The part of a Topic Note that code fills in once the Topic is passed, under a hairline like every part of a row. What
 * the Widget kit draws here (the Formula Cards, the principle's markers) is Widget content (`data-widget-content`), and a
 * Formula Card sits in the white frame a Widget uses (`--frame` with a `--rule` edge, A6), so it reads as Widget content.
 */
export function FilledPart({ filled }: { filled: NonNullable<TopicNote["filled"]> }) {
  return (
    <div data-filled data-widget-content className="mt-5 flex flex-col gap-5 border-t border-[var(--rule)] pt-4">
      {filled.formulas.map((f) => {
        const formula = formulaById(f.formulaId);
        if (!formula) return null;
        const values: Record<string, CardValue> = Object.fromEntries(Object.entries(f.values).map(([k, v]) => [k, { value: v, from: "fixed" as const }]));
        return (
          <div key={f.formulaId} data-formula={f.formulaId} className="break-inside-avoid rounded-xl border border-[var(--rule)] bg-[var(--frame)] px-3 py-1">
            <FormulaFigure formula={formula} values={values} />
          </div>
        );
      })}
      {filled.insight && (
        <div data-insight className="break-inside-avoid">
          <Heading>The Insight</Heading>
          <p className="measure mt-2 text-sm leading-6">
            <span className="text-[var(--muted)]">In your words: </span>
            {filled.insight.ownWords}
          </p>
          {filled.insight.written && (
            <p data-written-insight className="measure mt-1 text-sm leading-6">
              <span className="text-[var(--muted)]">As written: </span>
              {filled.insight.written}
            </p>
          )}
        </div>
      )}
      <div>
        <Heading>The principle</Heading>
        <MarkedText text={filled.principle} className="mt-2 flex flex-col gap-2 text-sm leading-6" />
      </div>
      {filled.connections.length > 0 && (
        <div className="break-inside-avoid">
          <Heading>Connections</Heading>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm leading-6">
            {filled.connections.map((c) => (
              <li key={c.text}>
                {c.text}
                {c.titles.length > 0 && <span className="text-[var(--muted)]"> ({c.titles.join(", ")})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {filled.mistakes.length > 0 && (
        <div className="break-inside-avoid">
          <Heading>Mistakes noticed</Heading>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm leading-6">
            {filled.mistakes.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
