import { Fragment, type ReactNode } from "react";
import { calculate } from "@/finance/calculators";
import { formatSymbolValue } from "@/finance/formula-text";
import { formulaCurrency, type Formula, type FormulaOutput, type SymbolUnit } from "@/finance/formulas";
import { formatInr } from "@/finance/indian-format";
import { AssumptionTag, formatUsd, SourcedTag } from "./case-data-view";

// The pure drawing of a Formula Card. Every value is coloured by where it came from, as a separate
// element (data-kind="assumption" | "sourced" | "fixed"): teal for the Learner's assumption, amber for a
// sourced Case Data figure, plain for a fixed number. The result and the values worked out on the way
// come from the tested calculator the formula points at; nothing here does arithmetic.

export type Provenance = "assumption" | "sourced" | "fixed";

export type CardValue = {
  value: number;
  from: Provenance;
  /** Who the figure is credited to; sourced values only. */
  credit?: { source: string; sourceUrl: string; date: string };
};

const LOOK: Record<Provenance, string> = {
  assumption: "border-b-2 border-[var(--you-line)] bg-[var(--you-tint)]",
  sourced: "border-b-2 border-[var(--src-line)] bg-[var(--src-tint)]",
  fixed: "",
};

export function formatSymbol(value: number, unit: SymbolUnit): string {
  if (unit === "usd") return formatUsd(value);
  if (unit === "inr") return formatInr(value);
  return formatSymbolValue(value, unit);
}

const UNIT_WORDS: Record<SymbolUnit, string> = { percent: "percent a year", years: "years", usd: "dollars", inr: "rupees", count: "a count", value: "a level" };

function Value({ id, text, from }: { id: string; text: string; from: Provenance }) {
  return (
    <span data-kind={from} data-symbol={id} className={`rounded-sm px-1 font-medium tabular-nums ${LOOK[from]}`}>
      {text}
    </span>
  );
}

/** One expression line with each `{key}` replaced by its mark or by its live value. */
function Line({ line, parts }: { line: string; parts: Record<string, ReactPart> }) {
  return (
    <p className="leading-7">
      {line.split(/(\{[A-Za-z]+\})/).map((piece, i) => {
        const key = /^\{([A-Za-z]+)\}$/.exec(piece)?.[1];
        return <Fragment key={i}>{key && parts[key] ? parts[key] : piece}</Fragment>;
      })}
    </p>
  );
}
type ReactPart = ReactNode;

/**
 * A named formula with each symbol in plain words and unit, the given values filled in (coloured by
 * origin) and the result worked out by the formula's tested calculator.
 */
export function FormulaFigure({ formula, values }: { formula: Formula; values: Record<string, CardValue> }) {
  const outputs: FormulaOutput[] = [...formula.derived, formula.result];
  const run = calculate(
    formula.calculator,
    Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.value])),
    formulaCurrency(formula),
  );
  const worked = run.ok ? Object.fromEntries(outputs.map((o) => [o.key, run.results.find((r) => r.label === o.resultLabel)?.text])) : {};

  const marks: Record<string, ReactPart> = Object.fromEntries([
    ...formula.symbols.map((s) => [s.key, <strong key={s.key}>{s.mark}</strong>] as const),
    ...outputs.map((o) => [o.key, <strong key={o.key}>{o.mark}</strong>] as const),
  ]);
  const filled: Record<string, ReactPart> = Object.fromEntries([
    ...formula.symbols.map((s) => {
      const v = values[s.key];
      return [s.key, v ? <Value key={s.key} id={s.key} text={formatSymbol(v.value, s.unit)} from={v.from} /> : s.mark] as const;
    }),
    ...outputs.map((o) => [o.key, worked[o.key] ? <Value key={o.key} id={o.key} text={worked[o.key]!} from="fixed" /> : o.mark] as const),
  ]);

  return (
    <figure data-testid="formula-card" data-formula={formula.id} className="my-2 min-w-0 rounded-md border border-[var(--border)] p-3 text-sm">
      <figcaption className="mb-2 font-medium">{formula.title}</figcaption>
      <div className="space-y-1" aria-label="The formula">
        {formula.expression.map((line) => (
          <Line key={line} line={line} parts={marks} />
        ))}
      </div>
      <div className="mt-2 space-y-1 border-t border-[var(--border)] pt-2" aria-label="With the numbers filled in" data-testid="formula-filled">
        {formula.expression.map((line) => (
          <Line key={line} line={line} parts={filled} />
        ))}
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr_auto] items-baseline gap-x-3 gap-y-1">
        {formula.symbols.map((s) => {
          const v = values[s.key];
          return (
            <div key={s.key} className="contents" data-testid="formula-symbol">
              <dt className="font-semibold">{s.mark}</dt>
              <dd className="text-[var(--muted)]">
                {s.name} <span className="text-xs">({UNIT_WORDS[s.unit]})</span>
                {v?.from === "assumption" && <AssumptionTag />}
                {v?.from === "sourced" && (
                  <>
                    <SourcedTag />
                    {v.credit && (
                      <span className="text-xs">
                        {" "}
                        <a href={v.credit.sourceUrl} target="_blank" rel="noreferrer" className="-my-1 inline-block min-h-6 py-1 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]">
                          {v.credit.source}
                        </a>{" "}
                        ({v.credit.date})
                      </span>
                    )}
                  </>
                )}
              </dd>
              <dd className="text-right">{v && <Value id={`${s.key}-row`} text={formatSymbol(v.value, s.unit)} from={v.from} />}</dd>
            </div>
          );
        })}
        {outputs.map((o) => (
          <div key={o.key} className="contents" data-testid="formula-output">
            <dt className="font-semibold">{o.mark}</dt>
            <dd className="text-[var(--muted)]">
              {o.name} <span className="text-xs">({UNIT_WORDS[o.unit]})</span>
            </dd>
            <dd className="text-right font-semibold tabular-nums">{worked[o.key] ?? "…"}</dd>
          </div>
        ))}
      </dl>
      {!run.ok && (
        <p role="status" className="mt-2 text-[var(--muted)]">
          This formula could not be worked out: {run.error}
        </p>
      )}
    </figure>
  );
}
