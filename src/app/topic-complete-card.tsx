import type { TopicCompleteData } from "@/tutor/topic-complete-card";
import { WhatComesNextButton } from "./course/jump-button";
import { secondaryButtonClass } from "./ui";

/**
 * The Topic complete card (src/tutor/topic-complete.ts), the last item of a passed Topic's conversation: the
 * principle in a line or two, "Saved to your Notebook ✓", What comes next ("Next Topic: <title> →", or "New in
 * <Topic>: Check N →" for a Due Check) and the Course Map. It stays on screen until the Learner chooses.
 * The pass is marked in the success status (ADR 0013, status is never colour alone; #479): a success-tint fill under ink
 * text, a hairline border and a success "Topic complete ✓" eyebrow, whose words and tick say it. Tokens only.
 */
export function TopicCompleteCard({ card }: { card: TopicCompleteData }) {
  return (
    <section aria-label={`${card.title}: Topic complete`} data-testid="topic-complete-card" className="rounded-xl border border-[var(--line)] bg-[var(--success-tint)] p-4">
      <p className="type-eyebrow mb-1 text-[var(--success)]">Topic complete ✓</p>
      <h2 className="text-base font-semibold leading-6">{card.title}</h2>
      <p className="mt-2 text-sm leading-5">{card.principle}</p>
      {card.found && card.found.length > 0 && (
        <ul data-testid="topic-found" aria-label="What you found" className="mt-2 list-disc space-y-0.5 pl-5 text-sm leading-5">
          {card.found.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs leading-4 text-[var(--success)]">Saved to your Notebook ✓</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {card.next && <WhatComesNextButton label={card.next} />}
        <a href="/course" data-affordance="button" className={secondaryButtonClass}>
          Course Map
        </a>
      </div>
    </section>
  );
}
