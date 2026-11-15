"use client";

// The Signal compounding widget (spec §6.4): ₹1,000 at 10% a year, left alone for up to 30 years. The numbers come from
// the merged model (src/finance/signal/compound.ts). Call first: the years slider, its presets and Go deeper (the split
// of growth in two) open with the first chip; every tap runs the years to 30 over 1.2 s.

import { useMemo, useState } from "react";
import { compoundChart, compoundReading, compoundYear, type ReadingSegment } from "@/finance/signal/compound";
import { inr } from "@/finance/signal/formatters";
import { Button } from "@/app/primitives";
import {
  barWidth,
  CallFieldset,
  GoDeeper,
  isOwnCase,
  LockNote,
  px,
  RangeControl,
  TableView,
  topRoundedBar,
  useChartWidth,
  useFirstCall,
  useScriptedRun,
  useTooltip,
  WidgetFoot,
  WidgetHead,
  WidgetShell,
  type SignalOption,
  type SignalWidgetProps,
} from "./parts";

/** The compounding widget's Case (spec A.5). */
export const COMPOUND_CASE = "compounding-1000";

const YEARS = { min: 1, max: 30, step: 1, start: 3 } as const;
const PRESETS = [3, 10, 30] as const;
/** §3.4: the scripted run after the call, 1200 ms to year 30. */
const RUN_MS = 1200;

const OPTIONS: SignalOption[] = [
  { id: "same", label: "Yes, ₹100 every year", verdict: "wrong", feedback: "Year one adds ₹100. Year two adds ₹110, because it earns 10% on the new total of ₹1,100." },
  { id: "more", label: "No, more each year", verdict: "right", feedback: "Year one adds ₹100, year two ₹110, year three ₹121. Each year’s gain is earned on a bigger total." },
  { id: "less", label: "No, less each year", verdict: "wrong", feedback: "It adds more each year: ₹100, then ₹110, then ₹121. Each gain is earned on a bigger total." },
];

const yearsText = (n: number) => (n === 1 ? "1 year" : `${n} years`);

const SEGMENT_CLASS: Record<ReadingSegment["part"], string> = { putIn: "ink", growth: "gain", simple: "gain", onGrowth: "deep" };

/** §6.4.2 chart: 30 columns, a black base of what you put in, then the growth (split in two when asked). */
function Chart({ years, split, compact }: { years: number; split: boolean; compact: boolean }) {
  const { ref, width: W } = useChartWidth(560);
  const tooltip = useTooltip();
  const { columns, max, doublings } = useMemo(() => compoundChart(), []);
  const PH = compact ? 116 : 150;
  const TOP = 22;
  const H = TOP + PH + 22;
  const bottom = TOP + PH;
  const slot = W / columns.length;
  const bw = barWidth(slot);
  const h = (v: number) => (v / max) * PH;
  const baseH = h(1000);

  return (
    <div className="sig-stage" {...tooltip.handlers}>
      <div ref={ref} className="sig-plot">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          role="img"
          aria-label={`Balance each year for 30 years, from ₹1,100 after year 1 to ₹17,449 after year 30. Year ${years} is lit: ${inr(compoundYear(years).balance)}.`}
        >
          <line x1={0} x2={W} y1={bottom} y2={bottom} className="sig-axis" />
          {columns.map((c) => {
            const x = (c.year - 0.5) * slot - bw / 2;
            const growthTop = bottom - baseH - 1;
            const parts = split
              ? [
                  { cls: "sig-f-gain", value: c.simple, top: c.onGrowth <= 0 },
                  { cls: "sig-f-deep", value: c.onGrowth, top: true },
                ]
              : [{ cls: "sig-f-gain", value: c.growth, top: true }];
            let y = growthTop;
            const shapes = parts.map((part, i) => {
              const ph = Math.max(0, h(part.value) - (i > 0 ? 1 : 0));
              y -= ph;
              const d = part.top ? topRoundedBar(x, y, bw, ph) : `M${px(x)},${px(y)}h${px(bw)}v${px(ph)}h${px(-bw)}Z`;
              const shape = d ? <path key={part.cls + i} d={d} className={part.cls} /> : null;
              y -= 1;
              return shape;
            });
            return (
              <g key={c.year} className={c.year > years ? "sig-dim" : undefined} data-year={c.year}>
                <rect x={x} y={bottom - baseH} width={bw} height={baseH} className="sig-f-ink" />
                {shapes}
              </g>
            );
          })}
          {doublings.map((mark) => (
            <text key={mark.label} x={px((mark.year - 0.5) * slot)} y={px(bottom - h(compoundYear(mark.year).balance) - 6)} textAnchor="middle" className="sig-t-mark">
              {mark.label}
            </text>
          ))}
          <text x={0} y={H - 4} className="sig-t-axis">
            Year 1
          </text>
          <text x={W / 2} y={H - 4} textAnchor="middle" className="sig-t-axis">
            Year 15
          </text>
          <text x={W} y={H - 4} textAnchor="end" className="sig-t-axis">
            Year 30
          </text>
          {columns.map((c) => (
            <rect
              key={`hit-${c.year}`}
              x={(c.year - 1) * slot}
              y={TOP}
              width={slot}
              height={PH}
              className="sig-hit"
              data-tip={`Year ${c.year}\nBalance: ${inr(c.balance)}\nAdded this year: ${inr(c.added)}`}
            />
          ))}
        </svg>
      </div>
      {tooltip.element}
    </div>
  );
}

/** §5.15: the whole split into parts; a part prints its amount only when it is wide enough. */
function SegmentedBar({ segments }: { segments: ReadingSegment[] }) {
  const { ref, width } = useChartWidth(480);
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  return (
    <div ref={ref} className="sig-seg" aria-hidden="true">
      {segments.map((s) => {
        const share = s.value / total;
        const fits = share * width >= s.text.length * 8 + 18;
        return (
          <span key={s.part} className={`sig-seg-part sig-seg-${SEGMENT_CLASS[s.part]}`} style={{ flex: `${Math.round(share * 1000)} 1 0` }} title={`${s.label}: ${s.text}`}>
            {fits ? s.text : ""}
          </span>
        );
      })}
    </div>
  );
}

/** The compounding widget: what ₹1,000 grows to at 10% a year, and why each year adds more than the last. */
export function CompoundWidget({ caseSlug, compact = false, onCall, onEvent }: SignalWidgetProps) {
  const [last, setLast] = useState<SignalOption | null>(null);
  const [years, setYears] = useState<number>(YEARS.start);
  const [split, setSplit] = useState(false);
  const fireCall = useFirstCall({ onCall, onEvent });
  const script = useScriptedRun();

  if (!isOwnCase(caseSlug, COMPOUND_CASE)) return null;

  const called = last !== null;
  const reading = compoundReading(years, split);

  function pick(option: SignalOption) {
    setLast(option);
    fireCall({ id: option.id, label: option.label, verdict: option.verdict, feedback: option.feedback });
    // Every tap: the years run to 30 (§6.4.3).
    script.run(years, YEARS.max, RUN_MS, (v) => setYears(Math.round(v)));
  }

  const byHand = (n: number) => {
    script.cancel();
    setYears(Math.min(YEARS.max, Math.max(YEARS.min, Math.round(n))));
  };

  return (
    <WidgetShell kind="compound" caseSlug={COMPOUND_CASE} compact={compact} label="What ₹1,000 grows to at 10% a year">
      {!compact && <WidgetHead right="Everyday money" title="What ₹1,000 grows to at 10% a year" />}

      <CallFieldset question="Does it grow by the same amount every year?" options={OPTIONS} marked={new Set(last ? [last.id] : [])} last={last} onPick={pick} />

      <Chart years={years} split={split} compact={compact} />

      <div className="sig-lockable" data-locked={!called}>
        <RangeControl label="Years it grows" value={years} min={YEARS.min} max={YEARS.max} step={YEARS.step} text={yearsText(years)} disabled={!called} onChange={byHand} />
        <div className="sig-presets">
          {PRESETS.map((n) => (
            <Button key={n} unstyled className="sig-btn sig-btn-quiet sig-btn-sm" disabled={!called} onClick={() => byHand(n)}>
              {yearsText(n)}
            </Button>
          ))}
        </div>
        {!called && <LockNote>Make your call to unlock the years.</LockNote>}
      </div>

      <div className="sig-reading">
        <p className="sig-big">{reading.balance}</p>
        <SegmentedBar segments={reading.segments} />
        <p className="sig-verdict" aria-live="polite">
          after {reading.yearsText}. Growth added <b>{reading.growth}</b>, and year {years} alone added <b>{reading.added}</b>.
          {reading.split && (
            <>
              {" "}
              Of that growth, <b>{reading.split.simple}</b> was earned on your ₹1,000 and <b>{reading.split.onGrowth}</b> on earlier growth.
            </>
          )}
        </p>
      </div>

      <GoDeeper open={called} title="Split the growth in two.">
        <p>Some of the growth is earned on the ₹1,000 you put in. The rest is earned on growth you already had.</p>
        <div className="sig-chips">
          <Button unstyled className="sig-chip" pressed={split} onClick={() => setSplit((s) => !s)}>
            {split ? "Growth is split" : "Split the growth"}
          </Button>
        </div>
      </GoDeeper>

      <WidgetFoot
        keys={
          split
            ? [
                { swatch: "ink", label: "What you put in" },
                { swatch: "gain", label: "Earned on your ₹1,000" },
                { swatch: "deep", label: "Earned on earlier growth" },
              ]
            : [
                { swatch: "ink", label: "What you put in" },
                { swatch: "gain", label: "Growth" },
              ]
        }
        source="Worked example from the Topic. No outside figures."
        table={
          !compact && called ? (
            <TableView
              label="Balance by year"
              head={["Year", "Balance", "Added that year"]}
              rows={compoundChart().columns.map((c) => [String(c.year), inr(c.balance), inr(c.added)])}
            />
          ) : undefined
        }
      />
    </WidgetShell>
  );
}
