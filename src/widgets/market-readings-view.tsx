import { ArrowUpRight } from "lucide-react";
import { marketReading, readingMonth, readingValueText } from "@/markets/readings";

// Market readings beside a Workbench's Levers (spec #68, ticket #105; user stories 74 to 76): each yardstick with its
// month and year, its credit and a link to the public source, so a Learner can judge whether a Lever's setting is usual.
// A reading is history from its own month, never "today" (ADR 0013); the sunflower edge marks it as sourced data, as
// Case Data is marked (case-data-view.tsx).

export function MarketReadingsView({ ids }: { ids: readonly string[] }) {
  const readings = ids.flatMap((id) => marketReading(id) ?? []);
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
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
