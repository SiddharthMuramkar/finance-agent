"use client";

// The Signal jackpot widget (spec §6.3): Kerala's 2024 Thiruvonam Bumper prize, ₹25 crore paid at once, against the same
// ₹25 crore paid as 30 yearly payments. The numbers come from the merged model (src/finance/signal/jackpot.ts). Call
// first: the rate slider, its presets, the pills and Go deeper open with the first chip; every tap runs the rate to 5%
// over 900 ms. "Break-even found" turns on only for a rate the learner sets by hand (the scripted run starts at the
// same-valued 0%, which does not count) and stays for the session.

import { useId, useMemo, useState } from "react";
import { Button } from "@/app/primitives";
import { inrCr } from "@/finance/signal/formatters";
import { breakEvenFound, JACKPOT, jackpotAt, type JackpotAtRate, type RateSource } from "@/finance/signal/jackpot";
import {
  barWidth,
  CallFieldset,
  GoDeeper,
  isOwnCase,
  LockNote,
  Pill,
  RangeControl,
  snapTo,
  TableView,
  topRoundedBar,
  useChartWidth,
  useFirstCall,
  useScriptedRun,
  useTooltip,
  WidgetFoot,
  WidgetHead,
  WidgetShell,
  percent,
  type SignalOption,
  type SignalWidgetProps,
} from "./parts";

/** The jackpot widget's Example (spec A.1). */
export const JACKPOT_CASE = "kerala-bumper-2024";

const TITLE = "Is ₹25 crore over 30 years worth ₹25 crore?";
const RATE = { min: 0, max: 10, step: 0.05 } as const;
const PRESETS = [0, 5, 10] as const;
/** The ordinary rate the call runs to, and how long the run takes (§3.4). */
const TEACHING_RATE = 5;
const RUN_MS = 900;
/** ₹2 crore a year is the full plot height. */
const SCALE_TOP = 2;

const OPTIONS: SignalOption[] = [
  {
    id: "payments",
    label: "The 30 payments",
    verdict: "wrong",
    feedback: "Only if money earned nothing. At an ordinary 5% a year the 30 payments are worth about ₹11.29 crore today, less than half the ₹25 crore paid at once.",
  },
  { id: "cash", label: "The cash", verdict: "right", feedback: "At an ordinary 5% a year the 30 payments are worth about ₹11.29 crore today. That is ₹13.71 crore less than the cash." },
  { id: "same", label: "About the same", verdict: "careful", pill: "Close", feedback: "They match only at 0%, when money earns nothing. At an ordinary 5%, the cash is worth more." },
];

/** §6.3.2 chart: each payment as paid (hatched) and its worth today (green), on a ₹2 crore scale. */
function Chart({ at, compact }: { at: JackpotAtRate; compact: boolean }) {
  const { ref, width: W } = useChartWidth(560);
  const tooltip = useTooltip();
  const pattern = `sig-hatch-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const PH = compact ? 116 : 150;
  const TOP = 22;
  const H = TOP + PH + 22;
  const bottom = TOP + PH;
  const slot = W / at.columns.length;
  const bw = barWidth(slot);
  const h = (v: number) => (v / SCALE_TOP) * PH;
  const first = at.columns[0];
  const final = at.columns[at.columns.length - 1];

  return (
    <div className="sig-stage" {...tooltip.handlers}>
      <div ref={ref} className="sig-plot">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          role="img"
          aria-label={`30 yearly payments from ${first.year} to ${final.year}, rising from ${inrCr(first.paid)} to ${inrCr(final.paid)} as paid. At ${percent(at.ratePercent)} they are worth ${inrCr(at.sum)} today.`}
        >
          <defs>
            <pattern id={pattern} width={5} height={5} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width={5} height={5} className="sig-hatch-bg" />
              <line x1={0} y1={0} x2={0} y2={5} className="sig-hatch-line" />
            </pattern>
          </defs>
          <line x1={0} x2={W} y1={TOP} y2={TOP} className="sig-axis" />
          <text x={0} y={TOP - 6} className="sig-t-axis">
            ₹2 crore a year
          </text>
          {at.columns.map((c, i) => {
            const x = (i + 0.5) * slot - bw / 2;
            return (
              <g key={c.year} data-year={c.year}>
                <path d={topRoundedBar(x, bottom - h(c.paid), bw, h(c.paid))} fill={`url(#${pattern})`} className="sig-f-hatch" />
                <path d={topRoundedBar(x, bottom - h(c.worthToday), bw, h(c.worthToday))} className="sig-f-gain" />
              </g>
            );
          })}
          <line x1={0} x2={W} y1={bottom} y2={bottom} className="sig-axis" />
          <text x={0} y={H - 4} className="sig-t-axis">
            {first.year}
          </text>
          <text x={W / 2} y={H - 4} textAnchor="middle" className="sig-t-axis">
            {at.columns[14].year}
          </text>
          <text x={W} y={H - 4} textAnchor="end" className="sig-t-axis">
            {final.year}
          </text>
          {at.columns.map((c, i) => (
            <rect key={`hit-${c.year}`} x={i * slot} y={TOP} width={slot} height={PH} className="sig-hit" data-tip={`${c.year}\nPaid: ${inrCr(c.paid)}\nWorth today: ${inrCr(c.worthToday)}`} />
          ))}
        </svg>
      </div>
      {tooltip.element}
    </div>
  );
}

/** A meter row's pill (§6.3.3): "≈ Same" on both rows, or "✓ Worth more" on the row worth more. */
function RowPill({ at, row }: { at: JackpotAtRate; row: "payments" | "cash" }) {
  if (at.same)
    return (
      <Pill tone="wait" icon="approx">
        Same
      </Pill>
    );
  if (at.worthMore !== row) return null;
  return (
    <Pill tone="gain" icon="check">
      Worth more
    </Pill>
  );
}

/** The jackpot widget: is ₹25 crore paid over 30 years worth the ₹25 crore Kerala paid at once? */
export function JackpotWidget({ caseSlug, compact = false, onCall, onEvent }: SignalWidgetProps) {
  const [last, setLast] = useState<SignalOption | null>(null);
  const [rate, setRate] = useState<number>(RATE.min);
  const [found, setFound] = useState(false);
  const fireCall = useFirstCall({ onCall, onEvent });
  const script = useScriptedRun();
  const at = useMemo(() => jackpotAt(rate), [rate]);
  const fivePercent = useMemo(() => jackpotAt(TEACHING_RATE), []);

  if (!isOwnCase(caseSlug, JACKPOT_CASE)) return null;

  const called = last !== null;
  const rateText = rate.toFixed(2);

  /** Sets the rate; only a rate set by hand can find the break-even (spec §6.3.3). */
  function moveRate(value: number, source: RateSource) {
    const next = snapTo(value, RATE.min, RATE.max, RATE.step);
    setRate(next);
    const nowFound = breakEvenFound(found, jackpotAt(next), source);
    if (nowFound && !found) {
      setFound(true);
      onEvent?.({ type: "milestone", id: "break_even_found" });
    }
  }

  function pick(option: SignalOption) {
    setLast(option);
    fireCall({ id: option.id, label: option.label, verdict: option.verdict, feedback: option.feedback });
    script.run(rate, TEACHING_RATE, RUN_MS, (v) => moveRate(v, "script"));
  }

  const byHand = (value: number) => {
    script.cancel();
    moveRate(value, "hand");
  };

  const away = inrCr(Math.abs(at.d));

  return (
    <WidgetShell kind="jackpot" caseSlug={JACKPOT_CASE} compact={compact} label={TITLE}>
      {!compact && (
        <WidgetHead
          right="Oct 2024"
          title={TITLE}
          sub={
            <>
              Kerala paid its 2024 Thiruvonam Bumper prize of <b>₹25 crore</b> at once. Paid the American way, the same <b>₹25 crore</b> would come as 30
              yearly payments.
            </>
          }
        />
      )}

      <CallFieldset question="At an ordinary interest rate, which is worth more?" options={OPTIONS} marked={new Set(last ? [last.id] : [])} last={last} onPick={pick} />

      <Chart at={at} compact={compact} />

      <div className="sig-lockable" data-locked={!called}>
        <RangeControl label="Interest rate" value={rate} {...RATE} text={percent(rate)} disabled={!called} onChange={byHand} />
        <div className="sig-presets">
          {PRESETS.map((p) => (
            <Button key={p} unstyled className="sig-btn sig-btn-quiet sig-btn-sm" disabled={!called} onClick={() => byHand(p)}>
              {p}%
            </Button>
          ))}
        </div>
        {!called && <LockNote>Make your call to unlock the rate.</LockNote>}
      </div>

      <div className="sig-reading">
        <div className="sig-meter">
          <div data-row="payments">
            <div className="sig-meter-top">
              <span>
                30 payments, worth today {called && <RowPill at={at} row="payments" />}
              </span>
              <output>{inrCr(at.sum)}</output>
            </div>
            <div className="sig-track" aria-hidden="true">
              <span className="sig-fill" style={{ width: `${(at.sum / JACKPOT.advertisedTotal) * 100}%` }} />
              <span className="sig-ghost" style={{ width: `${((JACKPOT.advertisedTotal - at.sum) / JACKPOT.advertisedTotal) * 100}%` }} />
            </div>
          </div>
          <div data-row="cash">
            <div className="sig-meter-top">
              <span>Cash today {called && <RowPill at={at} row="cash" />}</span>
              <output>{inrCr(JACKPOT.cash)}</output>
            </div>
            <div className="sig-track" aria-hidden="true">
              <span className="sig-fill" style={{ width: `${(JACKPOT.cash / JACKPOT.advertisedTotal) * 100}%` }} />
            </div>
          </div>
        </div>
        <p className="sig-verdict" aria-live="polite">
          {!called ? (
            <>
              Added up as paid, the 30 payments come to <b>{inrCr(JACKPOT.advertisedTotal)}</b>, the same as the prize paid at once.
            </>
          ) : at.same ? (
            <>At {rateText}%, the payments and the cash are worth about the same today.</>
          ) : (
            <>
              At {rateText}%, the payments are worth{" "}
              <b>
                {away} {at.d > 0 ? "more" : "less"}
              </b>{" "}
              than the cash.
            </>
          )}
        </p>
      </div>

      <GoDeeper open={called} title="Find the rate where the two are worth the same.">
        {found ? (
          <p data-found="true">
            <Pill tone="wait" icon="approx">
              Break-even found
            </Pill>{" "}
            At <b>0%</b> a year the two are worth the same. At any rate above it, the cash is worth more.
          </p>
        ) : (
          <p>
            You are <b>{away}</b> away.{at.same ? "" : at.d < 0 ? " Try a lower rate." : " Try a higher rate."}
          </p>
        )}
      </GoDeeper>

      <WidgetFoot
        keys={[
          { swatch: "gain", label: "Worth in today’s money" },
          { swatch: "hatch", label: "Lost by waiting" },
          { swatch: "wait", label: "About the same" },
        ]}
        source="Source: The Hindu, 9 Oct 2024. The 30 payments are a what-if: they rise 5% a year and the first is paid at once."
        table={
          !compact && called ? (
            <TableView
              label="The 30 payments"
              head={["Year", "Paid", "Worth today at 5%"]}
              rows={fivePercent.columns.map((c) => [String(c.year), inrCr(c.paid), inrCr(c.worthToday)])}
            />
          ) : undefined
        }
      />
    </WidgetShell>
  );
}
