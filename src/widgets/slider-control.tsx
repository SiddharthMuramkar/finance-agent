"use client";

import { Minus, Plus } from "lucide-react";
import { createContext, useCallback, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { Chip, IconButton } from "@/app/primitives";
import type { Landings } from "./slider-landing";
import { landedValue, nextValue, settledValue, type SliderRange } from "./slider-steps";

// A slider a person can land on (spec 2026-11-12, B5), drawn without OpenUI so the Widget library's Slider and a Workbench
// Widget's levers share it: a blue track and thumb (F2), −/+ steppers that hold to repeat, the arrow keys, and chips for the
// values a Guided Task names. A drag rests on a stop (a task's value, the opening value) when it comes within 12 pixels of
// it, else moves in steps at least 2 pixels wide; the steppers and arrow keys move in the slider's finer step and pass
// through each stop. Thumb, steppers and chips are at least 44 pixels each way. Nothing is typed (ADR 0009).

/** The drawn Widget's sliders' stops and chips by `$variable` (sliderLandings of its code); none outside a drawn Widget. */
export const SliderLandingContext = createContext<Landings>({});

/** A press-and-hold repeat: the first press acts at once, and holding goes on acting every 80 ms after 400 ms. */
export function useHold(act: () => boolean) {
  const latest = useRef(act);
  // After each render, so a held press always steps from what the slider shows now.
  useEffect(() => {
    latest.current = act;
  });
  const timers = useRef<{ wait?: number; every?: number }>({});
  const stop = useCallback(() => {
    window.clearTimeout(timers.current.wait);
    window.clearInterval(timers.current.every);
    timers.current = {};
  }, []);
  useEffect(() => stop, [stop]);
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      stop();
      if (!latest.current()) return;
      timers.current.wait = window.setTimeout(() => {
        timers.current.every = window.setInterval(() => {
          if (!latest.current()) stop();
        }, 80);
      }, 400);
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    onBlur: stop,
    // A press already acted on pointer down (click detail is 1+); a key press has no pointer, so it acts here.
    onClick: (e: React.MouseEvent) => {
      if (e.detail === 0) latest.current();
    },
  };
}

export type SliderChip = { value: number; label: string };

export type SliderControlProps = {
  label: string;
  value: number;
  range: SliderRange;
  /** The value as the readout prints it: "4.5%", "$39bn". */
  reading: string;
  /** The value said aloud with its unit, for aria-valuetext: "39 billion dollars". */
  spoken: string;
  onChange: (value: number) => void;
  /** Values a drag rests on when it comes within 12 pixels, and the steppers pass through. */
  stops?: readonly number[];
  /** Chips under the slider; a tap sets the slider to the chip's value. */
  chips?: readonly SliderChip[];
  /** A small line under the label, such as "Today: $1.1bn". */
  caption?: ReactNode;
  /** Before the label, such as the "Your assumption" tag. */
  tag?: ReactNode;
  /** A short name above the label, such as a lever's "How big it gets". */
  title?: string;
  /** Figures marked on the track, such as rivals' margins on a margin lever: ticks with a title, named in words by the Widget's readout; they do not stop a drag. */
  marks?: readonly { value: number; label: string }[];
};

/** The thumb's size: its centre travels the input's width less this, which is what a drag's pixels move. */
const THUMB_PX = 44;

/**
 * How far the thumb's centre travels now, for the 12-pixel stops and the 2-pixel drag steps: the input's width less the
 * 44 px thumb. 0 when the page cannot measure it (the steps then assume a usual width).
 */
const widthOf = (el: HTMLElement | null) => Math.max(0, (el?.getBoundingClientRect().width ?? 0) - THUMB_PX);

/**
 * The landing rules of B5 for any range input, so a Widget that draws its own track (Predict, Time travel) moves like
 * SliderControl: a drag rests on a stop within 12 px and else moves in steps at least 2 px wide; the arrow keys move the
 * fine step and pass through each stop; Page Up and Down move a tenth of the range. Spread the result on the `<input>`.
 */
export function useLandingInput(value: number, range: SliderRange, onChange: (value: number) => void, stops: readonly number[] = []) {
  const ref = useRef<HTMLInputElement>(null);
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const move: Record<string, () => number> = {
      ArrowRight: () => nextValue(value, 1, range, stops),
      ArrowUp: () => nextValue(value, 1, range, stops),
      ArrowLeft: () => nextValue(value, -1, range, stops),
      ArrowDown: () => nextValue(value, -1, range, stops),
      PageUp: () => landedValue(value + (range.max - range.min) / 10, range, [], widthOf(ref.current)),
      PageDown: () => landedValue(value - (range.max - range.min) / 10, range, [], widthOf(ref.current)),
      Home: () => range.min,
      End: () => range.max,
    };
    const to = move[e.key];
    if (!to) return;
    e.preventDefault();
    const next = to();
    if (next !== value) onChange(next);
  };
  return {
    ref,
    min: range.min,
    max: range.max,
    // Any value: a drag lands where landedValue puts it (a stop, or the drag step's grid), and keys move as onKeyDown says.
    step: "any" as const,
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(landedValue(Number(e.target.value), range, stops, widthOf(ref.current))),
    onKeyDown,
  };
}

export function SliderControl({ label, value, range, reading, spoken, onChange, stops = [], chips = [], caption, tag, title, marks = [] }: SliderControlProps) {
  const input = useLandingInput(value, range, onChange, stops);
  // One fine step, stopping at a stop on the way; false once the slider is at its end, which also ends a hold.
  const step = (dir: 1 | -1) => () => {
    const next = nextValue(value, dir, range, stops);
    if (next === value) return false;
    onChange(next);
    return true;
  };
  const down = useHold(step(-1));
  const up = useHold(step(1));
  const fill = range.max === range.min ? 0 : ((value - range.min) / (range.max - range.min)) * 100;
  return (
    <div className="@container min-w-0 py-2" data-testid="slider">
      {title && <p className="text-xs font-medium text-[var(--muted)]">{title}</p>}
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0">
          {tag}
          {label}
        </span>{" "}
        <output className="shrink-0 font-medium tabular-nums">{reading}</output>
      </div>
      {caption && <p className="text-xs leading-4 text-[var(--muted)]">{caption}</p>}
      <div className="mt-1 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1">
        <IconButton
          label={`Decrease ${label} by one step`}
          disabled={value <= range.min}
          {...down}
          className="size-11 min-h-11 border border-[var(--border)] text-base leading-none text-[var(--ink)]"
        >
          <Minus aria-hidden="true" size={16} strokeWidth={1.75} />
        </IconButton>
        <input
          {...input}
          type="range"
          aria-label={label}
          aria-valuetext={spoken}
          className="range-you min-w-0 w-full"
          style={{ "--range-fill": `${fill}%` } as CSSProperties}
        />
        <IconButton
          label={`Increase ${label} by one step`}
          disabled={value >= range.max}
          {...up}
          className="size-11 min-h-11 border border-[var(--border)] text-base leading-none text-[var(--ink)]"
        >
          <Plus aria-hidden="true" size={16} strokeWidth={1.75} />
        </IconButton>
        {marks.length > 0 && (
          <>
            <span />
            {/* Where the thumb's centre would sit at each mark: it runs from half the 44px thumb in from each end. */}
            <span className="relative h-2" aria-hidden data-testid="slider-marks">
              {marks.map((mark) => (
                <span
                  key={mark.label}
                  className="absolute top-0 h-2 w-0.5 -translate-x-1/2 rounded-sm bg-[var(--ink-2)]"
                  style={{ left: `calc(22px + ${range.max === range.min ? 0 : (mark.value - range.min) / (range.max - range.min)} * (100% - 44px))` }}
                  title={mark.label}
                />
              ))}
            </span>
            <span />
          </>
        )}
      </div>
      {chips.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-2" role="group" aria-label={`Quick values for ${label}`}>
          {chips.map((chip) => (
            // No data-state: that attribute marks a Guided Task's state for the scripts and tests that read the page.
            <Chip key={`${chip.value} ${chip.label}`} data-state={undefined} onClick={() => onChange(settledValue(chip.value, range))} className="min-h-11 min-w-11 justify-center tabular-nums">
              {chip.label}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}
