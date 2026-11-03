import type { TopicCompleteData } from "@/tutor/topic-complete-card";
import { WhatComesNextButton } from "./course/jump-button";
import { Eyebrow } from "./ui";

/**
 * The Topic complete card (src/tutor/topic-complete.ts), the last item of a passed Topic's conversation: the
 * principle in a line or two, "Saved to your Notes ✓", What comes next ("Next Topic: <title> →", or "New in
 * <Topic>: Check N →" for a Due Check) and the Course Map. It stays on screen until the Learner chooses.
 */
export function TopicCompleteCard({ card }: { card: TopicCompleteData }) {
  return (
    <section aria-label={`${card.title}: Topic complete`} data-testid="topic-complete-card" className="rounded-lg border border-[var(--border)] p-4">
      <Eyebrow className="mb-1">Topic complete</Eyebrow>
      <h2 className="text-base font-semibold leading-6">{card.title}</h2>
      <p className="mt-2 text-sm leading-5">{card.principle}</p>
      <p className="mt-2 text-xs leading-4 text-[var(--you)]">Saved to your Notes ✓</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {card.next && <WhatComesNextButton label={card.next} />}
        <a href="/course" className="text-sm leading-5 underline">
          Course Map
        </a>
      </div>
    </section>
  );
}
