"use client";

import { defineComponent, type ComponentRenderProps } from "@openuidev/react-lang";
import { useState, type KeyboardEvent } from "react";
import { z } from "zod/v4";
import { Button } from "@/app/primitives";
import { usePrefersReducedMotion } from "../wave1/motion";
import { dayLabel, motionFlag, Pic } from "./shared";

// StoryScene: a stage with a small cast and a speech bubble that tells one beat at a time. The Learner taps Next beat
// (or presses the right arrow) to move on, the left arrow to go back, and Replay at the end. Sunflower is the colour of
// stories and history. No numbers are asked for.

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

/** The cast's size: 64 px, 80 px on a wide stage (the floor), 96 px in a 480 px tall panel and 112 px from 640 px. */
export const CAST_SIZE =
  "[&_img]:size-16 @min-[720px]:[&_img]:size-20 [@container_pane_(min-height:480px)]:[&_img]:size-24 [@container_pane_(min-height:640px)]:[&_img]:size-28";

export function StorySceneView({ cast, beats, caption, date }: Props) {
  const reduced = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const people = (cast ?? []).filter((p) => p && typeof p.id === "string").slice(0, 4);
  const lines = (beats ?? []).filter((b) => b && typeof b.says === "string").slice(0, 5);
  if (people.length === 0 || lines.length === 0) {
    return <p data-testid="story-scene-problem" className="py-2 text-sm text-[var(--muted)]">The story is still arriving.</p>;
  }
  const at = Math.min(index, lines.length - 1);
  const beat = lines[at];
  const last = at === lines.length - 1;
  const speaker = people.find((p) => p.id === beat.who);
  const stamp = dayLabel(date);
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
    <section data-testid="story-scene" data-motion={motionFlag(reduced)} aria-label="Story" onKeyDown={onKeyDown} className="@container py-1">
      <div
        data-testid="story-stage"
        onClick={() => !last && next()}
        className={`relative rounded-xl border border-[var(--sun)] bg-[var(--sun-tint)] px-3 pb-3 pt-4 ${STAGE_GROW}`}
      >
        {stamp && (
          <p
            data-testid="story-date"
            className="mb-2 inline-block self-start -rotate-2 rounded-md border border-dashed border-[var(--sun-ink)] bg-[var(--sun-tag)] px-2 py-0.5 text-xs font-semibold tracking-wide text-[var(--sun-ink)]"
          >
            {stamp}
          </p>
        )}
        <ul className="flex items-end justify-center gap-4" aria-label="Cast">
          {people.map((p) => {
            const talking = speaker?.id === p.id;
            return (
              <li key={p.id} className="flex min-w-0 flex-col items-center text-center" style={{ opacity: speaker && !talking ? 0.65 : 1 }}>
                <span
                  key={talking ? `${p.id}-${at}` : p.id}
                  data-speaking={talking ? "true" : undefined}
                  className={`block ${CAST_SIZE} ${talking && !reduced ? "story-bounce" : ""}`}
                >
                  <Pic name={p.emoji} size={64} />
                </span>
                <span className="mt-1 max-w-[7rem] text-xs font-semibold leading-4 text-[var(--ink)]">{p.name}</span>
                {p.role && <span className="max-w-[7rem] text-xs leading-4 text-[var(--sun-ink)]">{p.role}</span>}
              </li>
            );
          })}
        </ul>
        <div aria-live="polite" aria-atomic="true" className="mt-3">
          <div
            key={at}
            data-testid="story-bubble"
            className={`rounded-xl border border-[var(--sun-ink)] bg-[var(--field)] px-3 py-2 ${reduced ? "" : "story-bubble-in"}`}
          >
            <p className="text-xs font-semibold text-[var(--sun-ink)]">{speaker ? speaker.name : "Narrator"}</p>
            <p className="mt-0.5 flex items-start gap-2 text-base leading-6 text-[var(--ink)]">
              {beat.emoji && <span className="mt-0.5 shrink-0"><Pic name={beat.emoji} size={24} /></span>}
              <span>{beat.says}</span>
            </p>
          </div>
        </div>
      </div>
      {/* Secondaries: the view's one primary is the Next chip or Send, beside this Widget (Appendix B.7, issue 478). */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
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
      {caption && <p className="mt-2 text-sm italic leading-5 text-[var(--muted)]">{caption}</p>}
    </section>
  );
}

export const StoryScene = defineComponent({
  name: "StoryScene",
  description:
    "A short story told one beat at a time by a cast of emoji characters: StoryScene(cast, beats, caption, date). cast is 1 to 4 {id, emoji, name, role}; beats is 2 to 5 {who (a cast id or \"narrator\"), says (at most 16 words), emoji}; date is an ISO date stamp. No numbers asked.",
  props: storySceneProps,
  component: ({ props }: ComponentRenderProps<Props>) => <StorySceneView {...props} />,
});
