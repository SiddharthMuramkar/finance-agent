import type { TopicStartData } from "@/course/topic-start";
import { DoFirstLink } from "./course/jump-button";
import { Eyebrow } from "./ui";

/** The id the Topic bar scrolls to for the first step, which has no divider: the top of the conversation. */
export const TOPIC_START_ANCHOR = "topic-start";

/**
 * The Topic Start card (src/course/topic-start.ts), the first item of a Topic's conversation: the title and
 * the Subject (or Stage); You'll learn; Before this, each prerequisite passed or not, with Study it first
 * opening it; You'll use, left out when the Topic has no written-ahead Widgets; and the number of Checks.
 */
export function TopicStartCard({ card }: { card: TopicStartData }) {
  return (
    <section id={TOPIC_START_ANCHOR} aria-label={`Start of ${card.title}`} data-testid="topic-start" className="rounded-lg border border-[var(--border)] p-4">
      <Eyebrow className="mb-1">{card.where}</Eyebrow>
      <h2 className="text-base font-semibold leading-6">{card.title}</h2>
      {card.youllLearn.length > 0 && (
        <>
          <Eyebrow className="mb-1 mt-3">You&rsquo;ll learn</Eyebrow>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-5">
            {card.youllLearn.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        </>
      )}
      <Eyebrow className="mb-1 mt-3">Before this</Eyebrow>
      {card.before.length === 0 ? (
        <p className="text-sm leading-5">Nothing — this is a starting Topic.</p>
      ) : (
        <ul className="space-y-1 text-sm leading-5">
          {card.before.map((p) => (
            <li key={p.id} data-prerequisite={p.id}>
              {p.title}{" "}
              {p.passed ? (
                <span className="text-[var(--muted)]">✓ passed</span>
              ) : (
                <span className="text-[var(--muted)]">
                  not passed yet · <DoFirstLink topicId={p.id} title={p.title} label="Study it first" />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {card.uses.length > 0 && (
        <p className="mt-3 text-sm leading-5">
          <span className="font-medium">You&rsquo;ll use:</span> {card.uses.join(", ")}
        </p>
      )}
      <p className="mt-3 text-xs leading-4 text-[var(--muted)]">
        {card.checks} {card.checks === 1 ? "Check" : "Checks"}
      </p>
    </section>
  );
}
