import type { TopicNote } from "@/learner/notes";
import { formulaById } from "@/finance/formulas";
import { FormulaFigure, type CardValue } from "@/widgets/formula-card-view";
import { MarkedText } from "@/widgets/marked-text";

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-4 text-xs font-semibold uppercase leading-4 tracking-wide text-[var(--muted)]">{children}</h3>;
}

/** The part of a Topic Note that code fills in once the Topic is passed. */
export function FilledPart({ filled }: { filled: NonNullable<TopicNote["filled"]> }) {
  return (
    <div data-filled>
      {filled.formulas.map((f) => {
        const formula = formulaById(f.formulaId);
        if (!formula) return null;
        const values: Record<string, CardValue> = Object.fromEntries(Object.entries(f.values).map(([k, v]) => [k, { value: v, from: "fixed" as const }]));
        return (
          <div key={f.formulaId} data-formula={f.formulaId} className="mt-3 break-inside-avoid">
            <FormulaFigure formula={formula} values={values} />
          </div>
        );
      })}
      {filled.insight && (
        <div data-insight className="break-inside-avoid">
          <Heading>The Insight</Heading>
          <p className="measure mt-1 text-sm leading-6">
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
      <Heading>The principle</Heading>
      <MarkedText text={filled.principle} className="mt-1 flex flex-col gap-2 text-sm leading-6" />
      {filled.connections.length > 0 && (
        <div className="break-inside-avoid">
          <Heading>Connections</Heading>
          <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-sm leading-6">
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
          <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-sm leading-6">
            {filled.mistakes.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
