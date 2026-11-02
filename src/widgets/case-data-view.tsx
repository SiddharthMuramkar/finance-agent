import type { CaseDataset } from "@/case-data/case-data";
import { annuitySchedule, type AnnuityInputs } from "@/finance/present-value";

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

const tag = "mr-1 inline-block rounded px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide";

export function AssumptionTag() {
  return <span className={`${tag} bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-200`}>Your assumption</span>;
}

export function SourcedTag({ children = "Sourced" }: { children?: string }) {
  return <span className={`${tag} bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200`}>{children}</span>;
}

function Credit({ dataset }: { dataset: CaseDataset }) {
  return (
    <span className="text-xs text-stone-500 dark:text-stone-400">
      Source:{" "}
      <a href={dataset.sourceUrl} target="_blank" rel="noreferrer" className="underline">
        {dataset.source}
      </a>
    </span>
  );
}

/** A dataset drawn as a line over its dates: sourced history only, with no Learner input. */
export function HistoryFigure({ dataset, revealed, asOf }: { dataset: CaseDataset; revealed: boolean; asOf: string }) {
  const { points } = dataset;
  const w = 600;
  const h = 160;
  const pad = 8;
  const values = points.map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const x = (i: number) => (points.length === 1 ? w / 2 : pad + (i * (w - 2 * pad)) / (points.length - 1));
  const y = (v: number) => (hi === lo ? h / 2 : h - pad - ((v - lo) / (hi - lo)) * (h - 2 * pad));
  const first = points[0];
  const last = points.at(-1)!;
  return (
    <figure data-kind="sourced" className="my-2 rounded-md border-l-4 border-amber-500 bg-amber-50/50 p-3 dark:border-amber-400 dark:bg-amber-950/20">
      <p className="mb-1 text-sm">
        <SourcedTag>Sourced history</SourcedTag> {dataset.label}
      </p>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${dataset.label}, ${first.date} to ${last.date}`} className="w-full">
        <polyline
          points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")}
          fill="none"
          strokeWidth={2}
          className="stroke-amber-600 dark:stroke-amber-400"
        />
        {points.map((p, i) => (
          <circle key={p.date} data-testid="history-point" cx={x(i)} cy={y(p.value)} r={points.length > 60 ? 1 : 2.5} className="fill-amber-600 dark:fill-amber-400">
            <title>{`${p.date}: ${formatValue(p.value, dataset.unit)}`}</title>
          </circle>
        ))}
      </svg>
      <figcaption className="mt-1 space-y-1 text-sm">
        <p className="flex justify-between tabular-nums">
          <span>
            {first.date}: {formatValue(first.value, dataset.unit)}
          </span>
          <span>
            {last.date}: {formatValue(last.value, dataset.unit)}
          </span>
        </p>
        <p className="text-xs text-stone-500 dark:text-stone-400">
          Range {formatValue(lo, dataset.unit)} to {formatValue(hi, dataset.unit)}.
          {!revealed && ` Data after ${asOf} is withheld until the reveal.`}
        </p>
        <Credit dataset={dataset} />
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
            <rect x={r.year * bar + 1} y={y(r.payment)} width={bar - 2} height={h - y(r.payment)} className="fill-stone-300 dark:fill-stone-700" />
            <rect
              data-testid="pv-bar"
              x={r.year * bar + 1}
              y={y(r.presentValue)}
              width={bar - 2}
              height={h - y(r.presentValue)}
              className="fill-teal-700 transition-all duration-150 dark:fill-teal-400"
            />
          </g>
        ))}
      </svg>
      <figcaption className="mt-2 space-y-2 text-sm">
        <p className="flex flex-wrap gap-x-4 text-xs text-stone-500 dark:text-stone-400">
          <span>
            <span className="mr-1 inline-block size-2 bg-stone-300 dark:bg-stone-700" />
            Payment in its year
          </span>
          <span>
            <span className="mr-1 inline-block size-2 bg-teal-700 dark:bg-teal-400" />
            Worth today at {inputs.ratePercent}%
          </span>
        </p>
        <p>
          Sum of payments: <span className="tabular-nums">{formatUsd(inputs.total)}</span>
        </p>
        <p data-kind="assumption" className="rounded-md border-l-4 border-teal-600 bg-teal-50/50 p-2 dark:border-teal-400 dark:bg-teal-950/20">
          <AssumptionTag />
          Present value at {inputs.ratePercent}%:{" "}
          <strong data-testid="pv-total" className="tabular-nums">
            {formatUsd(presentValue)}
          </strong>
        </p>
        {sourced && figure && (
          <div data-kind="sourced" className="rounded-md border-l-4 border-amber-500 bg-amber-50/50 p-2 dark:border-amber-400 dark:bg-amber-950/20">
            <p>
              <SourcedTag />
              {sourced.label}: <strong className="tabular-nums">{formatValue(figure.value, sourced.unit)}</strong>{" "}
              <span className="text-xs text-stone-500 dark:text-stone-400">({figure.date})</span>
            </p>
            <Credit dataset={sourced} />
          </div>
        )}
        {sourced && figure && sourced.unit === "USD" && (
          // Today's value of the payments beside the sourced figure, on one scale.
          <svg viewBox="0 0 600 44" role="img" aria-label={`Present value compared with ${sourced.label}`} className="w-full">
            <rect data-testid="pv-compare-bar" x={0} y={2} height={18} width={(600 * presentValue) / scale} className="fill-teal-700 transition-all duration-150 dark:fill-teal-400" />
            <rect data-testid="sourced-bar" x={0} y={24} height={18} width={(600 * figure.value) / scale} className="fill-amber-600 dark:fill-amber-400" />
          </svg>
        )}
      </figcaption>
    </figure>
  );
}
