import { ArrowUpRight } from "lucide-react";
import { CURRENCY_MARKET, knownOn, marketReading, readingMonth, readingValueText, type ReadingsKnownOn } from "@/markets/readings";

// Market readings beside a Workbench's Levers (spec #68, ticket #105; user stories 74 to 76): each yardstick with its
// month and year, its credit and a link to the public source, so a Learner can judge whether a Lever's setting is usual.
// A reading is history from its own month, never "today" (ADR 0013); the sunflower edge marks it as sourced data, as
// Case Data is marked (case-data-view.tsx). A Workbench on a Case keeps the As-of rule: before the Reveal it shows only
// readings dated on or before the Case's As-of date and from the Case's own market (Owner decision on #105); the course
// check fails a Topic that asks for any other (preRevealReadingErrors).

/** What a Workbench's Case knew: its As-of date (the price's date) and the market its money belongs to. */
export function caseKnownOn(block: { currency: string; price: { date: string } } | undefined): ReadingsKnownOn | undefined {
  const market = block && CURRENCY_MARKET[block.currency];
  return block && market ? { asOf: block.price.date, market } : undefined;
}

export function MarketReadingsView({ ids, known }: { ids: readonly string[]; known?: ReadingsKnownOn }) {
  const readings = ids.flatMap((id) => marketReading(id) ?? []).filter((r) => !known || knownOn(r, known));
  if (!readings.length) return null;
  return (
    <section data-testid="market-readings" data-kind="sourced" aria-label="Market readings" className="mt-3 border-l-2 border-[var(--src-line)] py-2 pl-3 text-sm">
      <p className="text-xs text-[var(--muted)]">Market readings, each from the month it was measured</p>
      <ul className="mt-1 space-y-1">
        {readings.map((r) => (
          <li key={r.id} data-testid="market-reading" data-reading={r.id}>
            {r.label}: <strong className="tabular-nums">{readingValueText(r)}</strong>{" "}
            <span data-testid="reading-date" className="text-xs text-[var(--muted)]">
              ({readingMonth(r.date)})
            </span>{" "}
            <span className="text-xs text-[var(--muted)]">
              Credit:{" "}
              <a data-testid="reading-credit" href={r.sourceUrl} target="_blank" rel="noreferrer" title={r.source} className="underline">
                {r.credit}
                <ArrowUpRight aria-hidden="true" size={12} strokeWidth={1.75} className="inline" />
              </a>
              , <span data-testid="reading-source">{r.source}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
