"use client";

// The Signal four levers widget (spec §6.2): Amazon in February 2000. Every number comes from the levers model
// (src/finance/signal/levers.ts), which runs the one valuation engine on Case amazon-dcf-2000 (decision #18), so this card,
// the Topic Workbench and the Tutor say the same values. The widget has no right answer: the call is the first lever move
// or preset tap, which opens Go deeper and fires onCall.

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/app/primitives";
import { d$, share, trim } from "@/finance/signal/formatters";
import {
  LEVERS,
  leverBand,
  leverEffects,
  leversModel,
  PRESETS,
  PRICE,
  REFERENCE,
  REFERENCE_VALUE,
  snapLever,
  type Lever,
  type LeverKey,
  type Levers,
  type LeversResult,
  type PresetKey,
} from "@/finance/signal/levers";
import { GoDeeper, isOwnCase, Pill, TableView, useFirstCall, WidgetFoot, WidgetHead, WidgetShell, type SignalWidgetProps } from "./parts";

/** The levers widget's Case (spec A.2). */
export const LEVERS_CASE = "amazon-2000";

/** The value ruler runs from $0 to twice the price, so the price sits dead centre (§6.2.2). */
const RULER_MAX = PRICE * 2;
const pos = (v: number) => Math.min(1, Math.max(0, v / RULER_MAX)) * 100;
/** A lever's knob height from the bottom of its track, as a share of the track (§6.2.2 geometry). */
const P = (lever: Lever, value: number) => 0.08 + 0.84 * ((value - lever.min) / (lever.max - lever.min));
/** An effect under 50 cents shows no pill and no band. */
const SMALL = 0.5;

/** A lever's value as its slider shows it: `$39 billion`, `12.5%`, `$3.00`, `12.84%` (dollars in words, as the site writes them). */
export function leverText(key: LeverKey, value: number): string {
  if (key === "rev") return `$${trim(value, 0)} billion`;
  if (key === "margin") return `${trim(value, 1)}%`;
  if (key === "s2c") return `$${value.toFixed(2)}`;
  return `${value.toFixed(2)}%`;
}

const SPOKEN: Record<LeverKey, (v: number) => string> = {
  rev: (v) => `${trim(v, 0)} billion dollars`,
  margin: (v) => `${trim(v, 1)} percent`,
  s2c: (v) => `${trim(v, 2)} dollars of sales`,
  wacc: (v) => `${trim(v, 2)} percent`,
};

/** What a screen reader hears for a lever (§6.2.2): "Operating margin once mature 12 percent, adds 17 dollars a share". */
export function leverSpoken(lever: Lever, value: number, effect: number): string {
  const whole = Math.round(Math.abs(effect));
  const change = Math.abs(effect) < SMALL ? "no change from the published Story" : `${effect > 0 ? "adds" : "takes away"} ${whole} ${whole === 1 ? "dollar" : "dollars"} a share`;
  return `${lever.label} ${SPOKEN[lever.key](value)}, ${change}`;
}

/** The top line's sub-line (§6.2.2). */
export function subLine(v: number): string {
  if (Math.round(v) >= PRICE) return `Worth the $${PRICE} price, on this story.`;
  if (v <= 0) return "Less than it owes, on this story.";
  return `${Math.round((v / PRICE) * 100)}% of the $${PRICE} price.`;
}

/** One vertical lever (§6.2.2): mouse drags from anywhere on the track, touch from the knob, keys through a hidden range. */
function LeverControl({
  lever,
  value,
  effect,
  enabled,
  compact,
  onChange,
  onCommit,
  onDragging,
}: {
  lever: Lever;
  value: number;
  effect: number;
  enabled: boolean;
  compact: boolean;
  onChange: (value: number) => void;
  /** The learner let go: pointer up, a tap, or a key. Carries the value it landed on. */
  onCommit: (value: number) => void;
  onDragging: (on: boolean) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; moved: boolean; tapOnly: boolean; last: number } | null>(null);
  const id = `sig-lever-${lever.key}`;
  const h = P(lever, value);
  const r = P(lever, REFERENCE[lever.key]);
  const low = Math.min(h, r);
  const tone = effect >= SMALL ? "is-gain" : effect <= -SMALL ? "is-loss" : null;

  const valueAt = (clientY: number) => {
    const box = track.current!.getBoundingClientRect();
    const n = Math.min(1, Math.max(0, ((box.bottom - clientY) / box.height - 0.08) / 0.84));
    return snapLever(lever.key, lever.min + n * (lever.max - lever.min));
  };

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!enabled) return;
    const onKnob = (e.target as Element).closest?.(".sig-lever-knob");
    // Touch drags only from the knob, so the page still scrolls over a lever; a tap on the track sets the value.
    if (e.pointerType === "touch" && !onKnob) {
      drag.current = { startY: e.clientY, moved: false, tapOnly: true, last: value };
      return;
    }
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const next = valueAt(e.clientY);
    drag.current = { startY: e.clientY, moved: false, tapOnly: false, last: next };
    onDragging(true);
    onChange(next);
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    if (Math.abs(e.clientY - d.startY) > 8) d.moved = true;
    if (d.tapOnly) return;
    d.last = valueAt(e.clientY);
    onChange(d.last);
  };
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (!d.tapOnly) {
      onDragging(false);
      onCommit(d.last);
    } else if (!d.moved) {
      const next = valueAt(e.clientY);
      onChange(next);
      onCommit(next);
    }
  };

  return (
    <div className="sig-lever" data-lever={lever.key} data-enabled={enabled ? "true" : "false"} style={enabled ? undefined : { opacity: 0.45 }}>
      <div>
        <div className="sig-lever-value">{leverText(lever.key, value)}</div>
        <div className="sig-lever-unit">{lever.label}</div>
      </div>
      <div
        ref={track}
        className="sig-lever-track"
        // The drawn lever is the drag target (its range input is the keyboard's and the screen reader's way in), so while
        // it is live its pointer is meant: the affordance audit lets it show one. A lever that is off shows none.
        data-allow-pointer={enabled ? "" : undefined}
        style={compact ? { height: 140 } : undefined}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => {
          drag.current = null;
          onDragging(false);
        }}
        aria-hidden="true"
      >
        <span className="sig-lever-fill sig-lever-base" style={{ bottom: 0, height: `${low * 100}%` }} />
        {tone && <span className={`sig-lever-fill sig-lever-delta ${tone}${h < r ? " is-missing" : ""}`} style={{ bottom: `${low * 100}%`, height: `${Math.abs(h - r) * 100}%` }} />}
        <span className="sig-lever-notch" style={{ bottom: `${r * 100}%` }} />
        {enabled && <span className="sig-lever-knob" style={{ bottom: `${h * 100}%` }} />}
      </div>
      <label className="sig-lever-name" htmlFor={id}>
        {lever.name}
      </label>
      <input
        id={id}
        className="range-you sig-sr"
        type="range"
        min={lever.min}
        max={lever.max}
        step={lever.step}
        value={value}
        disabled={!enabled}
        aria-valuetext={leverSpoken(lever, value, effect)}
        onChange={(e) => {
          const next = snapLever(lever.key, Number(e.currentTarget.value));
          onChange(next);
          onCommit(next);
        }}
      />
      {Math.abs(effect) < SMALL ? (
        <span className="sig-pill sig-pill-ghost" aria-hidden="true">
          $0
        </span>
      ) : (
        <Pill tone={effect > 0 ? "gain" : "loss"} icon={effect > 0 ? "up" : "down"}>
          {d$(effect)}
        </Pill>
      )}
    </div>
  );
}

/** The value ruler (§6.2.2): $0 to $168, the price pin at the centre, his story's notch, your dot. */
function ValueRuler({ value, band }: { value: number; band: { lo: number; hi: number } | null }) {
  const at = pos(value);
  const ref = pos(REFERENCE_VALUE);
  return (
    <div className="sig-ruler" aria-hidden="true">
      {band ? (
        <>
          <span className="sig-ruler-net is-band-loss" style={{ left: `${pos(band.lo)}%`, width: `${ref - pos(band.lo)}%` }} />
          <span className="sig-ruler-net is-band-gain" style={{ left: `${ref}%`, width: `${pos(band.hi) - ref}%` }} />
        </>
      ) : (
        Math.abs(at - ref) > 0 && <span className={`sig-ruler-net ${value >= REFERENCE_VALUE ? "is-gain" : "is-loss"}`} style={{ left: `${Math.min(at, ref)}%`, width: `${Math.abs(at - ref)}%` }} />
      )}
      <span className="sig-ruler-pin" style={{ left: "50%" }} />
      <span className="sig-ruler-pin-label" style={{ left: "50%" }}>
        <b>${PRICE}</b>
        Price paid, 3 Feb 2000
      </span>
      <span className="sig-ruler-notch" style={{ left: `${ref}%` }} />
      <span className="sig-ruler-notch-label" style={{ left: `${ref}%` }}>
        Published {share(REFERENCE_VALUE)}
      </span>
      <span className="sig-ruler-dot" style={{ left: `${at}%` }} data-value-dot>
        {value > RULER_MAX ? "›" : ""}
      </span>
      <span className="sig-ruler-end" style={{ left: 0 }}>
        $0
      </span>
      <span className="sig-ruler-end" style={{ right: 0 }}>
        ${RULER_MAX}
      </span>
    </div>
  );
}

/**
 * The lever lab (§6.2.2), the shared stage of the levers widget and the home scroll story. It must sit inside a Signal
 * widget shell (.sig-w) for its look. `focus` enables one lever and dims the rest; `band` shades what one lever can do alone.
 */
export function LeverLab({
  values,
  live = true,
  focus = null,
  band = null,
  compact = false,
  onChange,
}: {
  values: Levers;
  live?: boolean;
  focus?: LeverKey | null;
  band?: LeverKey | null;
  compact?: boolean;
  onChange?: (key: LeverKey, value: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [announce, setAnnounce] = useState("");
  const model = useMemo(() => leversModel(values), [values]);
  const effects = useMemo(() => leverEffects(values), [values]);
  const bandRange = useMemo(() => (band ? leverBand(band) : null), [band]);
  const v = model.perShare;

  return (
    <div className={`sig-lab${dragging ? " dragging" : ""}`} data-dragging={dragging ? "true" : undefined}>
      <div className="sig-lab-top">
        <div>
          <div className="sig-lab-label">This Story is worth</div>
          <div className="sig-lab-value" data-value>
            {share(v)}
          </div>
        </div>
        <p className="sig-lab-sub">{subLine(v)}</p>
      </div>
      <ValueRuler value={v} band={bandRange} />
      <div className="sig-levers">
        {LEVERS.map((lever) => (
          <LeverControl
            key={lever.key}
            lever={lever}
            value={values[lever.key]}
            effect={effects[lever.key]}
            enabled={live && (focus === null || focus === lever.key)}
            compact={compact}
            onChange={(next) => onChange?.(lever.key, next)}
            onCommit={(landed) => setAnnounce(`This Story is worth ${share(leversModel({ ...values, [lever.key]: landed }).perShare)} a share.`)}
            onDragging={setDragging}
          />
        ))}
      </div>
      <p className="sig-sr" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}

/**
 * The home scroll story's stage (spec §7.2.3): the lever lab in a widget shell, with no head, presets, Go deeper or foot.
 * The page drives it step by step: `live` false for the opening (no lever draggable), `focus` and `band` for one lever's
 * step, all four live for "Your turn".
 */
export function LeverStage({
  values,
  live = true,
  focus = null,
  band = null,
  onChange,
}: {
  values: Levers;
  live?: boolean;
  focus?: LeverKey | null;
  band?: LeverKey | null;
  onChange?: (key: LeverKey, value: number) => void;
}) {
  return (
    <WidgetShell kind="levers-story" caseSlug={LEVERS_CASE} compact={false} label="The lever lab: Amazon, February 2000">
      <LeverLab values={values} live={live} focus={focus} band={band} onChange={onChange} />
    </WidgetShell>
  );
}

/** Go deeper's year strip (§6.2.3): ten bars around a zero line, in dollars a share today. */
function YearStrip({ flows }: { flows: number[] }) {
  const biggest = Math.max(0.2, ...flows.map(Math.abs));
  const slot = 300 / flows.length;
  return (
    <svg className="sig-strip" viewBox="0 0 300 72" role="img" aria-label={`Cash each year, in today’s money: ${flows.map((f, i) => `year ${i + 1} ${d$(f)}`).join(", ")}.`}>
      <line x1={0} x2={300} y1={28} y2={28} className="sig-axis" />
      {flows.map((f, i) => {
        const height = Math.max(1, (Math.abs(f) / biggest) * 26);
        return (
          <rect key={i} x={i * slot + slot * 0.22} y={f >= 0 ? 28 - height : 28} width={slot * 0.56} height={height} className={f >= 0 ? "sig-f-gain" : "sig-f-loss"} data-flow={i + 1}>
            <title>{`Year ${i + 1}: ${f < 0 ? "−" : "+"}$${Math.abs(f).toFixed(2)} a share`}</title>
          </rect>
        );
      })}
      <text x={0} y={70} className="sig-t-axis">
        Year 1
      </text>
      <text x={300} y={70} textAnchor="end" className="sig-t-axis">
        Year 10
      </text>
    </svg>
  );
}

type BridgeRow = { label: string; from: number; to: number; tone: "is-gain" | "is-loss" | "is-blue"; text: string; total?: boolean };

/** The bridge's rows (§6.2.3): years 1 to 10, everything after, what it owes, and your story a share. */
export function bridgeRows(m: LeversResult): BridgeRow[] {
  const afterTen = m.yrs + m.after;
  return [
    { label: "Cash from years 1 to 10", from: 0, to: m.yrs, tone: m.yrs >= 0 ? "is-gain" : "is-loss", text: d$(m.yrs) },
    { label: "Everything after year 10", from: m.yrs, to: afterTen, tone: "is-gain", text: d$(m.after) },
    { label: "What it owes others", from: afterTen, to: afterTen - m.owes, tone: "is-loss", text: d$(-m.owes) },
    { label: "This Story, a share", from: 0, to: m.perShare, tone: "is-blue", text: share(m.perShare), total: true },
  ];
}

/** A horizontal waterfall in dollars a share, with zero and the $84 price marked through every row. */
function Bridge({ m }: { m: LeversResult }) {
  const rows = bridgeRows(m);
  const lo = Math.min(0, m.perShare, ...rows.flatMap((r) => [r.from, r.to]));
  const hi = Math.max(PRICE * 1.1, m.perShare, ...rows.flatMap((r) => [r.from, r.to]));
  const X = (v: number) => ((v - lo) / (hi - lo)) * 100;
  return (
    <div className="sig-bridge">
      {rows.map((row) => (
        <div key={row.label} className={`sig-bridge-row${row.total ? " is-total" : ""}`} data-bridge={row.label}>
          <span>{row.label}</span>
          <div className="sig-bridge-bar" aria-hidden="true">
            <span className={`sig-bridge-seg ${row.tone}`} style={{ left: `${X(Math.min(row.from, row.to))}%`, width: `${Math.max(0.6, Math.abs(X(row.to) - X(row.from)))}%` }} />
            <span className="sig-bridge-zero" style={{ left: `${X(0)}%` }} />
            <span className="sig-bridge-price" style={{ left: `${X(PRICE)}%` }} />
          </div>
          <output>{row.text}</output>
        </div>
      ))}
    </div>
  );
}

/** The note on the far future (§6.2.3). */
function FarFuture({ tvShare }: { tvShare: number | null }) {
  if (tvShare === null || tvShare <= 0) return null;
  const pct = <b>{Math.round(tvShare * 100)}%</b>;
  if (tvShare > 1)
    return (
      <p data-far-future>
        <Pill tone="wait" icon="alert">
          Careful
        </Pill>{" "}
        {pct} of this business’s value arrives after year 10. The first ten years burn cash, so the far future carries the whole number.
      </p>
    );
  return <p data-far-future>{pct} of this business’s value arrives after year 10.</p>;
}

/** The levers widget: what is Amazon worth in February 2000, on a story told in four numbers? */
export function LeversWidget({ caseSlug, compact = false, onCall, onEvent }: SignalWidgetProps) {
  const [values, setValues] = useState<Levers>(REFERENCE);
  const [called, setCalled] = useState(false);
  const reached = useRef(false);
  const fireCall = useFirstCall({ onCall, onEvent });
  const model = useMemo(() => leversModel(values), [values]);

  if (!isOwnCase(caseSlug, LEVERS_CASE)) return null;

  const v = model.perShare;
  const atReference = Math.abs(v - REFERENCE_VALUE) < SMALL;
  const reachedNow = Math.round(v) >= PRICE;

  function commit(next: Levers, call: { id: string; label: string }) {
    setValues(next);
    if (fireCall({ ...call, verdict: null, feedback: "" })) setCalled(true);
    const hits = Math.round(leversModel(next).perShare) >= PRICE;
    if (hits && !reached.current) onEvent?.({ type: "milestone", id: "reached_price", rev: next.rev, margin: next.margin });
    reached.current = hits;
  }

  const moveLever = (key: LeverKey, value: number) => {
    if (value === values[key]) return;
    commit({ ...values, [key]: value }, { id: key, label: LEVERS.find((l) => l.key === key)!.name });
  };
  const preset = (key: PresetKey) => commit({ ...PRESETS[key].levers }, { id: key, label: PRESETS[key].label });

  const difference = Math.round(v - REFERENCE_VALUE);

  return (
    <WidgetShell kind="levers" caseSlug={LEVERS_CASE} compact={compact} label="Four levers. What is Amazon worth?">
      {!compact && <WidgetHead right="Feb 2000" title="Four levers. What is Amazon worth?" />}

      <LeverLab values={values} compact={compact} onChange={moveLever} />

      <div className="sig-presets">
        {(Object.keys(PRESETS) as PresetKey[]).map((key) => (
          <Button key={key} unstyled className="sig-btn sig-btn-quiet sig-btn-sm" onClick={() => preset(key)}>
            {PRESETS[key].label}
          </Button>
        ))}
      </div>

      <p className="sig-verdict" aria-live="polite">
        {atReference ? (
          <>
            This is one published valuation: <b>{share(REFERENCE_VALUE)}</b> a share, against a price of <b>${PRICE}</b>. Drag any lever to test it.
          </>
        ) : reachedNow ? (
          <>
            <Pill tone="blue" icon="check">
              You reached the price
            </Pill>{" "}
            To reach the ${PRICE} price, Amazon needs {leverText("rev", values.rev)} of sales in year 10 and a margin of {leverText("margin", values.margin)}. Would you have believed that in 2000?
          </>
        ) : (
          <>
            This Story is worth{" "}
            <b>
              ${Math.abs(difference)} {difference > 0 ? "more" : "less"}
            </b>{" "}
            than the published one. The pills under each lever show where that came from.
          </>
        )}
      </p>

      <GoDeeper open={called} title="Where the value comes from" lockedText="Opens after you move a lever.">
        <p className="sig-src">Cash each year, in today’s money. Red years burn it, green years make it.</p>
        <YearStrip flows={model.flowsPerShare} />
        <Bridge m={model} />
        <p className="sig-src">The thin black line is the ${PRICE} price.</p>
        <FarFuture tvShare={model.tvShare} />
      </GoDeeper>

      <WidgetFoot
        keys={[
          { swatch: "blue", label: "You: drag these" },
          { swatch: "gain", label: "Adds value to the published Story" },
          { swatch: "loss", label: "Takes value away" },
          { swatch: "ref", label: "The published Story" },
          { swatch: "pin", label: "Price paid" },
        ]}
        source="Damodaran’s valuation of Amazon, Feb 2000, on the course’s tested valuation engine. It reproduces his $35.08 within 2%."
        link={{ name: "Damodaran’s valuation of Amazon, Feb 2000", href: "https://pages.stern.nyu.edu/~adamodar/pdfiles/papers/HighGrow.pdf" }}
        table={
          !compact && called ? (
            <TableView
              label="Where the value comes from"
              head={["Part", "Dollars a share"]}
              rows={[
                ...model.flowsPerShare.map((f, i) => [`Year ${i + 1}`, `${f < 0 ? "−" : "+"}$${Math.abs(f).toFixed(2)}`]),
                ...bridgeRows(model).map((row) => [row.label, row.text]),
              ]}
            />
          ) : undefined
        }
      />
    </WidgetShell>
  );
}
