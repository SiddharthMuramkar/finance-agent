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

export const timelineStripProps = z.object({
  beats: z
    .array(z.object({ date: z.string(), label: z.string(), emoji: z.string() }))
    .describe("2 to 7 beats: an ISO date, a label of at most 8 words, and an emoji name"),
  hideAfter: z.string().optional().describe("ISO date: beats dated after it are drawn locked, without their words"),
});

type Props = z.infer<typeof timelineStripProps>;

const LOCKED_NOTE = "After the story's date";

/** Each marker's ring in turn: the colours of stories (sun), lingo (violet), gains (mint) and losses (coral), so the strip is not one colour. */
const RINGS = ["border-[var(--sun)]", "border-[var(--violet)]", "border-[var(--mint)]", "border-[var(--coral)]"];

export function TimelineStripView({ beats, hideAfter }: Props) {
  const reduced = usePrefersReducedMotion();
  const [open, setOpen] = useState<number | null>(null);
  const [roving, setRoving] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const marks = (beats ?? [])
    .filter((b) => b && typeof b.date === "string" && typeof b.label === "string")
    .slice(0, 7)
    .map((b, order) => ({ ...b, order, locked: !!hideAfter && isAfter(b.date, hideAfter) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order));
  if (marks.length < 2) return <p className="py-2 text-sm text-[var(--muted)]">The timeline is still arriving.</p>;

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

  const shown = open === null ? null : marks[open];
  return (
    <section data-testid="timeline-strip" data-motion={motionFlag(reduced)} aria-label="Timeline" className="@container py-1">
      <div role="group" aria-label="Moments in order, oldest first" onKeyDown={onKeyDown} className="relative flex items-start justify-between gap-1 px-1">
        <span aria-hidden="true" className="absolute inset-x-4 top-[22px] h-1 rounded-full bg-[var(--sun)]" />
        {marks.map((m, i) => (
          <div key={`${m.date}-${m.order}`} className="relative flex min-w-0 flex-1 flex-col items-center gap-1">
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
              className={`size-11 min-h-11 shrink-0 rounded-full border-2 p-0! ${m.locked ? "" : RINGS[i % RINGS.length]}`}
            >
              {m.locked ? <span aria-hidden="true" className="text-lg font-bold text-[var(--muted)]">?</span> : <Pic name={m.emoji} size={24} />}
            </Button>
            <span className="text-xs leading-4 text-[var(--sun-ink)]">{m.locked ? "" : yearOf(m.date)}</span>
          </div>
        ))}
      </div>
      <p
        role="status"
        aria-live="polite"
        data-testid="timeline-label"
        className="mt-2 min-h-12 rounded-lg border border-[var(--sun)] bg-[var(--sun-tint)] px-3 py-2 text-sm leading-5 text-[var(--ink)]"
      >
        {shown === null ? (
          <span className="text-[var(--muted)]">Tap a picture to see what happened.</span>
        ) : shown.locked ? (
          <span className="font-medium">{LOCKED_NOTE}</span>
        ) : (
          <>
            <span className="font-semibold text-[var(--sun-ink)]">{dayLabel(shown.date) ?? shown.date}</span>
            {": "}
            {shown.label}
          </>
        )}
      </p>
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
