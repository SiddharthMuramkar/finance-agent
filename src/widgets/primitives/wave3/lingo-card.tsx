"use client";

import { defineComponent, type ComponentRenderProps } from "@openuidev/react-lang";
import { useState } from "react";
import { z } from "zod/v4";
import { Button, Tag } from "@/app/primitives";
import { usePrefersReducedMotion } from "../wave1/motion";
import { motionFlag, Pic } from "./shared";

// LingoCard: one piece of finance lingo. The front says it like a pro, then what it means and an everyday example.
// In the story turns the card over (300 ms) to show the word in the story. Violet is the colour of lingo; the story side
// is sunflower and peeks out behind the card, so the Learner can see there is another side. At rest the card still has a
// picture (the example's emoji as a tilted sticker) and a voice (the pro's line in a speech bubble), so a still frame
// reads as a moment, not a page of text (ticket R-E2a).

export const lingoCardProps = z.object({
  term: z.string().describe('The word or phrase, e.g. "Yield"'),
  pro: z.string().describe('How to say it like a pro: at most 14 words, e.g. "a bond\'s yield is the income it pays each year"'),
  means: z.string().describe("The plain meaning: at most 20 words"),
  example: z.string().describe("An everyday example: at most 20 words"),
  emoji: z.string().describe("An emoji name for the example, e.g. house"),
  inStory: z.string().optional().describe("The word in the story: at most 20 words; adds the In the story button"),
});

type Props = z.infer<typeof lingoCardProps>;

export function LingoCardView({ term, pro, means, example, emoji, inStory }: Props) {
  const reduced = usePrefersReducedMotion();
  const [flipped, setFlipped] = useState(false);
  if (!term) return <p className="py-2 text-sm text-[var(--muted)]">The word is still arriving.</p>;
  const turned = flipped && !!inStory;
  // Each face is opaque (--field) under its tint: the tints are see-through in Dark, and the story side must not show through.
  const face = "lingo-face overflow-hidden rounded-xl border bg-[var(--field)] shadow-[0_6px_16px_-8px_var(--shadow)]";
  return (
    <section data-testid="lingo-card" data-motion={motionFlag(reduced)} aria-label={`Lingo: ${term}`} className="@container py-1">
      <div className="lingo-turn relative">
        {inStory && (
          <div
            data-testid="lingo-peek"
            aria-hidden="true"
            className="absolute inset-0 translate-x-2 translate-y-2 rounded-xl border border-[var(--sun)] bg-[var(--sun-tag)]"
          />
        )}
        <div className="lingo-inner relative" data-flipped={turned}>
          <div data-testid="lingo-front" aria-hidden={turned} inert={turned} className={`${face} border-[var(--violet)]`}>
            <div className="h-full bg-[var(--violet-tint)] p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <Tag tone="violet">Lingo</Tag>
                  <p className="mt-1 text-2xl font-bold leading-8 text-[var(--violet-ink)]">{term}</p>
                  <p className="mt-1 text-base leading-6 text-[var(--ink)]">{means}</p>
                </div>
                <span
                  data-testid="lingo-sticker"
                  aria-hidden="true"
                  className={`grid size-20 shrink-0 rotate-6 place-items-center rounded-2xl border-2 border-[var(--violet)] bg-[var(--violet-tag)] shadow-[0_4px_10px_-4px_var(--shadow)] ${reduced ? "" : "story-pop"}`}
                >
                  <Pic name={emoji} size={64} />
                </span>
              </div>
              <div data-testid="lingo-pro" className="mt-3 flex items-end gap-2">
                <span aria-hidden="true" className="shrink-0">
                  <Pic name="speech-balloon" size={32} />
                </span>
                <p className="min-w-0 rounded-2xl rounded-bl-sm border border-[var(--violet)] bg-[var(--field)] px-3 py-2 text-sm leading-5 text-[var(--ink)]">
                  <span className="font-semibold text-[var(--violet-ink)]">Say it like a pro: </span>
                  <strong className="font-semibold">{pro}</strong>
                </p>
              </div>
              <p className="mt-3 flex items-center gap-3 rounded-lg bg-[var(--field)] px-3 py-2 text-sm leading-5 text-[var(--ink)]">
                <span className="shrink-0">
                  <Pic name={emoji} size={32} />
                </span>
                <span>
                  <span className="font-semibold text-[var(--violet-ink)]">For example: </span>
                  {example}
                </span>
              </p>
            </div>
          </div>
          <div data-testid="lingo-back" aria-hidden={!turned} inert={!turned} className={`${face} lingo-face-back border-[var(--sun)]`}>
            <div className="flex h-full items-center gap-3 bg-[var(--sun-tint)] p-4">
              <div className="min-w-0 flex-1">
                <Tag tone="sun">In the story</Tag>
                <p className="mt-1 text-xl font-bold leading-7 text-[var(--violet-ink)]">{term}</p>
                <p className="mt-2 text-lg leading-7 text-[var(--ink)]">{inStory}</p>
              </div>
              <span aria-hidden="true" className="grid size-20 shrink-0 -rotate-6 place-items-center rounded-2xl border-2 border-[var(--sun)] bg-[var(--sun-tag)] shadow-[0_4px_10px_-4px_var(--shadow)]">
                <Pic name={emoji} size={64} />
              </span>
            </div>
          </div>
        </div>
      </div>
      {inStory && (
        <div className="mt-3">
          <Button variant="secondary" size="sm" pressed={turned} onClick={() => setFlipped((v) => !v)} className="story-toggle" data-testid="lingo-flip">
            <span aria-hidden="true">↻</span> In the story
          </Button>
        </div>
      )}
    </section>
  );
}

export const LingoCard = defineComponent({
  name: "LingoCard",
  description:
    "One piece of lingo: LingoCard(term, pro, means, example, emoji, inStory). pro is how to say it like a pro (at most 14 words), means at most 20, example at most 20; inStory (optional) turns the card to show the word in the story.",
  props: lingoCardProps,
  component: ({ props }: ComponentRenderProps<Props>) => <LingoCardView {...props} />,
});
