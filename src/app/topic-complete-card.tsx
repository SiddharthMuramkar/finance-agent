import type { TopicCompleteData } from "@/tutor/topic-complete-card";
import { WhatComesNextButton } from "./course/jump-button";
import { Eyebrow, secondaryButtonClass } from "./ui";

/**
 * The Topic complete card (src/tutor/topic-complete.ts), the last item of a passed Topic's conversation: the
 * principle in a line or two, "Saved to your Notebook ✓", What comes next ("Next Topic: <title> →", or "New in
 * <Topic>: Check N →" for a Due Check) and the Course Map. It stays on screen until the Learner chooses.
 */
export function TopicCompleteCard({ card }: { card: TopicCompleteData }) {
  return (
    <section aria-label={`${card.title}: Topic complete`} data-testid="topic-complete-card" className="rounded-lg border border-[var(--border)] p-4">
      <Eyebrow className="mb-1">Topic complete</Eyebrow>
      <h2 className="text-base font-semibold leading-6">{card.title}</h2>
      <p className="mt-2 text-sm leading-5">{card.principle}</p>
      {card.found && card.found.length > 0 && (
        <ul data-testid="topic-found" aria-label="What you found" className="mt-2 list-disc space-y-0.5 pl-5 text-sm leading-5">
          {card.found.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs leading-4 text-[var(--you)]">Saved to your Notebook ✓</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {card.next && <WhatComesNextButton label={card.next} />}
        <a href="/course" className={secondaryButtonClass}>
          Course Map
        </a>
      </div>
    </section>
  );
}
