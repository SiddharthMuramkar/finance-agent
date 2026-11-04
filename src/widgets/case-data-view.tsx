import type { CaseDataset } from "@/case-data/case-data";
import { formatMoney } from "@/finance/calculators";
import { annuityBreakEven, annuityPaymentCount as paymentCount, annuitySchedule, type AnnuityInputs } from "@/finance/present-value";
import { Tag } from "@/app/ui";
import { AnnuityPlot, type AnnuityAxes } from "./annuity-plot";
import { HistoryPlot } from "./history-plot";

// Pure drawings for the widget components. Anything drawn from Case Data carries a "Sourced"
// tag in amber with its source; anything the Learner sets carries a "Your assumption" tag in
// teal. Each is a separate element (data-kind="sourced" | "assumption"), so they never blend.

/** A slider's value as the Widget prints it beside its label, in its unit: 3.38%, 20 years, ₹ or $. */
export function formatUnit(value: number, unit: string | undefined): string {
  if (unit === "percent") return `${value}%`;
  if (unit === "years") return `${value} years`;
  if (unit === "inr") return formatMoney(value, "inr");
  return formatUsd(value);
}

/** Short money format: $1.537 billion, $877.8 million. */
export function formatUsd(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(abs >= 1e10 ? 1 : 3)} billion`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)} million`;
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

/** Money in millions to one decimal, as the annuity Widget's readouts and bars give it: $884.1M. */
export function formatMillions(value: number): string {
  return `${value < 0 ? "-" : ""}$${(Math.abs(value) / 1e6).toFixed(1)}M`;
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
    <details data-testid="credit" className="group inline-block align-baseline text-xs text-[var(--muted)]">
      {/* 24 by 24 px at least, so a finger or a pointer can hit it; the chevron turns when the panel is open. */}
      <summary
        aria-label="Where this figure comes from"
        className="inline-flex min-h-6 min-w-6 cursor-pointer select-none items-center justify-center gap-0.5 rounded px-1 text-sm leading-none hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--ink)]"
      >
        ⓘ
        <svg aria-hidden viewBox="0 0 12 12" className="size-3 transition-transform duration-150 group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4.5 2.5 8 6l-3.5 3.5" />
        </svg>
      </summary>
      <span className="mt-1 block rounded-md border border-[var(--border)] bg-[var(--field)] p-2">
        Source:{" "}
        <a href={dataset.sourceUrl} target="_blank" rel="noreferrer" className="underline">
          {dataset.source}
          <span aria-hidden> ↗</span>
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
export function HistoryFigure({ dataset, revealed, asOf, scale }: { dataset: CaseDataset; revealed: boolean; asOf: string; scale?: "linear" | "log" }) {
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
        format={(v) => shortValue(v, unit)}
        scale={scale}
        points={points.map((p) => ({ date: p.date, value: p.value, text: formatValue(p.value, unit), short: shortValue(p.value, unit) }))}
      />
      <figcaption className="mt-1 text-xs text-[var(--muted)]">
        Range {formatValue(lo, unit)} to {formatValue(hi, unit)}.{!revealed && ` Data after ${asOf} is withheld until the reveal.`}
      </figcaption>
    </figure>
  );
}

/** How close, in percentage points, the rate must come to the break-even before the break-even line shows by itself. */
export const BREAK_EVEN_NEAR = 0.02;

/**
 * The annuity against a sourced cash figure, worked out by code: what it is worth today, the rate at which the two
 * are worth the same (null when no rate gives it), and whether the Learner's rate is within BREAK_EVEN_NEAR of it.
 */
export function annuityAgainstCash(inputs: AnnuityInputs, cash: number) {
  const payments = paymentCount(inputs.payments);
  const worth = annuitySchedule({ ...inputs, payments }).presentValue;
  const breakEven = annuityBreakEven({ total: inputs.total, payments, growthPercent: inputs.growthPercent }, cash);
  const near = breakEven !== null && Math.abs(inputs.ratePercent - breakEven) <= BREAK_EVEN_NEAR + 1e-9;
  return { worth, breakEven, near };
}

/** The verdict line: "At 3.33%, the annuity is worth $6.3M more than the cash", "less" past the break-even. */
export function annuityVerdict(ratePercent: number, worth: number, cash: number): string {
  const gap = worth - cash;
  if (Math.abs(gap) < 50_000) return `At ${ratePercent}%, the annuity and the cash are worth about the same`;
  return `At ${ratePercent}%, the annuity is worth ${formatMillions(Math.abs(gap))} ${gap > 0 ? "more" : "less"} than the cash`;
}

/** The break-even line: "At about 3.38%, the annuity and the cash are worth the same." */
export const breakEvenLine = (breakEven: number) => `At about ${breakEven.toFixed(2)}%, the annuity and the cash are worth the same.`;

/** What the figure adds about the annuity against the sourced cash: the verdict, and the break-even line. */
export type AnnuityCompare = { verdict: boolean; breakEven: boolean };

/** The payments' years along the bottom, labelled every 5 years from the first, on a $ millions axis. */
function yearAxes(firstYear: number, n: number): AnnuityAxes {
  const xMarks = Array.from({ length: n }, (_, index) => index)
    .filter((index) => index % 5 === 0)
    .map((index) => ({ index, text: String(firstYear + index) }));
  return { yName: "$ millions per payment", xName: "Year of payment (the first is paid now)", xMarks };
}

const millions = (value: number) => (value / 1e6).toLocaleString("en-US", { maximumFractionDigits: 1 });

/**
 * The annuity's payments and what each is worth today at the Learner's rate, by the tested formula; optionally
 * beside a sourced Case Data figure (its latest point), with named bars on one scale. With `firstYear` the payments
 * are drawn by year on a $ millions axis, each read "Payment in 2029: $X paid → worth $Y today". `compare` says
 * whether to add the verdict against the sourced figure and the break-even line (both held back until the Insight).
 */
export function AnnuityFigure({ inputs, sourced, firstYear, compare }: { inputs: AnnuityInputs; sourced?: CaseDataset; firstYear?: number; compare?: AnnuityCompare }) {
  const payments = paymentCount(inputs.payments);
  const { rows, presentValue } = annuitySchedule({ ...inputs, payments });
  const maxPayment = Math.max(...rows.map((r) => r.payment));
  const year = typeof firstYear === "number" && Number.isFinite(firstYear) ? firstYear : null;
  const ticks = [0, maxPayment / 2, maxPayment].map((value) => ({ value, text: year !== null ? millions(value) : shortValue(value, "USD") }));
  const bars = rows.map((r) => ({
    payment: r.payment,
    presentValue: r.presentValue,
    read:
      year !== null
        ? `Payment in ${year + r.year}: ${formatMillions(r.payment)} paid → worth ${formatMillions(r.presentValue)} today`
        : `Payment ${r.year + 1}: ${formatUsd(r.payment)} paid, worth ${formatUsd(r.presentValue)} today`,
  }));
  const figure = sourced?.points.at(-1);
  const cash = sourced && figure && sourced.unit === "USD" ? { label: sourced.label, value: figure.value } : null;
  const scale = Math.max(presentValue, cash?.value ?? 0);
  const against = cash ? annuityAgainstCash(inputs, cash.value) : null;
  return (
    <figure className="py-2">
      <AnnuityPlot bars={bars} ticks={ticks} unit={year !== null ? "millions" : "usd"} axes={year !== null ? yearAxes(year, payments) : undefined} />
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
          Worth today at {inputs.ratePercent}%:{" "}
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
        {cash && (
          // Today's value of the payments beside the sourced figure, on one scale, each bar named.
          <div role="group" aria-label={`Worth today compared with ${cash.label}`} className="space-y-1 text-xs tabular-nums">
            <p>Annuity, worth today: {formatMillions(presentValue)}</p>
            <div data-testid="pv-compare-bar" className="h-4 bg-[var(--you)] transition-all duration-150" style={{ width: `${(100 * presentValue) / scale}%` }} />
            <p>
              {cash.label}: {formatMillions(cash.value)}
            </p>
            <div data-testid="sourced-bar" className="h-4 bg-[var(--src)]" style={{ width: `${(100 * cash.value) / scale}%` }} />
          </div>
        )}
        {cash && against && compare?.verdict && (
          <p data-testid="annuity-verdict" className="font-medium">
            {annuityVerdict(inputs.ratePercent, against.worth, cash.value)}
          </p>
        )}
        {against?.breakEven != null && compare?.breakEven && (
          <p data-testid="break-even" className="font-medium">
            {breakEvenLine(against.breakEven)}
          </p>
        )}
      </figcaption>
    </figure>
  );
}
