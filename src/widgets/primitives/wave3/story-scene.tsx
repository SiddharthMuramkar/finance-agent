"use client";

import { defineComponent, type ComponentRenderProps } from "@openuidev/react-lang";
import { useState, type KeyboardEvent } from "react";
import { z } from "zod/v4";
import { Button } from "@/app/primitives";
import { usePrefersReducedMotion } from "../wave1/motion";
import { dayLabel, motionFlag, Pic } from "./shared";

// StoryScene: a stage with a small cast and its beats. Where the scene is wide enough (spec 2026-11-12 B8), two to five
// beats show together, with no Back or Next. In a narrow scene, or with more than five beats, a speech bubble tells one
// beat at a time: the Learner taps Next beat (or presses the right arrow) to move on, the left arrow to go back, and
// Replay at the end. Sunflower is the colour of stories and history. No numbers are asked for.

export const storySceneProps = z.object({
  cast: z
    .array(z.object({ id: z.string(), emoji: z.string(), name: z.string(), role: z.string().optional() }))
    .describe("1 to 4 characters: id, an emoji name such as bank, a name of at most 3 words, and an optional role"),
  beats: z
    .array(z.object({ who: z.string(), says: z.string(), emoji: z.string().optional() }))
    .describe('2 to 5 beats: who is a cast id or "narrator"; says is at most 16 words; emoji is optional'),
  caption: z.string().optional().describe("At most 14 words, under the stage"),
  date: z.string().optional().describe("ISO date of the story, shown as a stamp, e.g. 1994-02-03"),
});

type Props = z.infer<typeof storySceneProps>;

/**
 * Issue 528: in the Widget panel (the size container named pane, src/app/workspace-frame.tsx) the stage grows with the
 * panel's height: at least 55% of it once the panel is 480 px tall, its cast and bubble centred. Anywhere else (the
 * dev harness, the conversation column) no pane matches, so the stage keeps its own height.
 */
export const STAGE_GROW = "flex flex-col justify-center [@container_pane_(min-height:480px)]:min-h-[55cqh]";

/** The cast's size: 32 px, 40 px on a wide stage, 40 px in a 480 px tall panel and 48 px from 640 px. */
export const CAST_SIZE =
  "[&_svg]:size-8 @min-[720px]:[&_svg]:size-10 [@container_pane_(min-height:480px)]:[&_svg]:size-10 [@container_pane_(min-height:640px)]:[&_svg]:size-12";

/**
 * B8: the scene's own width (the section is an inline-size container) from which two to five beats show together.
 * Why 520 px: the cast row is at most 4 names of 7rem (112 px) with 16 px gaps, 496 px, plus the stage's 12 px padding
 * on each side, so 520 px is the narrowest scene where the cast never wraps. At that width a beat's line has about
 * 490 px, so its 16 words at most (about 96 characters at 16 px) take two lines, and five beats stay a short column.
 * In the Test bed's frames that is 560 px and up (the card's padding takes 34 px); 480 px and 360 px keep stepping.
 * A CSS container query, not a measured width, so the server's HTML and the first client render are the same.
 */
export const ALL_BEATS_MIN = 520;
/** Shown only in a wide scene (display: none below it, so it is also out of the accessibility tree). */
export const WIDE_ONLY = "hidden @min-[520px]:flex";
/** Shown only in a narrow scene: the stepped bubble and its Back and Next. */
export const NARROW_ONLY = "@min-[520px]:hidden";
/** The most beats that show together; a longer story keeps stepping (B8: "two to five lines"). */
export const ALL_BEATS_MAX = 5;

export function StorySceneView({ cast, beats, caption, date }: Props) {
  const reduced = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const people = (cast ?? []).filter((p) => p && typeof p.id === "string").slice(0, 4);
  // Not cut to five: a longer story (off the recipe's 2-5, but possible in hand-written code) is stepped, never lost.
  const lines = (beats ?? []).filter((b) => b && typeof b.says === "string");
  if (people.length === 0 || lines.length === 0) {
    return <p data-testid="story-scene-problem" className="py-2 text-sm text-[var(--muted)]">The story is still arriving.</p>;
  }
  const at = Math.min(index, lines.length - 1);
  const beat = lines[at];
  const last = at === lines.length - 1;
  const speaker = people.find((p) => p.id === beat.who);
  const stamp = dayLabel(date);
  const together = lines.length >= 2 && lines.length <= ALL_BEATS_MAX;
  const nameOf = (who: string) => people.find((p) => p.id === who)?.name ?? "Narrator";
  const next = () => setIndex(Math.min(at + 1, lines.length - 1));
  const back = () => setIndex(Math.max(at - 1, 0));

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "ArrowRight" && !last) {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft" && at > 0) {
      e.preventDefault();
      back();
    }
  };

  return (
    <section
      data-testid="story-scene"
      data-motion={motionFlag(reduced)}
      data-together={together ? "true" : undefined}
      aria-label="Story"
      onKeyDown={onKeyDown}
      className="@container py-1"
    >
      <div
        data-testid="story-stage"
        onClick={() => !last && next()}
        className={`relative rounded-xl border border-[var(--rule)] border-l-2 border-l-[var(--sun)] bg-[var(--raised)] px-3 pb-3 pt-4 ${STAGE_GROW}`}
      >
        {stamp && (
          <p
            data-testid="story-date"
            className="mb-2 inline-flex items-center gap-1.5 self-start text-xs font-medium uppercase tracking-wide text-[var(--muted)]"
          >
            <Pic name="calendar" size={16} />
            {stamp}
          </p>
        )}
        <ul className="flex items-end justify-center gap-4" aria-label="Cast">
          {people.map((p) => {
            const talking = speaker?.id === p.id;
            return (
              <li key={p.id} className="flex min-w-0 flex-col items-center text-center">
                <span
                  key={talking ? `${p.id}-${at}` : p.id}
                  data-speaking={talking ? "true" : undefined}
                  className={`block rounded-full border bg-[var(--raised)] p-2 ${CAST_SIZE} ${talking ? `border-2 border-[var(--sun)]${together ? " @min-[520px]:border @min-[520px]:border-[var(--rule)]" : ""}` : "border-[var(--rule)]"}`}
                >
                  <Pic name={p.emoji} size={32} />
                </span>
                <span className="mt-1 max-w-[7rem] text-xs font-medium leading-4 text-[var(--ink)]">{p.name}</span>
                {p.role && <span className="max-w-[7rem] text-xs leading-4 text-[var(--muted)]">{p.role}</span>}
              </li>
            );
          })}
        </ul>
        {together && (
          <ol data-testid="story-beats" aria-label="Beats" className={`mt-3 flex-col gap-2 ${WIDE_ONLY} ${reduced ? "" : "story-step"}`}>
            {lines.map((b, i) => (
              <li key={i} data-testid="story-beat" className="rounded-xl border border-[var(--line)] bg-[var(--raised)] px-3 py-2">
                <p className="text-xs font-medium text-[var(--muted)]">{nameOf(b.who)}</p>
                <p className="mt-0.5 flex items-start gap-2 text-base leading-6 text-[var(--ink)]">
                  {b.emoji && <span className="mt-0.5 shrink-0"><Pic name={b.emoji} size={20} /></span>}
                  <span>{b.says}</span>
                </p>
              </li>
            ))}
          </ol>
        )}
        <div data-testid="story-stepped" aria-live="polite" aria-atomic="true" className={`mt-3 ${together ? NARROW_ONLY : ""}`}>
          <div
            key={at}
            data-testid="story-bubble"
            className={`rounded-xl border border-[var(--line)] bg-[var(--raised)] px-3 py-2 ${reduced ? "" : "story-step"}`}
          >
            <p className="text-xs font-medium text-[var(--muted)]">{nameOf(beat.who)}</p>
            <p className="mt-0.5 flex items-start gap-2 text-base leading-6 text-[var(--ink)]">
              {beat.emoji && <span className="mt-0.5 shrink-0"><Pic name={beat.emoji} size={20} /></span>}
              <span>{beat.says}</span>
            </p>
          </div>
        </div>
      </div>
      {/* Secondaries: the view's one primary is the Next chip or Send, beside this Widget (Appendix B.7, issue 478). */}
      <div data-testid="story-controls" className={`mt-2 flex flex-wrap items-center gap-2 ${together ? NARROW_ONLY : ""}`}>
        <Button variant="secondary" size="sm" onClick={back} disabled={at === 0} data-testid="story-back">
          ‹ Back
        </Button>
        {last ? (
          <Button variant="secondary" size="sm" onClick={() => setIndex(0)} data-testid="story-replay">
            Replay
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={next} data-testid="story-next">
            Next beat ›
          </Button>
        )}
        <span className="text-xs text-[var(--muted)]">
          {at + 1} of {lines.length}
        </span>
      </div>
      {caption && <p className="mt-2 text-sm leading-5 text-[var(--muted)]">{caption}</p>}
    </section>
  );
}

export const StoryScene = defineComponent({
  name: "StoryScene",
  description:
    "A short story told by a cast of emoji characters: StoryScene(cast, beats, caption, date). cast is 1 to 4 {id, emoji, name, role}; beats is 2 to 5 {who (a cast id or \"narrator\"), says (at most 16 words), emoji}; date is an ISO date stamp. No numbers asked.",
  props: storySceneProps,
  component: ({ props }: ComponentRenderProps<Props>) => <StorySceneView {...props} />,
});
