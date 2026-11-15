"use client";

// The Signal jackpot widget (spec §6.3): the 2018 Mega Millions prize, 30 payments against the cash. The numbers come from
// the merged model (src/finance/signal/jackpot.ts). Call first: the rate slider, its presets, the pills and Go deeper open
// with the first chip; every tap runs the rate to 5% over 900 ms. "Break-even found" turns on only for a rate the learner
// sets by hand (a scripted run through 3.4% does not count) and stays for the session.

import { useId, useMemo, useState } from "react";
import { Button } from "@/app/primitives";
import { usdM } from "@/finance/signal/formatters";
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

/** The jackpot widget's Case (spec A.1). */
export const JACKPOT_CASE = "mega-millions-2018";

const RATE = { min: 0, max: 10, step: 0.05 } as const;
const PRESETS = [0, 5, 10] as const;
/** The ordinary rate the call runs to, and how long the run takes (§3.4). */
const TEACHING_RATE = 5;
const RUN_MS = 900;
/** $100M a year is the full plot height. */
const SCALE_TOP = 100;

const OPTIONS: SignalOption[] = [
  {
    id: "payments",
    label: "The 30 payments",
    verdict: "wrong",
    feedback: "Only at very low rates. At an ordinary 5% a year the payments are worth about $694M today, less than the $877.8M in cash.",
  },
  { id: "cash", label: "The cash", verdict: "right", feedback: "At an ordinary 5% a year the 30 payments are worth about $694M today. That is $184M less than the cash." },
  { id: "same", label: "About the same", verdict: "careful", pill: "Close", feedback: "They match only at about 3.4% a year. At an ordinary 5%, the cash is worth more." },
];

/** §6.3.2 chart: each payment as paid (hatched) and its worth today (green), on a $100M scale. */
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

  return (
    <div className="sig-stage" {...tooltip.handlers}>
      <div ref={ref} className="sig-plot">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          role="img"
          aria-label={`30 yearly payments from 2018 to 2047, rising from $23.1M to $95.2M as paid. At ${percent(at.ratePercent)} they are worth ${usdM(at.sum)} today.`}
        >
          <defs>
            <pattern id={pattern} width={5} height={5} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width={5} height={5} className="sig-hatch-bg" />
              <line x1={0} y1={0} x2={0} y2={5} className="sig-hatch-line" />
            </pattern>
          </defs>
          <line x1={0} x2={W} y1={TOP} y2={TOP} className="sig-axis" />
          <text x={0} y={TOP - 6} className="sig-t-axis">
            $100M a year
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
            2018
          </text>
          <text x={W / 2} y={H - 4} textAnchor="middle" className="sig-t-axis">
            2032
          </text>
          <text x={W} y={H - 4} textAnchor="end" className="sig-t-axis">
            2047
          </text>
          {at.columns.map((c, i) => (
            <rect key={`hit-${c.year}`} x={i * slot} y={TOP} width={slot} height={PH} className="sig-hit" data-tip={`${c.year}\nPaid: ${usdM(c.paid)}\nWorth today: ${usdM(c.worthToday)}`} />
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

/** The jackpot widget: is a $1.537B jackpot paid over 30 years worth $1.537B today? */
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

  const away = usdM(Math.abs(at.d));

  return (
    <WidgetShell kind="jackpot" caseSlug={JACKPOT_CASE} compact={compact} label="Is a $1.537B jackpot really worth $1.537B?">
      {!compact && (
        <WidgetHead
          right="Oct 2018"
          title="Is a $1.537B jackpot really worth $1.537B?"
          sub={
            <>
              The 2018 Mega Millions winner could take 30 yearly payments that add up to <b>$1.537B</b>, or <b>$877.8M</b> in cash that day.
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
              <output>{usdM(at.sum)}</output>
            </div>
            <div className="sig-track" aria-hidden="true">
              <span className="sig-fill" style={{ width: `${(at.sum / JACKPOT.advertisedTotal) * 100}%` }} />
              <span className="sig-ghost" style={{ width: `${((JACKPOT.advertisedTotal - at.sum) / JACKPOT.advertisedTotal) * 100}%` }} />
            </div>
          </div>
          <div data-row="cash">
            <div className="sig-meter-top">
              <span>Cash today {called && <RowPill at={at} row="cash" />}</span>
              <output>{usdM(JACKPOT.cash)}</output>
            </div>
            <div className="sig-track" aria-hidden="true">
              <span className="sig-fill" style={{ width: `${(JACKPOT.cash / JACKPOT.advertisedTotal) * 100}%` }} />
            </div>
          </div>
        </div>
        <p className="sig-verdict" aria-live="polite">
          {!called ? (
            <>
              Added up as advertised, the 30 payments come to <b>{usdM(JACKPOT.advertisedTotal)}</b>. That is the number on the billboard.
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
            At about <b>3.4%</b> a year the two are worth the same. Above that rate the cash is worth more. Below it, the payments are.
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
        source="Source: CNBC, 24 Oct 2018. Payments rise 5% a year; the first is paid at once."
        table={
          !compact && called ? (
            <TableView
              label="The 30 payments"
              head={["Year", "Paid", "Worth today at 5%"]}
              rows={fivePercent.columns.map((c) => [String(c.year), usdM(c.paid), usdM(c.worthToday)])}
            />
          ) : undefined
        }
      />
    </WidgetShell>
  );
}
