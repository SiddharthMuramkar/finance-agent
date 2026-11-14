"use client";

import { defineComponent, type ComponentRenderProps } from "@openuidev/react-lang";
import { Lock } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";
import { z } from "zod/v4";
import { Button } from "@/app/primitives";
import { usePrefersReducedMotion } from "../wave1/motion";
import { dayLabel, isAfter, motionFlag, Pic, yearOf } from "./shared";

// TimelineStrip: Icon markers on a line, oldest on the left; each marker is the app's secondary Button. Tapping a marker
// (or arriving on it with the arrow keys) opens its label. A beat dated after `hideAfter` is drawn as a dashed marker with
// a lock Icon and never shows its words, so a story can stop at its own date. The strip is one tab stop; the arrow keys,
// Home and End move along it. At rest it is already a story moment (tickets R-E2a, A9b): the oldest beat starts open, its
// marker in the app's pressed look, and its card (a 2 px sunflower edge) shows the beat's Icon and day. The line is a
// 2 px sunflower rule up to the story's date and a dashed muted line after it.

export const timelineStripProps = z.object({
  beats: z
    .array(z.object({ date: z.string(), label: z.string(), emoji: z.string() }))
    .describe("2 to 7 beats: an ISO date, a label of at most 8 words, and an emoji name"),
  hideAfter: z.string().optional().describe("ISO date: beats dated after it are drawn locked, without their words"),
});

type Props = z.infer<typeof timelineStripProps>;

const LOCKED_NOTE = "After the story's date";

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
          className="absolute top-[17px] h-0.5 bg-[var(--sun)]"
          style={{ left: centre(0), width: span(0, lastStory) }}
        />
        {lastStory < n - 1 && (
          <span
            aria-hidden="true"
            data-testid="timeline-line-after"
            className="absolute top-[17px] h-0 border-t border-dashed border-[var(--line-strong)]"
            style={{ left: centre(lastStory), width: span(lastStory, n - 1) }}
          />
        )}
        {marks.map((m, i) => (
          <div
            key={`${m.date}-${m.order}`}
            className="relative flex min-w-0 flex-1 flex-col items-center gap-1.5"
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
              className={`size-9 min-h-9 shrink-0 p-0! ${m.locked ? "border-dashed" : ""}`}
            >
              {m.locked ? <Lock size={16} strokeWidth={1.75} aria-hidden /> : <Pic name={m.emoji} size={20} />}
            </Button>
            <span className={`text-xs leading-4 ${open === i ? "font-medium text-[var(--ink)]" : "text-[var(--muted)]"}`}>{m.locked ? "" : yearOf(m.date)}</span>
          </div>
        ))}
      </div>
      <div
        role="status"
        aria-live="polite"
        data-testid="timeline-label"
        className="mt-3 min-h-16 rounded-lg border border-[var(--rule)] border-l-2 border-l-[var(--sun)] bg-[var(--raised)] px-3 py-2 text-[var(--ink)]"
      >
        {shown === null ? (
          <p className="text-sm leading-5 text-[var(--muted)]">Tap a picture to see what happened.</p>
        ) : (
          <div key={open} className={`flex items-center gap-3 ${reduced ? "" : "story-step"}`}>
            <span aria-hidden="true" className="shrink-0">
              {shown.locked ? <Lock size={20} strokeWidth={1.75} aria-hidden /> : <Pic name={shown.emoji} size={20} />}
            </span>
            {shown.locked ? (
              <p className="text-base font-medium leading-6">{LOCKED_NOTE}</p>
            ) : (
              <p className="min-w-0">
                <span className="block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{dayLabel(shown.date) ?? shown.date}</span>
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
