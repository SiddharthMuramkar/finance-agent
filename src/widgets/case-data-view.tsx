import type { CaseDataset } from "@/case-data/case-data";
import { annuitySchedule, type AnnuityInputs } from "@/finance/present-value";
import { Tag } from "@/app/ui";
import { HistoryPlot } from "./history-plot";

// Pure drawings for the widget components. Anything drawn from Case Data carries a "Sourced"
// tag in amber with its source; anything the Learner sets carries a "Your assumption" tag in
// teal. Each is a separate element (data-kind="sourced" | "assumption"), so they never blend.

/** Short money format: $1.537 billion, $877.8 million. */
export function formatUsd(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(abs >= 1e10 ? 1 : 3)} billion`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)} million`;
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

/** A Case Data value in its dataset's unit. */
export function formatValue(value: number, unit: string): string {
  if (unit === "USD") return formatUsd(value);
  if (unit === "percent") return `${value.toFixed(2)}%`;
  return `${value.toLocaleString("en-US")} ${unit}`;
}

export function AssumptionTag() {
  return <Tag kind="you" />;
}

export function SourcedTag({ children = "Sourced" }: { children?: string }) {
  return <Tag kind="src">{children}</Tag>;
}

/** A sourced figure's credit, folded behind a small ⓘ that opens on click; the amber around it still marks the data as real. */
export function Credit({ dataset }: { dataset: CaseDataset }) {
  return (
    <details data-testid="credit" className="inline-block align-baseline text-xs text-[var(--muted)]">
      <summary aria-label="Where this figure comes from" className="inline-block cursor-pointer select-none rounded px-1 text-sm leading-none">
        ⓘ
      </summary>
      <span className="mt-1 block">
        Source:{" "}
        <a href={dataset.sourceUrl} target="_blank" rel="noreferrer" className="underline">
          {dataset.source}
        </a>
      </span>
    </details>
  );
}

const percentUnit = (unit: string) => unit === "percent" || unit.startsWith("percent ");

/** A value as a short chart label in its unit, rounded for reading: 3.38%, $877.8m, 4,467. A point read gives it in full. */
function shortValue(value: number, unit: string): string {
  const abs = Math.abs(value);
  const round = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: v >= 1000 ? 0 : v >= 100 ? 1 : 2 });
  const sign = value < 0 ? "-" : "";
  if (unit === "USD") {
    if (abs >= 1e9) return `${sign}$${round(abs / 1e9)}bn`;
    if (abs >= 1e6) return `${sign}$${round(abs / 1e6)}m`;
    return `${sign}$${round(abs)}`;
  }
  return `${sign}${round(abs)}${percentUnit(unit) ? "%" : ""}`;
}

/**
 * A dataset drawn as a line over its dates, with value and date axes, its values printed when there are
 * few, and a readout of the point hovered, tapped or focused: sourced history only, with no Learner input.
 */
export function HistoryFigure({ dataset, revealed, asOf }: { dataset: CaseDataset; revealed: boolean; asOf: string }) {
  const { points, unit } = dataset;
  const values = points.map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const ticks = (hi === lo ? [lo] : [lo, (lo + hi) / 2, hi]).map((value) => ({ value, text: shortValue(value, unit) }));
  return (
    <figure data-kind="sourced" className="my-2 rounded-md border-l-4 border-[var(--src-line)] bg-[var(--src-tint)] p-3">
      {/* A div, not a p: the credit is a <details>, which a paragraph may not hold. */}
      <div className="mb-1 text-sm">
        <SourcedTag>Sourced history</SourcedTag> {dataset.label} <Credit dataset={dataset} />
      </div>
      <HistoryPlot
        label={`${dataset.label}, ${points[0].date} to ${points.at(-1)!.date}`}
        // Money and percentages carry their unit in each label; any other unit is named once above the axis.
        unit={unit === "USD" || percentUnit(unit) ? undefined : unit}
        ticks={ticks}
        points={points.map((p) => ({ date: p.date, value: p.value, text: formatValue(p.value, unit), short: shortValue(p.value, unit) }))}
      />
      <figcaption className="mt-1 text-xs text-[var(--muted)]">
        Range {formatValue(lo, unit)} to {formatValue(hi, unit)}.{!revealed && ` Data after ${asOf} is withheld until the reveal.`}
      </figcaption>
    </figure>
  );
}

/**
 * The annuity's payments and what each is worth today at the Learner's rate, by the tested
 * formula; optionally beside a sourced Case Data figure (its latest point), on one scale.
 */
export function AnnuityFigure({ inputs, sourced }: { inputs: AnnuityInputs; sourced?: CaseDataset }) {
  const payments = Math.max(1, Math.min(60, Math.round(inputs.payments)));
  const { rows, presentValue } = annuitySchedule({ ...inputs, payments });
  const maxPayment = Math.max(...rows.map((r) => r.payment));
  const w = 600;
  const h = 180;
  const bar = w / rows.length;
  const y = (v: number) => h - (v / maxPayment) * (h - 10);
  const figure = sourced?.points.at(-1);
  const scale = Math.max(inputs.total, figure?.value ?? 0);
  return (
    <figure className="py-2">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Annuity payments and their present value" className="w-full">
        {rows.map((r) => (
          <g key={r.year}>
            <rect x={r.year * bar + 1} y={y(r.payment)} width={bar - 2} height={h - y(r.payment)} className="fill-[var(--data)]" />
            <rect
              data-testid="pv-bar"
              x={r.year * bar + 1}
              y={y(r.presentValue)}
              width={bar - 2}
              height={h - y(r.presentValue)}
              className="fill-[var(--you)] transition-all duration-150 "
            />
          </g>
        ))}
      </svg>
      <figcaption className="mt-2 space-y-2 text-sm">
        <p className="flex flex-wrap gap-x-4 text-xs text-[var(--muted)]">
          <span>
            <span className="mr-1 inline-block size-2 bg-[var(--data)]" />
            Payment in its year
          </span>
          <span>
            <span className="mr-1 inline-block size-2 bg-[var(--you)]" />
            Worth today at {inputs.ratePercent}%
          </span>
        </p>
        <p>
          Sum of payments: <span className="tabular-nums">{formatUsd(inputs.total)}</span>
        </p>
        <p data-kind="assumption" className="rounded-md border-l-4 border-[var(--you-line)] bg-[var(--you-tint)] p-2">
          <AssumptionTag />
          Present value at {inputs.ratePercent}%:{" "}
          <strong data-testid="pv-total" className="tabular-nums">
            {formatUsd(presentValue)}
          </strong>
        </p>
        {sourced && figure && (
          <div data-kind="sourced" className="rounded-md border-l-4 border-[var(--src-line)] bg-[var(--src-tint)] p-2">
            <SourcedTag />
            {sourced.label}: <strong className="tabular-nums">{formatValue(figure.value, sourced.unit)}</strong>{" "}
            <span className="text-xs text-[var(--muted)]">({figure.date})</span> <Credit dataset={sourced} />
          </div>
        )}
        {sourced && figure && sourced.unit === "USD" && (
          // Today's value of the payments beside the sourced figure, on one scale.
          <svg viewBox="0 0 600 44" role="img" aria-label={`Present value compared with ${sourced.label}`} className="w-full">
            <rect data-testid="pv-compare-bar" x={0} y={2} height={18} width={(600 * presentValue) / scale} className="fill-[var(--you)] transition-all duration-150 " />
            <rect data-testid="sourced-bar" x={0} y={24} height={18} width={(600 * figure.value) / scale} className="fill-[var(--src)]" />
          </svg>
        )}
      </figcaption>
    </figure>
  );
}
