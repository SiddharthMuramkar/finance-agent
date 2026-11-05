"use client";

import { defineComponent, type ComponentRenderProps } from "@openuidev/react-lang";
import { useState } from "react";
import { z } from "zod/v4";
import { Button } from "@/app/primitives";
import { usePrefersReducedMotion } from "../wave1/motion";
import { motionFlag, Pic } from "./shared";

// LingoCard: one piece of finance lingo. The front says it like a pro, then what it means and an everyday example.
// In the story turns the card over (300 ms) to show the word in the story. Violet is the colour of lingo.

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
  return (
    <section data-testid="lingo-card" data-motion={motionFlag(reduced)} aria-label={`Lingo: ${term}`} className="@container py-1">
      <div className="lingo-turn">
        <div className="lingo-inner" data-flipped={turned}>
          <div
            data-testid="lingo-front"
            aria-hidden={turned}
            inert={turned}
            className="lingo-face rounded-xl border border-[var(--violet)] bg-[var(--violet-tint)] p-4"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--violet-ink)]">Lingo</p>
            <p className="mt-1 text-2xl font-bold leading-8 text-[var(--violet-ink)]">{term}</p>
            <p className="mt-2 text-sm leading-5 text-[var(--ink)]">
              Say it like a pro: <strong className="font-semibold">{pro}</strong>
            </p>
            <p className="mt-2 text-base leading-6 text-[var(--ink)]">{means}</p>
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
          <div
            data-testid="lingo-back"
            aria-hidden={!turned}
            inert={!turned}
            className="lingo-face lingo-face-back rounded-xl border border-[var(--sun)] bg-[var(--sun-tint)] p-4"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sun-ink)]">In the story</p>
            <p className="mt-1 text-xl font-bold leading-7 text-[var(--violet-ink)]">{term}</p>
            <p className="mt-2 flex items-start gap-3 text-base leading-6 text-[var(--ink)]">
              <span className="shrink-0">
                <Pic name={emoji} size={32} />
              </span>
              <span>{inStory}</span>
            </p>
          </div>
        </div>
      </div>
      {inStory && (
        <div className="mt-2">
          <Button variant="secondary" size="sm" pressed={turned} onClick={() => setFlipped((v) => !v)} className="story-toggle" data-testid="lingo-flip">
            In the story
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
