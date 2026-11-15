"use client";

import { defineComponent, type ComponentRenderProps } from "@openuidev/react-lang";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { z } from "zod/v4";
import { Button, Tag } from "@/app/primitives";
import { usePrefersReducedMotion } from "../wave1/motion";
import { motionFlag, Pic } from "./shared";

// LingoCard: one piece of finance lingo. The front gives the term, what it means, how to say it like a pro and an
// everyday example. In the story turns the card over (300 ms) to show the word in the story. Both faces are quiet cards on
// the raised surface: the front has a 2 px violet edge (violet is the colour of lingo) and the story side a 2 px sunflower
// edge, each named by its Tag. At rest the card still has a picture (the example's Icon in a hairline box) and a voice
// (the pro's line beside a speech Icon), so a still frame reads as a moment, not a page of text (tickets R-E2a, A9a). No
// sticker, tilt, tint or peek (ADR 0018).

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
  // Each face is opaque (--raised), with no tint, so the story side never shows through the front while the card turns.
  const face = "lingo-face overflow-hidden rounded-xl border border-[var(--rule)] bg-[var(--raised)]";
  return (
    <section data-testid="lingo-card" data-motion={motionFlag(reduced)} aria-label={`Lingo: ${term}`} className="@container py-1">
      <div className="lingo-turn relative">
        <div className="lingo-inner relative" data-flipped={turned}>
          <div data-testid="lingo-front" aria-hidden={turned} inert={turned} className={`${face} border-l-2 border-l-[var(--violet)]`}>
            <div className="h-full p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <Tag tone="violet">Lingo</Tag>
                  <p data-key-figure="" className="mt-1 text-2xl leading-8 text-[var(--ink)]">{term}</p>
                  <p className="mt-1 text-base leading-6 text-[var(--ink)]">{means}</p>
                </div>
                <span
                  data-testid="lingo-sticker"
                  aria-hidden="true"
                  className="grid size-12 shrink-0 place-items-center rounded-lg border border-[var(--rule)]"
                >
                  <Pic name={emoji} size={24} />
                </span>
              </div>
              <div data-testid="lingo-pro" className="mt-3 flex items-start gap-2">
                <span aria-hidden="true" className="shrink-0">
                  <Pic name="speech-balloon" size={16} />
                </span>
                <p className="min-w-0 text-sm leading-5 text-[var(--ink)]">
                  <span className="font-medium text-[var(--muted)]">Say it like a pro: </span>
                  <span>{pro}</span>
                </p>
              </div>
              <p className="mt-3 flex items-center gap-3 text-sm leading-5 text-[var(--ink)]">
                <span className="shrink-0">
                  <Pic name={emoji} size={20} />
                </span>
                <span>
                  <span className="font-medium text-[var(--muted)]">For example: </span>
                  {example}
                </span>
              </p>
            </div>
          </div>
          <div data-testid="lingo-back" aria-hidden={!turned} inert={!turned} className={`${face} lingo-face-back border-l-2 border-l-[var(--sun)]`}>
            <div className="flex h-full items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <Tag tone="sun">In the story</Tag>
                <p className="mt-1 text-xl font-medium text-[var(--ink)]">{term}</p>
                <p className="mt-2 text-base leading-6 text-[var(--ink)]">{inStory}</p>
              </div>
              <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-lg border border-[var(--rule)]">
                <Pic name={emoji} size={24} />
              </span>
            </div>
          </div>
        </div>
      </div>
      {inStory && (
        <div className="mt-3">
          <Button variant="secondary" size="sm" pressed={turned} onClick={() => setFlipped((v) => !v)} data-testid="lingo-flip">
            <RotateCcw size={16} strokeWidth={1.75} aria-hidden /> In the story
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
