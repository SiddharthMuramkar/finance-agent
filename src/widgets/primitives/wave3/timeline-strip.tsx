"use client";

import { defineComponent, type ComponentRenderProps } from "@openuidev/react-lang";
import { useRef, useState, type KeyboardEvent } from "react";
import { z } from "zod/v4";
import { Button } from "@/app/primitives";
import { usePrefersReducedMotion } from "../wave1/motion";
import { dayLabel, isAfter, motionFlag, Pic, yearOf } from "./shared";

// TimelineStrip: emoji markers on a line, oldest on the left. Tapping a marker (or arriving on it with the arrow keys)
// opens its label. A beat dated after `hideAfter` is drawn as a locked "?" marker and never shows its words, so a story
// can stop at its own date. The strip is one tab stop; the arrow keys, Home and End move along it.
// At rest it is already a story moment (ticket R-E2a): the oldest beat starts open, its marker raised on a sunflower face,
// and its card shows the beat's picture and day. The line is solid sunflower up to the story's date and dashed after it.

export const timelineStripProps = z.object({
  beats: z
    .array(z.object({ date: z.string(), label: z.string(), emoji: z.string() }))
    .describe("2 to 7 beats: an ISO date, a label of at most 8 words, and an emoji name"),
  hideAfter: z.string().optional().describe("ISO date: beats dated after it are drawn locked, without their words"),
});

type Props = z.infer<typeof timelineStripProps>;

const LOCKED_NOTE = "After the story's date";

/** Every open marker's ring: sunflower, the accent of history and stories (Appendix A). Mint and coral mean gain and loss, so they never decorate a date. */
const RING = "border-[var(--sun)]";

/** Markers pop in one after another: 30 ms apart, so seven still finish inside 400 ms with the 200 ms pop. */
const STAGGER_MS = 30;

export function TimelineStripView({ beats, hideAfter }: Props) {
  const reduced = usePrefersReducedMotion();
  const [open, setOpen] = useState<number | null>(0);
  const [roving, setRoving] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const marks = (beats ?? [])
    .filter((b) => b && typeof b.date === "string" && typeof b.label === "string")
    .slice(0, 7)
    .map((b, order) => ({ ...b, order, locked: !!hideAfter && isAfter(b.date, hideAfter) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order));
  if (marks.length < 1) return <p className="py-2 text-sm text-[var(--muted)]">The timeline is still arriving.</p>;

  const move = (to: number) => {
    const clamped = Math.max(0, Math.min(marks.length - 1, to));
    setRoving(clamped);
    setOpen(clamped);
    refs.current[clamped]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const from = Number((e.target as HTMLElement).closest<HTMLElement>("[data-index]")?.dataset.index ?? roving);
    const to = e.key === "ArrowRight" ? from + 1 : e.key === "ArrowLeft" ? from - 1 : e.key === "Home" ? 0 : e.key === "End" ? marks.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    move(to);
  };

  // The line runs between the first and last marker centres (each marker sits in the middle of an equal column).
  // The story's part is solid sunflower; past the last open beat it turns into a dashed, muted line.
  const n = marks.length;
  const lastStory = marks.reduce((at, m, i) => (m.locked ? at : i), 0);
  const centre = (i: number) => `${((i + 0.5) / n) * 100}%`;
  const span = (from: number, to: number) => `${((to - from) / n) * 100}%`;
  const shown = open === null ? null : marks[open];
  return (
    <section data-testid="timeline-strip" data-motion={motionFlag(reduced)} aria-label="Timeline" className="@container py-1">
      <div role="group" aria-label="Moments in order, oldest first" onKeyDown={onKeyDown} className="relative flex items-start">
        <span
          aria-hidden="true"
          data-testid="timeline-line-story"
          className="absolute top-[19px] h-1.5 rounded-full bg-[var(--sun)] @min-[480px]:top-[25px]"
          style={{ left: centre(0), width: span(0, lastStory) }}
        />
        {lastStory < n - 1 && (
          <span
            aria-hidden="true"
            data-testid="timeline-line-after"
            className="absolute top-[20px] h-0 border-t-4 border-dashed border-[var(--edge)] @min-[480px]:top-[26px]"
            style={{ left: centre(lastStory), width: span(lastStory, n - 1) }}
          />
        )}
        {marks.map((m, i) => (
          <div
            key={`${m.date}-${m.order}`}
            className={`relative flex min-w-0 flex-1 flex-col items-center gap-1.5 ${reduced ? "" : "story-pop"}`}
            style={reduced ? undefined : { animationDelay: `${i * STAGGER_MS}ms` }}
          >
            <Button
              ref={(el: HTMLButtonElement | null) => {
                refs.current[i] = el;
              }}
              variant="secondary"
              pressed={open === i}
              tabIndex={roving === i ? 0 : -1}
              aria-label={m.locked ? LOCKED_NOTE : `${m.label}, ${yearOf(m.date)}`}
              data-testid="timeline-marker"
              data-index={i}
              data-locked={m.locked ? "true" : "false"}
              onClick={() => {
                setOpen(i);
                setRoving(i);
              }}
              className={`timeline-marker size-11 min-h-11 shrink-0 rounded-full border-2 p-0! @min-[480px]:size-14 @min-[480px]:min-h-14 ${m.locked ? "border-dashed" : RING}`}
            >
              {m.locked ? <span aria-hidden="true" className="text-xl font-bold text-[var(--muted)]">?</span> : <Pic name={m.emoji} size={32} />}
            </Button>
            <span className={`text-xs leading-4 ${open === i ? "font-bold text-[var(--sun-ink)]" : "text-[var(--sun-ink)]"}`}>{m.locked ? "" : yearOf(m.date)}</span>
          </div>
        ))}
      </div>
      <div
        role="status"
        aria-live="polite"
        data-testid="timeline-label"
        className="mt-3 min-h-16 rounded-xl border border-[var(--sun)] bg-[var(--sun-tint)] px-3 py-2 text-[var(--ink)]"
      >
        {shown === null ? (
          <p className="text-sm leading-5 text-[var(--muted)]">Tap a picture to see what happened.</p>
        ) : (
          <div key={open} className={`flex items-center gap-3 ${reduced ? "" : "story-bubble-in"}`}>
            <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-full border-2 border-[var(--sun)] bg-[var(--field)]">
              {shown.locked ? <span className="text-xl font-bold text-[var(--muted)]">?</span> : <Pic name={shown.emoji} size={32} />}
            </span>
            {shown.locked ? (
              <p className="text-base font-medium leading-6">{LOCKED_NOTE}</p>
            ) : (
              <p className="min-w-0">
                <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--sun-ink)]">{dayLabel(shown.date) ?? shown.date}</span>
                <span className="block text-base font-medium leading-6">{shown.label}</span>
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export const TimelineStrip = defineComponent({
  name: "TimelineStrip",
  description:
    "Moments on a line, oldest on the left: TimelineStrip(beats, hideAfter). beats is 2 to 7 {date (ISO), label (at most 8 words), emoji}; beats dated after hideAfter show as locked and hide their words.",
  props: timelineStripProps,
  component: ({ props }: ComponentRenderProps<Props>) => <TimelineStripView {...props} />,
});
