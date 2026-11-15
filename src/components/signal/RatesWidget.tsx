"use client";

// The Signal rates widget (spec §6.5, "One move, three sizes"), built from prototype A (origin/prototype-rates-react) on
// the merged model (src/finance/signal/rates.ts). Call first (§1.1 rule 3): the chips are live at once; the slider, the
// three sizes of the move, the ruler ticks, Go deeper and the table open after the first tap. Before the call the rulers
// show no ticks and a "?" (decision #5: five ticks of "5%" would give away "25%").

import { useMemo, useState } from "react";
import { trim } from "@/finance/signal/formatters";
import { rateMove, rateMoveReadouts } from "@/finance/signal/rates";
import {
  CallFieldset,
  GoDeeper,
  isOwnCase,
  LockNote,
  Pill,
  RangeControl,
  snapTo,
  TableView,
  useChartWidth,
  useFirstCall,
  WidgetFoot,
  WidgetHead,
  WidgetShell,
  percent,
  type SignalOption,
  type SignalWidgetProps,
} from "./parts";

/** The rates widget's Case (spec A.4). */
export const RATES_CASE = "rates-up-1";

/** §8.2 ranges: the old rate (Go deeper) 1 to 8 in 0.25 steps; the new rate 2 to 7 in 0.05 steps. */
export const RATE_RANGES = {
  old: { min: 1, max: 8, step: 0.25 },
  new: { min: 2, max: 7, step: 0.05 },
} as const;

/** The Case's move and its call (§6.5.2), copy as the spec writes it. */
const CASE = {
  old: 4,
  new: 5,
  question: "Which of these describe the move correctly? Tap each one you believe.",
  options: [
    {
      id: "literal",
      label: "Up 1%",
      verdict: "careful",
      feedback: "1% of 4% is only 0.04 points, which would make the new rate 4.04%. Writers often say “up 1%” when they mean 1 point.",
    },
    { id: "points", label: "Up 1 percentage point", verdict: "right", feedback: "5 minus 4 is 1 point. Traders call the same move 100 basis points." },
    { id: "relative", label: "Up 25%", verdict: "right", feedback: "1 point is a quarter of the old 4%, so the rate itself grew by 25%." },
  ] satisfies SignalOption[],
};

/**
 * Where a ruler's ticks fall, in rate percent: from the old rate outward every `unit` points, with the new rate as the last
 * tick. Null when there is no move, or when the count would exceed 60 (§6.5.2).
 */
export function rulerTicks(oldRate: number, points: number, unit: number): number[] | null {
  if (points === 0 || !(unit > 0)) return null;
  const count = Math.abs(points) / unit;
  if (count > 60 + 1e-9) return null;
  const whole = Math.floor(count + 1e-9);
  const sign = Math.sign(points);
  const ticks = Array.from({ length: whole + 1 }, (_, i) => oldRate + sign * i * unit);
  const end = oldRate + points;
  if (Math.abs(ticks[ticks.length - 1] - end) > 1e-9) ticks.push(end);
  return ticks;
}

/** "1 point", "1.5 points". */
const pointsWord = (points: number) => (Math.abs(points) === 1 ? "1 point" : `${trim(Math.abs(points), 2)} points`);

type Move = ReturnType<typeof rateMove> & { o: number; n: number };

/** The headline words for this move: "Up 1%". */
const headline = (m: Move) => `${m.points > 0 ? "Up" : "Down"} ${trim(Math.abs(m.points), 2)}%`;

const H = 262;
const LINE_Y = 58;
const RULERS: { y: number; label: string; unit: (m: Move) => number; value: (m: Move) => string }[] = [
  { y: 112, label: "In percentage points", unit: () => 1, value: (m) => (m.points === 0 ? "no move" : pointsWord(m.points)) },
  { y: 152, label: "In basis points, 10 to a tick", unit: () => 0.1, value: (m) => `${Math.abs(m.basisPoints)} bp` },
  { y: 192, label: "As a percent of the old rate, 5% to a tick", unit: (m) => 0.05 * m.o, value: (m) => `${trim(Math.abs(m.percentOfOld ?? 0), 2)}%` },
];

/** §5.8 and §6.5.2: the stage, drawn at the real pixel width of its plot box. */
function Stage({ m, called }: { m: Move; called: boolean }) {
  const { ref, width: W } = useChartWidth(560);
  const X = (v: number) => 14 + ((v - 1) / 7) * (W - 28);
  const anchor = (x: number) => (x < 60 ? "start" : x > W - 60 ? "end" : "middle");
  const xo = X(m.o);
  const xn = X(m.n);
  const trap = called && m.literal ? { xt: X(m.literal.target), label: `“${headline(m)}”, read literally`, value: `${trim(m.literal.points, 3)} pt` } : null;
  const label = called
    ? `Rate line from 1% to 8%. Old rate ${percent(m.o)}, new rate ${percent(m.n)}. The move is ${RULERS.map((r) => r.value(m)).join(", ")}.${
        trap ? ` Read literally, ${headline(m).toLowerCase()} is ${trap.value}.` : ""
      }`
    : `Rate line from 1% to 8%. Old rate ${percent(m.o)}, new rate ${percent(m.n)}. The sizes of the move show after your call.`;

  return (
    <div className="sig-stage">
      <div ref={ref} className="sig-plot">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={label}>
          <line x1={X(1)} x2={X(8)} y1={LINE_Y} y2={LINE_Y} className="sig-axis" strokeWidth={1.5} />
          {[1, 2, 3, 4, 5, 6, 7, 8].map((v) => (
            <g key={v}>
              <line x1={X(v)} x2={X(v)} y1={LINE_Y - 4} y2={LINE_Y + 4} className="sig-axis" />
              <text x={X(v)} y={LINE_Y + 24} textAnchor="middle" className="sig-t-axis">
                {v}%
              </text>
            </g>
          ))}
          {xo !== xn && <rect x={Math.min(xo, xn)} y={LINE_Y - 6} width={Math.abs(xn - xo)} height={12} rx={6} className="sig-r-gap" />}
          <circle cx={xo} cy={LINE_Y} r={6} className="sig-r-old" />
          <circle cx={xn} cy={LINE_Y} r={8} className="sig-r-new" />
          <text x={xo} y={LINE_Y - 14} textAnchor={anchor(xo)} className="sig-r-t-old">
            Old {percent(m.o)}
          </text>
          <text x={xn} y={LINE_Y - 32} textAnchor={anchor(xn)} className="sig-r-t-new">
            New {percent(m.n)}
          </text>

          {RULERS.map((r) => {
            const ticks = called ? rulerTicks(m.o, m.points, r.unit(m)) : null;
            return (
              <g key={r.y} data-ruler={r.label}>
                <text x={14} y={r.y} className="sig-t-axis">
                  {r.label}
                </text>
                <text x={W - 14} y={r.y} textAnchor="end" className={called ? "sig-t-value" : "sig-t-faint"} data-ruler-value>
                  {called ? r.value(m) : "?"}
                </text>
                {called && xo !== xn && <line x1={xo} x2={xn} y1={r.y + 11} y2={r.y + 11} className="sig-r-rule" />}
                {ticks?.map((t, i) => (
                  <line key={i} x1={X(t)} x2={X(t)} y1={r.y + 6} y2={r.y + 16} className="sig-r-tick" data-tick strokeWidth={i === 0 || i === ticks.length - 1 ? 2 : 1} />
                ))}
              </g>
            );
          })}

          {trap && (
            <g data-trap>
              <text x={14} y={232} className="sig-r-t-trap">
                {trap.label}
              </text>
              <text x={W - 14} y={232} textAnchor="end" className="sig-r-t-trapv">
                {trap.value}
              </text>
              <rect x={Math.min(xo, trap.xt)} y={238} width={Math.max(2.5, Math.abs(trap.xt - xo))} height={9} rx={2} className="sig-r-trapbar" />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}

/** The rates widget: one move from an old rate to a new one, in points, basis points and a percent of the old rate. */
export function RatesWidget({ caseSlug, compact = false, onCall, onEvent }: SignalWidgetProps) {
  const [marked, setMarked] = useState<ReadonlySet<string>>(new Set());
  const [last, setLast] = useState<SignalOption | null>(null);
  const [rates, setRates] = useState({ old: CASE.old, new: CASE.new });
  const fireCall = useFirstCall({ onCall, onEvent });
  const m: Move = useMemo(() => ({ ...rateMove(rates.old, rates.new), o: rates.old, n: rates.new }), [rates]);

  if (!isOwnCase(caseSlug, RATES_CASE)) return null;

  const called = last !== null;
  const readouts = rateMoveReadouts(rates.old, rates.new);
  const caseMove = rateMove(CASE.old, CASE.new);

  function pick(option: SignalOption) {
    setMarked((prev) => new Set(prev).add(option.id)); // multi-select: every tapped chip stays marked (§5.7)
    setLast(option);
    fireCall({ id: option.id, label: option.label, verdict: option.verdict, feedback: option.feedback });
  }

  const setRate = (key: "old" | "new") => (value: number) => {
    const r = RATE_RANGES[key];
    setRates((prev) => ({ ...prev, [key]: snapTo(value, r.min, r.max, r.step) }));
  };

  return (
    <WidgetShell kind="rates" caseSlug={RATES_CASE} compact={compact} label="One move, three sizes">
      {!compact && (
        <WidgetHead
          right="The news"
          title="One move, three sizes"
          sub={
            <>
              A rate goes from <b>{trim(CASE.old, 2)}%</b> to <b>{trim(CASE.new, 2)}%</b>.
            </>
          }
        />
      )}

      <CallFieldset question={CASE.question} options={CASE.options} marked={marked} last={last} onPick={pick} />

      <Stage m={m} called={called} />

      <div className="sig-lockable" data-locked={!called}>
        <RangeControl label="New rate" value={rates.new} {...RATE_RANGES.new} text={percent(rates.new)} disabled={!called} onChange={setRate("new")} />
        {!called && <LockNote>Tap an answer to unlock the rate.</LockNote>}
      </div>

      {called && (
        <div className="sig-reading">
          <dl className="sig-facts">
            <div>
              <dt>How far it moved</dt>
              <dd>{readouts.howFar}</dd>
            </div>
            <div>
              <dt>How traders say it</dt>
              <dd>{readouts.traders}</dd>
            </div>
            <div>
              <dt>Next to the old rate</dt>
              <dd>{readouts.nextToOld}</dd>
            </div>
          </dl>
          <p className="sig-verdict" aria-live="polite">
            {m.literal && (
              <>
                <Pill tone="wait" icon="alert">
                  Careful
                </Pill>{" "}
                Read literally, “{headline(m).toLowerCase()}” is {trim(Math.abs(m.points), 2)}% of the old {trim(m.o, 2)}%: a move of only{" "}
                <b>{trim(m.literal.points, 3)} points</b>, to {trim(m.literal.target, 3)}%.
              </>
            )}
          </p>
        </div>
      )}

      <GoDeeper open={called} title="Change where the rate starts.">
        <p>The same {trim(Math.abs(caseMove.points), 2)}-point move is a bigger percent of a low rate and a smaller percent of a high one.</p>
        <RangeControl label="Old rate" value={rates.old} {...RATE_RANGES.old} text={percent(rates.old)} onChange={setRate("old")} />
      </GoDeeper>

      <WidgetFoot
        keys={[
          { swatch: "blue", label: "The move you set" },
          { swatch: "ink", label: "The old rate" },
          { swatch: "wait", label: "“Up 1%”, read literally" },
        ]}
        source="Worked example from the Topic. No outside figures."
        table={
          !compact && called ? (
            <TableView
              label="The move in numbers"
              head={["Measure", "Value"]}
              rows={[
                ["Old rate", percent(m.o)],
                ["New rate", percent(m.n)],
                ["Percentage points", readouts.howFar],
                ["Basis points", readouts.traders],
                ["Percent of the old rate", readouts.nextToOld],
                ["Literal reading", m.literal ? `${trim(m.literal.points, 3)} pt, to ${trim(m.literal.target, 3)}%` : "none"],
              ]}
            />
          ) : undefined
        }
      />
    </WidgetShell>
  );
}
