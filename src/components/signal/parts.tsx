"use client";

// The parts every Signal widget is built from (spec §5): the shell, the call, the slider, the lock, Go deeper, the foot,
// the table view and the tooltip, plus the hooks for charts drawn at real width (principle 6) and for scripted runs
// (§3.4, §6.1). Each widget composes these in the §5.6 order; the numbers come from src/finance/signal/.

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { Button } from "@/app/primitives";
import { SIGNAL_CSS, SIGNAL_STYLES_HREF } from "./styles";

/** A call option's verdict (§5.7): right, wrong ("Not quite") or careful. */
export type Verdict = "right" | "wrong" | "careful";

/** One chip of a widget's call. `pill` overrides the verdict's word (the jackpot's "About the same" says "Close"). */
export type SignalOption = { id: string; label: string; verdict: Verdict; feedback: string; pill?: string };

/**
 * What the learner committed to, as `onCall` hands it to the page (§5.6): the chosen option. The levers widget has no
 * right answer, so its call (the first lever move or preset) has no verdict.
 */
export type SignalCall = { id: string; label: string; verdict: Verdict | null; feedback: string };

/** Events a widget sends out (§8.3), as typed callbacks (decision #5). */
export type SignalEvent =
  | { type: "call"; call: SignalCall }
  | { type: "layer2_open" }
  | { type: "milestone"; id: "break_even_found" }
  | { type: "milestone"; id: "reached_price"; rev: number; margin: number };

/** The props every Signal widget takes. None is required: the defaults come from the widget's spec Case. */
export type SignalWidgetProps = {
  /** The Case to draw (spec §7.1 slugs). Left out, the widget's own Case; a slug it does not know renders nothing (§8.2). */
  caseSlug?: string;
  /** Compact mode (§5.6, the hero conversation): no head, title, sub or table view. */
  compact?: boolean;
  /** Fires once, the first time the learner commits. Hosts use it to unlock the Tutor's answer and the ending. */
  onCall?: (call: SignalCall) => void;
  /** Every event the widget sends (§8.3): the call, Go deeper opening, milestones. */
  onEvent?: (event: SignalEvent) => void;
};

/** True when the widget should draw: no slug, or its own Case's slug. */
export const isOwnCase = (caseSlug: string | undefined, own: string) => caseSlug === undefined || caseSlug === own;

/** The stylesheet, hoisted into <head> once however many widgets a page mounts (React 19 dedupes by href). */
export function SignalStyles() {
  return (
    <style href={SIGNAL_STYLES_HREF} precedence="default">
      {SIGNAL_CSS}
    </style>
  );
}

const ICON_PATHS = {
  check: "M3 8.5l3.2 3.2L13 5",
  cross: "M4 4l8 8M12 4l-8 8",
  alert: "M8 3v6.2M8 12.6v.2",
  approx: "M2.5 6.2c1.7-1.7 3.5-1.7 5.5 0s3.8 1.7 5.5 0M2.5 10.6c1.7-1.7 3.5-1.7 5.5 0s3.8 1.7 5.5 0",
  up: "M8 13V3.5M4 7.5l4-4 4 4",
  down: "M8 3v9.5M4 8.5l4 4 4-4",
  arrow: "M3 8h10M9 4l4 4-4 4",
} as const;

export type IconName = keyof typeof ICON_PATHS | "lock";

/** The spec's icon set (§5.5): 16px line drawings in the current colour, hidden from assistive tech. */
export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="sig-ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {name === "lock" ? (
        <>
          <rect x={3.5} y={7} width={9} height={6.5} rx={1.5} />
          <path d="M5.5 7V5.2a2.5 2.5 0 015 0V7" />
        </>
      ) : (
        <path d={ICON_PATHS[name]} />
      )}
    </svg>
  );
}

/** The four-bar glyph beside "Live widget" (§4.4). */
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

export type PillTone = "gain" | "loss" | "wait" | "blue" | "plain";

/** A status pill (§5.4): the only place a signal colour sits behind text. */
export function Pill({ tone, icon, children }: { tone: PillTone; icon?: IconName; children: ReactNode }) {
  return (
    <span className={`sig-pill sig-pill-${tone}`}>
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}

export const VERDICT_LOOK: Record<Verdict, { word: string; tone: PillTone; icon: IconName }> = {
  right: { word: "Right", tone: "gain", icon: "check" },
  wrong: { word: "Not quite", tone: "loss", icon: "cross" },
  careful: { word: "Careful", tone: "wait", icon: "alert" },
};

/** The widget card (§5.6). `kind` and `caseSlug` are data attributes, so a page or a test can find the widget. */
export function WidgetShell({ kind, caseSlug, compact, label, className = "", children }: { kind: string; caseSlug: string; compact: boolean; label: string; className?: string; children: ReactNode }) {
  return (
    <section className={`sig-w ${className}`.trim()} aria-label={label} data-widget={kind} data-case={caseSlug} data-compact={compact ? "true" : undefined}>
      <SignalStyles />
      {children}
    </section>
  );
}

/** Head, title and sub (§5.6 parts 1 and 2): full mode only. The sub states the facts, never the answer. */
export function WidgetHead({ right, title, sub }: { right: string; title: string; sub?: ReactNode }) {
  return (
    <>
      <div className="sig-head">
        <span className="sig-live">
          <Glyph />
          Live widget
        </span>
        <span className="sig-cat">{right}</span>
      </div>
      <div>
        <h3 className="sig-title">{title}</h3>
        {sub && <p className="sig-sub">{sub}</p>}
      </div>
    </>
  );
}

/**
 * Your call (§5.7): a fieldset of chips and a feedback line. A single-select call marks only the last chip tapped; a
 * multi-select call (rates) keeps every tapped chip marked.
 */
export function CallFieldset({
  question,
  options,
  marked,
  last,
  onPick,
}: {
  question: string;
  options: readonly SignalOption[];
  /** The chips that wear their verdict. */
  marked: ReadonlySet<string>;
  /** The option whose feedback shows, or null before the call. */
  last: SignalOption | null;
  onPick: (option: SignalOption) => void;
}) {
  return (
    <fieldset className="sig-call">
      <legend>
        <span className="sig-tag">Your call</span> {question}
      </legend>
      <div className="sig-chips">
        {options.map((o) => {
          const on = marked.has(o.id);
          return (
            <Button key={o.id} unstyled className={`sig-chip${on ? ` is-${o.verdict}` : ""}`} pressed={on} onClick={() => onPick(o)}>
              {on && <Icon name={VERDICT_LOOK[o.verdict].icon} />}
              {o.label}
            </Button>
          );
        })}
      </div>
      <p className="sig-fb" aria-live="polite">
        {last && (
          <>
            <Pill tone={VERDICT_LOOK[last.verdict].tone} icon={VERDICT_LOOK[last.verdict].icon}>
              {last.pill ?? VERDICT_LOOK[last.verdict].word}
            </Pill>{" "}
            {last.feedback}
          </>
        )}
      </p>
    </fieldset>
  );
}

/**
 * A range slider (§5.9): a native input, its label on the left and its value in an output on the right. `range-you` is the
 * app's slider utility; the widget's own rules repaint it in the §3.1 blue (it wins: the utility is layered).
 */
export function RangeControl({
  label,
  value,
  min,
  max,
  step,
  text,
  disabled = false,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** The value as the output shows it: "5.00%", "3 years". */
  text: string;
  disabled?: boolean;
  onChange: (value: number) => void;
  /** The learner let go (pointer up, key up): a milestone or a debounced state can follow. */
  onCommit?: () => void;
}) {
  const id = useId();
  const p = ((value - min) / (max - min)) * 100;
  return (
    <div className="sig-range-row">
      <div className="sig-range-top">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{text}</output>
      </div>
      <input
        id={id}
        className="range-you sig-range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={text}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        style={{ "--p": `${p}%` } as CSSProperties}
      />
    </div>
  );
}

/** The lock note under locked controls (§5.9): what unlocks them. Removed on unlock. */
export function LockNote({ children }: { children: ReactNode }) {
  return (
    <p className="sig-locknote">
      <Icon name="lock" />
      {children}
    </p>
  );
}

/** Go deeper (§5.10): locked until the learner's own action, then open with its title and body. */
export function GoDeeper({ open, title, lockedText = "Opens after your call.", children }: { open: boolean; title: string; lockedText?: string; children?: ReactNode }) {
  if (!open) {
    return (
      <div className="sig-l2" data-open="false">
        <p className="sig-l2-locked">
          <span className="sig-tag">Go deeper</span> <Icon name="lock" />
          {lockedText}
        </p>
      </div>
    );
  }
  return (
    <div className="sig-l2 is-open" data-open="true">
      <p>
        <span className="sig-tag">Go deeper</span> <b>{title}</b>
      </p>
      {children}
    </div>
  );
}

export type Swatch = "gain" | "deep" | "loss" | "wait" | "ink" | "hatch" | "claim" | "blue" | "ref" | "pin";

/** The table view (§5.12): a real table behind "Show the numbers". Full mode only. */
export function TableView({ head, rows, label }: { head: readonly string[]; rows: readonly (readonly string[])[]; label: string }) {
  return (
    <details className="sig-table">
      <summary>Show the numbers</summary>
      <div className="sig-scroll" tabIndex={0} role="region" aria-label={label}>
        <table>
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[0]}>
                {row.map((cell, i) => (
                  <td key={i}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** A Source the source line names, and where it links (#75: every named Source is a link). */
export type SourceLink = { name: string; href: string };

/** The source line's text, with the Source it names drawn as a link to it (the name must appear in the text). */
function SourceText({ text, link }: { text: string; link?: SourceLink }) {
  const at = link ? text.indexOf(link.name) : -1;
  if (!link || at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <a href={link.href} className="link" data-affordance="link" target="_blank" rel="noopener noreferrer">
        {link.name}
      </a>
      {text.slice(at + link.name.length)}
    </>
  );
}

/** The foot (§5.6 part 8): the colour key, the source line (its named Source linked) and, in full mode, the table view. */
export function WidgetFoot({ keys, source, link, table }: { keys: readonly { swatch: Swatch; label: string }[]; source: string; link?: SourceLink; table?: ReactNode }) {
  return (
    <footer className="sig-foot">
      <ul className="sig-key" aria-label="How to read the colours">
        {keys.map((k) => (
          <li key={k.label}>
            <span className={`sw sw-${k.swatch}`} aria-hidden="true" />
            {k.label}
          </li>
        ))}
      </ul>
      <p className="sig-src" data-source-line="">
        <SourceText text={source} link={link} />
      </p>
      {table}
    </footer>
  );
}

/** The width of a chart's plot box, kept in step with the box (§5.8): the chart is drawn at its real pixel width. */
export function useChartWidth(initial: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const next = Math.round(el.getBoundingClientRect().width);
      if (next > 0) setWidth((prev) => (prev === next ? prev : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

/** True when the reader asked for reduced motion (§9.9): scripted runs then jump to their end. */
export function prefersReducedMotion(): boolean {
  return typeof window === "undefined" || typeof window.matchMedia !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const easeInOutQuad = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * A scripted value run (§3.4: ease-in-out quadratic): the control moves itself from one value to another. `cancel` stops
 * it the moment the learner touches the control (§6.1). With reduced motion, or without animation frames, it jumps.
 */
export function useScriptedRun() {
  const frame = useRef<number | null>(null);
  const cancel = useCallback(() => {
    if (frame.current !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);
  const run = useCallback(
    (from: number, to: number, ms: number, onFrame: (value: number) => void) => {
      cancel();
      if (prefersReducedMotion() || typeof requestAnimationFrame !== "function") {
        onFrame(to);
        return;
      }
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / ms);
        onFrame(from + (to - from) * easeInOutQuad(t));
        frame.current = t < 1 ? requestAnimationFrame(tick) : null;
      };
      frame.current = requestAnimationFrame(tick);
    },
    [cancel],
  );
  return { run, cancel };
}

/** The shared tooltip (§5.13): shown over any [data-tip] inside the stage, hidden on leave and on scroll. */
export function useTooltip() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!tip) return;
    const hide = () => setTip(null);
    window.addEventListener("scroll", hide, { passive: true, once: true });
    return () => window.removeEventListener("scroll", hide);
  }, [tip]);
  const onPointer = (e: PointerEvent<HTMLElement>) => {
    const target = (e.target as Element).closest?.("[data-tip]");
    const text = target?.getAttribute("data-tip");
    if (!text) return setTip(null);
    const width = typeof window === "undefined" ? 1024 : window.innerWidth;
    const x = e.clientX + 14 + 240 > width ? e.clientX - 254 : e.clientX + 14;
    setTip({ text, x: Math.max(4, x), y: Math.max(4, e.clientY - 44) });
  };
  const handlers = { onPointerMove: onPointer, onPointerDown: onPointer, onPointerLeave: () => setTip(null) };
  const element = tip ? (
    <div className="sig-tip" role="tooltip" style={{ left: tip.x, top: tip.y }}>
      {tip.text}
    </div>
  ) : null;
  return { handlers, element };
}

/**
 * The once-only call (§5.6): the first commit fires `onCall`, a `call` event and `layer2_open` (Go deeper opens with the
 * call). Returns true the first time, false after.
 */
export function useFirstCall({ onCall, onEvent }: Pick<SignalWidgetProps, "onCall" | "onEvent">) {
  const fired = useRef(false);
  return useCallback(
    (call: SignalCall) => {
      if (fired.current) return false;
      fired.current = true;
      onCall?.(call);
      onEvent?.({ type: "call", call });
      onEvent?.({ type: "layer2_open" });
      return true;
    },
    [onCall, onEvent],
  );
}

/** A chart column's bar width (§5.8): 62% of its slot, from 3 to 14 px. */
export const barWidth = (slot: number) => Math.min(14, Math.max(3, slot * 0.62));

/** A bar path with its top corners rounded (3px at most) and square at the baseline (§5.8). */
export function topRoundedBar(x: number, y: number, w: number, h: number, radius = 3): string {
  if (h <= 0 || w <= 0) return "";
  const r = Math.min(radius, w / 2, h);
  return `M${px(x)},${px(y + h)}V${px(y + r)}Q${px(x)},${px(y)} ${px(x + r)},${px(y)}H${px(x + w - r)}Q${px(x + w)},${px(y)} ${px(x + w)},${px(y + r)}V${px(y + h)}Z`;
}

/**
 * An SVG coordinate at 2 decimals. A chart is drawn on the server and again in the browser to hydrate, and Node and Chrome
 * can differ in the last digit of Math.pow, which the jackpot's and compounding's bars are built on: unrounded, the two
 * wrote different paths and React reported a hydration mismatch (spec §13 row 24: no console errors).
 */
export const px = (n: number) => Math.round(n * 100) / 100;

/** A value to `d` decimals with its percent sign: `5.00%`. */
export const percent = (value: number, decimals = 2) => `${value.toFixed(decimals)}%`;

/** Snaps a value to a slider's grid at 2 decimals. */
export function snapTo(value: number, min: number, max: number, step: number): number {
  const clamped = Math.min(max, Math.max(min, value));
  return Math.round((Math.round((clamped - min) / step) * step + min) * 100) / 100;
}
