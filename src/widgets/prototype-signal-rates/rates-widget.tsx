"use client";

// PROTOTYPE (wayfinder #5, prototype A): throwaway. The Signal "rates" widget (spec §6.5, "one move, three sizes") as a
// FIXED React component. The Tutor never writes UI: it sends a call ({ widget, dataset, mode, state, illustration }),
// the server clamps it (rates-call.ts), and this tested code draws it. Shell order follows §5.6. Call first (§1.1
// rule 3): the chips are live at once; the slider, the sizes of the move, Go deeper and the table open after the
// first tap. Colour tokens (§3.1) are local to `.sig-rates`; globals.css is not touched.

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { Button } from "@/app/primitives";
import type { RatesCall } from "./rates-call";
import {
  RANGES,
  RATES_DATASETS,
  callOptions,
  headline,
  pointsWord,
  ratesModel,
  readouts,
  round2,
  rulerTicks,
  trapSentence,
  trim,
  type CallOption,
  type OptionId,
  type RatesModel,
  type RatesState,
  type Verdict,
} from "./rates-model";

/** What the widget tells the Tutor (§8.3). `state` is debounced and sent only after the learner stops moving. */
export type RatesEvent = { type: "call"; optionId: OptionId; verdict: Verdict } | { type: "layer2_open" } | { type: "state"; state: RatesState };

type IconName = "check" | "cross" | "alert" | "lock";
const PATHS: Record<Exclude<IconName, "lock">, string> = {
  check: "M3 8.5l3.2 3.2L13 5",
  cross: "M4 4l8 8M12 4l-8 8",
  alert: "M8 3v6.2M8 12.6v.2",
};

function Icon({ name }: { name: IconName }) {
  return (
    <svg className="r-ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {name === "lock" ? (
        <>
          <rect x={3.5} y={7} width={9} height={6.5} rx={1.5} />
          <path d="M5.5 7V5.2a2.5 2.5 0 015 0V7" />
        </>
      ) : (
        <path d={PATHS[name]} />
      )}
    </svg>
  );
}

const VERDICT: Record<Verdict, { word: string; tone: "gain" | "loss" | "wait"; icon: IconName }> = {
  right: { word: "Right", tone: "gain", icon: "check" },
  wrong: { word: "Not quite", tone: "loss", icon: "cross" },
  careful: { word: "Careful", tone: "wait", icon: "alert" },
};

function Pill({ verdict }: { verdict: Verdict }) {
  const v = VERDICT[verdict];
  return (
    <span className={`r-pill r-pill-${v.tone}`}>
      <Icon name={v.icon} />
      {v.word}
    </span>
  );
}

const H = 262;
const LINE_Y = 58;
const RULERS: { y: number; label: string; unit: (m: RatesModel) => number; value: (m: RatesModel) => string }[] = [
  { y: 112, label: "In percentage points", unit: () => 1, value: (m) => (m.dir === "none" ? "no move" : pointsWord(m.pts)) },
  { y: 152, label: "In basis points, 10 to a tick", unit: () => 0.1, value: (m) => `${Math.abs(m.bp)} bp` },
  { y: 192, label: "As a percent of the old rate, 5% to a tick", unit: (m) => 0.05 * m.o, value: (m) => `${trim(Math.abs(m.rel))}%` },
];

/** §5.8 + §6.5.2: the stage, drawn at the real pixel width of its plot box and redrawn on resize. */
function Stage({ m, called }: { m: RatesModel; called: boolean }) {
  const plot = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(560);
  useEffect(() => {
    const el = plot.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const next = Math.round(el.getBoundingClientRect().width);
      if (next > 0) setW((prev) => (prev === next ? prev : next));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const X = (v: number) => 14 + ((v - 1) / 7) * (W - 28);
  const anchor = (x: number) => (x < 60 ? "start" : x > W - 60 ? "end" : "middle");
  const xo = X(m.o);
  const xn = X(m.n);
  const trap = m.dir === "none" ? null : { xt: X(m.target), label: `“${headline(m)}”, read literally`, value: `${trim(m.literal, 3)} pt` };
  const label = called
    ? `Rate line from 1% to 8%. Old rate ${m.o.toFixed(2)}%, new rate ${m.n.toFixed(2)}%. The move is ${RULERS.map((r) => r.value(m)).join(", ")}.${trap ? ` Read literally, ${headline(m).toLowerCase()} is ${trap.value}.` : ""}`
    : `Rate line from 1% to 8%. Old rate ${m.o.toFixed(2)}%, new rate ${m.n.toFixed(2)}%. The sizes of the move show after your call.`;

  return (
    <div className="r-stage">
      <div ref={plot} className="r-plot">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={label}>
          <line x1={X(1)} x2={X(8)} y1={LINE_Y} y2={LINE_Y} className="r-axis" />
          {[1, 2, 3, 4, 5, 6, 7, 8].map((v) => (
            <g key={v}>
              <line x1={X(v)} x2={X(v)} y1={LINE_Y - 4} y2={LINE_Y + 4} className="r-axis" />
              <text x={X(v)} y={LINE_Y + 24} textAnchor="middle" className="r-t-axis">
                {v}%
              </text>
            </g>
          ))}
          {xo !== xn && <rect x={Math.min(xo, xn)} y={LINE_Y - 6} width={Math.abs(xn - xo)} height={12} rx={6} className="r-gap" />}
          <circle cx={xo} cy={LINE_Y} r={6} className="r-old" />
          <circle cx={xn} cy={LINE_Y} r={8} className="r-new" />
          <text x={xo} y={LINE_Y - 14} textAnchor={anchor(xo)} className="r-t-old">
            Old {m.o.toFixed(2)}%
          </text>
          <text x={xn} y={LINE_Y - 32} textAnchor={anchor(xn)} className="r-t-new">
            New {m.n.toFixed(2)}%
          </text>

          {RULERS.map((r) => {
            const ticks = called ? rulerTicks(m, r.unit(m)) : null;
            return (
              <g key={r.y}>
                <text x={14} y={r.y} className="r-t-label">
                  {r.label}
                </text>
                <text x={W - 14} y={r.y} textAnchor="end" className={called ? "r-t-value" : "r-t-hidden"}>
                  {called ? r.value(m) : "?"}
                </text>
                {called && xo !== xn && <line x1={xo} x2={xn} y1={r.y + 11} y2={r.y + 11} className="r-rule" />}
                {ticks?.map((t, i) => (
                  <line key={i} x1={X(t)} x2={X(t)} y1={r.y + 6} y2={r.y + 16} className="r-tick" strokeWidth={i === 0 || i === ticks.length - 1 ? 2 : 1} />
                ))}
              </g>
            );
          })}

          {called && trap && (
            <g>
              <text x={14} y={232} className="r-t-trap">
                {trap.label}
              </text>
              <text x={W - 14} y={232} textAnchor="end" className="r-t-trapv">
                {trap.value}
              </text>
              <rect x={Math.min(xo, trap.xt)} y={238} width={Math.max(2.5, Math.abs(trap.xt - xo))} height={9} rx={2} className="r-trapbar" />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}

function Range({ label, value, range, disabled, onChange }: { label: string; value: number; range: { min: number; max: number; step: number }; disabled: boolean; onChange: (v: number) => void }) {
  const id = useId();
  const p = ((value - range.min) / (range.max - range.min)) * 100;
  return (
    <div>
      <div className="r-range-top">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{value.toFixed(2)}%</output>
      </div>
      <input
        id={id}
        className="r-range"
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(round2(Number(e.target.value)))}
        style={{ "--p": `${p}%` } as CSSProperties}
      />
    </div>
  );
}

function Glyph() {
  return (
    <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true" fill="currentColor">
      <rect x="0" y="6" width="2.5" height="6" rx="1" />
      <rect x="3.8" y="3" width="2.5" height="9" rx="1" />
      <rect x="7.6" y="0" width="2.5" height="12" rx="1" />
      <rect x="11.4" y="4" width="2.5" height="8" rx="1" />
    </svg>
  );
}

export function RatesWidget({ call, onEvent }: { call: RatesCall; onEvent?: (e: RatesEvent) => void }) {
  const ds = RATES_DATASETS[call.dataset];
  const facts = call.state; // the call is about the state the Tutor opened at; it never changes after mount
  const options = useMemo(() => callOptions(facts), [facts]);
  const [picked, setPicked] = useState<Partial<Record<OptionId, true>>>({});
  const [last, setLast] = useState<CallOption | null>(null);
  const [live, setLive] = useState<RatesState>(facts);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (!ds) return null; // §8.2: unknown dataset, render nothing

  const called = last !== null;
  const full = call.mode === "full";
  const m = ratesModel(live);
  const factsModel = ratesModel(facts);
  const r = readouts(m);
  const trap = trapSentence(m);

  function tap(o: CallOption) {
    const first = !called;
    setPicked((p) => ({ ...p, [o.id]: true })); // multi-select: every tapped chip stays marked (§5.7)
    setLast(o);
    if (first) {
      onEvent?.({ type: "call", optionId: o.id, verdict: o.verdict });
      onEvent?.({ type: "layer2_open" });
    }
  }

  function move(key: keyof RatesState, v: number) {
    const next = { ...live, [key]: v };
    setLive(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onEvent?.({ type: "state", state: next }), 500);
  }

  return (
    <section className="sig-rates" aria-label={ds.title} data-mode={call.mode}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* 1. Head (full only) */}
      {full && (
        <div className="r-head">
          <span className="r-live">
            <Glyph />
            Live widget
          </span>
          <span className="r-cat">
            {call.illustration && <span className="r-pill r-pill-plain">Illustration</span>}
            {ds.category}
          </span>
        </div>
      )}

      {/* 2. Title and sub (full only). The sub states the facts, never the answer. */}
      {full && (
        <div>
          <h3 className="r-title">{ds.title}</h3>
          <p className="r-sub">
            A rate goes from <b>{trim(facts.old)}%</b> to <b>{trim(facts.new)}%</b>.
          </p>
        </div>
      )}
      {!full && call.illustration && (
        <span>
          <span className="r-pill r-pill-plain">Illustration</span>
        </span>
      )}

      {/* 3. Your call */}
      <fieldset className="r-call">
        <legend>
          <span className="r-tag">Your call</span>
          Which of these describe the move correctly? Tap each one you believe.
        </legend>
        <div className="r-chips">
          {options.map((o) => (
            <Button key={o.id} unstyled pressed={!!picked[o.id]} className={`r-chip${picked[o.id] ? ` is-${o.verdict}` : ""}`} onClick={() => tap(o)}>
              {picked[o.id] && <Icon name={VERDICT[o.verdict].icon} />}
              {o.label}
            </Button>
          ))}
        </div>
        <p className="r-fb" aria-live="polite">
          {last && (
            <>
              <Pill verdict={last.verdict} />
              {last.fb}
            </>
          )}
        </p>
      </fieldset>

      {/* 4. Stage */}
      <Stage m={m} called={called} />

      {/* 5. Controls, locked until the call */}
      <div className="r-lockable" data-locked={!called}>
        <Range label="New rate" value={live.new} range={RANGES.new} disabled={!called} onChange={(v) => move("new", v)} />
        {!called && (
          <p className="r-locknote">
            <Icon name="lock" />
            Tap an answer to unlock the rate.
          </p>
        )}
      </div>

      {/* 6. Reading: hidden before the call, because the three sizes ARE the answer */}
      <div className="r-reading">
        {called ? (
          <>
            <dl className="r-facts">
              <div>
                <dt>How far it moved</dt>
                <dd>{r.moved}</dd>
              </div>
              <div>
                <dt>How traders say it</dt>
                <dd>{r.traders}</dd>
              </div>
              <div>
                <dt>Next to the old rate</dt>
                <dd>{r.nextToOld}</dd>
              </div>
            </dl>
            <p className="r-verdict" aria-live="polite">
              {trap && (
                <>
                  <Pill verdict="careful" />
                  {trap.lead}
                  <b>{trap.bold}</b>
                  {trap.tail}
                </>
              )}
            </p>
          </>
        ) : (
          <p className="r-locknote">
            <Icon name="lock" />
            The sizes of the move show after your call.
          </p>
        )}
      </div>

      {/* 7. Go deeper, locked until the call */}
      <div className={`r-layer2${called ? " is-open" : ""}`}>
        {called ? (
          <>
            <div>
              <span className="r-tag r-tag-paper">Go deeper</span>
              <b>Change where the rate starts.</b>
            </div>
            <p>The same {trim(Math.abs(factsModel.pts))}-point move is a bigger percent of a low rate and a smaller percent of a high one.</p>
            <Range label="Old rate" value={live.old} range={RANGES.old} disabled={false} onChange={(v) => move("old", v)} />
          </>
        ) : (
          <p className="r-l2-locked">
            <span className="r-tag">Go deeper</span>
            <Icon name="lock" />
            Opens after your call.
          </p>
        )}
      </div>

      {/* 8. Foot */}
      <footer className="r-foot">
        <ul className="r-key" aria-label="How to read the colours">
          <li>
            <span className="sw sw-blue" />
            The move you set
          </li>
          <li>
            <span className="sw sw-ink" />
            The old rate
          </li>
          <li>
            <span className="sw sw-wait" />
            “{headline(factsModel)}”, read literally
          </li>
        </ul>
        <p className="r-src">
          {ds.source} Checked {ds.checkedOn}.
        </p>
        {full && called && (
          <details className="r-table">
            <summary>Show the numbers</summary>
            <div className="r-scroll" tabIndex={0}>
              <table>
                <thead>
                  <tr>
                    <th>Measure</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Old rate</td>
                    <td>{m.o.toFixed(2)}%</td>
                  </tr>
                  <tr>
                    <td>New rate</td>
                    <td>{m.n.toFixed(2)}%</td>
                  </tr>
                  <tr>
                    <td>Percentage points</td>
                    <td>{r.moved}</td>
                  </tr>
                  <tr>
                    <td>Basis points</td>
                    <td>{r.traders}</td>
                  </tr>
                  <tr>
                    <td>Percent of the old rate</td>
                    <td>{r.nextToOld}</td>
                  </tr>
                  <tr>
                    <td>Literal reading</td>
                    <td>{trap ? `${trim(m.literal, 3)} pt, to ${trim(m.target, 3)}%` : "none"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>
        )}
      </footer>
    </section>
  );
}

// §3.1 tokens, scoped to the widget. Single light theme by design (§3.1), so it looks the same on the app's Dark theme.
const CSS = `
.sig-rates{
  --paper:#FFFFFF;--wash:#F5F7FB;--wash-2:#E9EDF5;--grid:#E9EDF4;
  --ink:#0B0D12;--ink-2:#30353F;--muted:#5F6571;--faint:#8B919B;--rule:#E2E5EA;--line:#C6CAD2;
  --blue:#1F3FAE;--blue-tint:#EEF2FC;--blue-tint-2:#E3E9FA;--blue-line:#A9B8EC;
  --gain:#0FAA7B;--gain-ink:#0B7A5A;--gain-tint:#E7F7F0;--gain-line:#9EE0C6;
  --loss:#BE1E3A;--loss-ink:#A3152E;--loss-tint:#FCEBEE;--loss-line:#F0A9B5;
  --wait:#F97316;--wait-ink:#A84B00;--wait-tint:#FFF1E3;--wait-line:#FBC592;
  --font-display:"Inter Tight","Inter",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
  --font-body:"Inter",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
  --lift-w:0 1px 2px rgba(11,13,18,.05),0 18px 44px -18px rgba(31,63,174,.28);
  color-scheme:light;display:grid;gap:16px;min-width:0;padding:clamp(16px,2vw,24px);
  background:var(--paper);color:var(--ink-2);border:1px solid var(--rule);border-radius:18px;box-shadow:var(--lift-w);
  font-family:var(--font-body);font-size:15px;line-height:1.55;
}
.sig-rates *{box-sizing:border-box}
.sig-rates b{font-weight:600;color:var(--ink)}
.sig-rates :focus-visible{outline:2px solid var(--blue);outline-offset:2px}
.sig-rates .r-ic{width:15px;height:15px;flex:none}
.sig-rates .r-head{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:12px;line-height:16px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.sig-rates .r-live{display:inline-flex;align-items:center;gap:8px;color:var(--blue)}
.sig-rates .r-cat{display:inline-flex;align-items:center;gap:8px}
.sig-rates .r-title{margin:0;font-family:var(--font-display);font-size:20px;line-height:1.3;font-weight:600;letter-spacing:-.01em;color:var(--ink);text-wrap:balance}
.sig-rates .r-sub{margin:4px 0 0}
.sig-rates .r-call{border:0;margin:0;padding:0;min-width:0;display:grid;gap:10px}
.sig-rates .r-call legend{padding:0;margin-bottom:10px;font-weight:600;color:var(--ink)}
.sig-rates .r-tag{display:inline-block;margin-right:8px;padding:2px 7px;border-radius:6px;background:var(--blue-tint);color:var(--blue);font-size:11px;line-height:16px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;vertical-align:1px}
.sig-rates .r-tag-paper{background:var(--paper)}
.sig-rates .r-chips{display:flex;flex-wrap:wrap;gap:8px}
.sig-rates .r-chip{display:inline-flex;align-items:center;min-height:40px;padding:8px 14px;border:1px solid var(--rule);border-radius:10px;background:var(--paper);color:var(--ink);font:600 14px/20px var(--font-body);text-align:left;cursor:pointer;transition:background-color .15s,border-color .15s}
.sig-rates .r-chip:hover{background:var(--wash);border-color:var(--line)}
.sig-rates .r-chip .r-ic{margin-right:7px}
.sig-rates .r-chip.is-right{background:var(--gain-tint);border-color:var(--gain);color:var(--gain-ink)}
.sig-rates .r-chip.is-wrong{background:var(--loss-tint);border-color:var(--loss);color:var(--loss-ink)}
.sig-rates .r-chip.is-careful{background:var(--wait-tint);border-color:var(--wait);color:var(--wait-ink)}
.sig-rates .r-fb,.sig-rates .r-verdict{margin:0;min-height:1.55em}
.sig-rates .r-verdict{font-size:15.5px}
.sig-rates .r-pill{display:inline-flex;align-items:center;gap:5px;min-height:24px;margin-right:8px;padding:3px 10px 3px 8px;border-radius:999px;font-size:12.5px;line-height:1;font-weight:600;vertical-align:1px}
.sig-rates .r-pill .r-ic{width:13px;height:13px}
.sig-rates .r-pill-gain{background:var(--gain-tint);color:var(--gain-ink);box-shadow:inset 0 0 0 1px var(--gain-line)}
.sig-rates .r-pill-loss{background:var(--loss-tint);color:var(--loss-ink);box-shadow:inset 0 0 0 1px var(--loss-line)}
.sig-rates .r-pill-wait{background:var(--wait-tint);color:var(--wait-ink);box-shadow:inset 0 0 0 1px var(--wait-line)}
.sig-rates .r-pill-plain{background:var(--wash);color:var(--muted);box-shadow:inset 0 0 0 1px var(--rule);letter-spacing:0;text-transform:none}
.sig-rates .r-stage{border-radius:12px;padding:14px 14px 10px;background-color:var(--wash);background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px);background-size:24px 24px}
.sig-rates .r-plot{width:100%;min-width:0}
.sig-rates .r-plot svg{display:block;font-family:var(--font-body);font-variant-numeric:tabular-nums}
.sig-rates .r-axis{stroke:var(--line);stroke-width:1.5}
.sig-rates .r-t-axis,.sig-rates .r-t-label{font-size:12px;fill:var(--muted)}
.sig-rates .r-gap{fill:var(--blue-line)}
.sig-rates .r-old{fill:var(--paper);stroke:var(--ink);stroke-width:2}
.sig-rates .r-new{fill:var(--blue);stroke:var(--paper);stroke-width:2}
.sig-rates .r-t-old{font-size:12.5px;fill:var(--ink-2)}
.sig-rates .r-t-new{font-size:13.5px;font-weight:600;fill:var(--ink)}
.sig-rates .r-t-value{font-size:14px;font-weight:600;fill:var(--ink)}
.sig-rates .r-t-hidden{font-size:14px;font-weight:600;fill:var(--faint)}
.sig-rates .r-rule{stroke:var(--ink);stroke-width:2}
.sig-rates .r-tick{stroke:var(--ink)}
.sig-rates .r-t-trap{font-size:12px;fill:var(--wait-ink)}
.sig-rates .r-t-trapv{font-size:14px;font-weight:600;fill:var(--wait-ink)}
.sig-rates .r-trapbar{fill:var(--wait)}
.sig-rates .r-lockable{display:grid;gap:8px;transition:opacity .25s}
.sig-rates .r-lockable[data-locked="true"]{opacity:.5}
.sig-rates .r-range-top{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
.sig-rates .r-range-top label{font-size:14px;font-weight:600;color:var(--ink)}
.sig-rates .r-range-top output{font-size:16px;font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums}
.sig-rates .r-range{-webkit-appearance:none;appearance:none;display:block;width:100%;height:28px;margin:0;background:transparent;cursor:pointer}
.sig-rates .r-range:disabled{cursor:not-allowed}
.sig-rates .r-range:focus-visible{outline:none}
.sig-rates .r-range::-webkit-slider-runnable-track{height:4px;border-radius:2px;background:linear-gradient(to right,var(--blue) var(--p),var(--line) var(--p))}
.sig-rates .r-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:24px;height:24px;margin-top:-10px;border-radius:50%;background:#fff;border:2px solid var(--blue);box-shadow:0 1px 3px rgba(11,13,18,.18)}
.sig-rates .r-range:focus-visible::-webkit-slider-thumb{box-shadow:0 0 0 5px var(--blue-tint-2)}
.sig-rates .r-range::-moz-range-track{height:4px;border-radius:2px;background:var(--line)}
.sig-rates .r-range::-moz-range-progress{height:4px;border-radius:2px;background:var(--blue)}
.sig-rates .r-range::-moz-range-thumb{width:20px;height:20px;border-radius:50%;background:#fff;border:2px solid var(--blue);box-shadow:0 1px 3px rgba(11,13,18,.18)}
.sig-rates .r-range:focus-visible::-moz-range-thumb{box-shadow:0 0 0 5px var(--blue-tint-2)}
.sig-rates .r-locknote,.sig-rates .r-l2-locked{display:flex;align-items:center;gap:6px;margin:0;font-size:13.5px;color:var(--muted)}
.sig-rates .r-reading{display:grid;gap:12px}
.sig-rates .r-facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin:0;border:1px solid var(--rule);border-radius:12px;overflow:hidden}
.sig-rates .r-facts div{padding:12px 14px;box-shadow:1px 0 0 var(--rule),0 1px 0 var(--rule)}
.sig-rates .r-facts dt{font-size:13px;color:var(--muted)}
.sig-rates .r-facts dd{margin:2px 0 0;font-family:var(--font-display);font-size:20px;line-height:1.3;font-weight:600;color:var(--ink)}
.sig-rates .r-layer2{display:grid;gap:12px;padding:14px 16px;border-radius:12px;background:var(--wash);color:var(--muted)}
.sig-rates .r-layer2 p{margin:0}
.sig-rates .r-layer2.is-open{background:var(--blue-tint);color:var(--ink-2)}
.sig-rates .r-foot{display:grid;gap:8px;padding-top:12px;border-top:1px solid var(--rule)}
.sig-rates .r-key{display:flex;flex-wrap:wrap;gap:6px 16px;margin:0;padding:0;list-style:none;font-size:13px;color:var(--muted)}
.sig-rates .r-key li{display:inline-flex;align-items:center;gap:6px}
.sig-rates .sw{width:12px;height:12px;border-radius:3px;flex:none}
.sig-rates .sw-blue{border-radius:50%;background:#fff;box-shadow:inset 0 0 0 3px var(--blue)}
.sig-rates .sw-ink{background:var(--ink)}
.sig-rates .sw-wait{background:var(--wait)}
.sig-rates .r-src{margin:0;font-size:12.5px;color:var(--muted)}
.sig-rates .r-table summary{cursor:pointer;font-size:13px;font-weight:600;color:var(--blue)}
.sig-rates .r-scroll{margin-top:8px;max-height:240px;overflow:auto;border:1px solid var(--rule);border-radius:10px}
.sig-rates table{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}
.sig-rates th,.sig-rates td{padding:6px 10px;text-align:right;border-bottom:1px solid var(--rule)}
.sig-rates th:first-child,.sig-rates td:first-child{text-align:left}
.sig-rates thead th{position:sticky;top:0;background:var(--wash);color:var(--ink)}
@media (prefers-reduced-motion:reduce){.sig-rates *{transition-duration:.001ms !important}}
`;
