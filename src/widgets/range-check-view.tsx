import { ArrowUpRight } from "lucide-react";
import type { RangeFlag } from "@/markets/range-check";

// The range check on screen (spec #68, ticket #109; user story 83): each Own Case input far from its industry's
// figure, named in one sentence that quotes the yardstick it was held against with its month and year, and a link to its
// source. It never calls a value right or wrong (spec voice rule 7); a Learner reads it as a prompt to look again at the
// annual report. The sunflower edge marks sourced data, as MarketReadingsView and Case Data do.

export function RangeCheckView({ flags }: { flags: readonly RangeFlag[] }) {
  if (!flags.length) return null;
  return (
    <section data-testid="range-check" data-kind="sourced" aria-label="Range check" className="mt-3 border-l-2 border-[var(--src-line)] py-2 pl-3 text-sm">
      <p className="text-xs text-[var(--muted)]">Far from the industry&apos;s figure</p>
      <ul className="mt-1 space-y-2">
        {flags.map((f) => (
          <li key={f.input} data-testid="range-flag" data-input={f.input} data-side={f.side}>
            <span data-testid="range-sentence">{f.sentence}</span>{" "}
            <span className="text-xs text-[var(--muted)]">
              Source:{" "}
              <a data-testid="range-source" href={f.yardstick.sourceUrl} target="_blank" rel="noreferrer" title={f.yardstick.credit} className="underline">
                {f.yardstick.source}
                <ArrowUpRight aria-hidden="true" size={12} strokeWidth={1.75} className="inline" />
              </a>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
