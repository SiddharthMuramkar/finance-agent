import type { ConceptCardData } from "@/tutor/session-item-kinds";

/** The card's data when it is one (an older or broken row draws nothing). */
export function conceptCardOf(data: Record<string, unknown>): ConceptCardData | null {
  const { checkId, title, lines, writeDown } = data;
  if (typeof title !== "string" || typeof writeDown !== "string" || !Array.isArray(lines) || !lines.every((l) => typeof l === "string")) return null;
  return { checkId: typeof checkId === "string" ? checkId : "", title, lines: lines as string[], writeDown };
}

/**
 * A Concept card in the conversation (spec #229): code shows it when the Learner enters a converted Concept step, copied
 * from the Topic file, so a reload shows the same card. Plain lines, with the line to write down in bold.
 */
export function ConceptCardView({ card }: { card: ConceptCardData }) {
  return (
    <section data-testid="concept-card" aria-label={`Concept card: ${card.title}`} className="self-stretch rounded-xl border border-[var(--line)] px-4 py-3 text-sm leading-6">
      <h3 className="mb-1">
        <span className="type-eyebrow block text-[var(--muted)]">Concept card</span>
        <span className="sr-only"> · </span>
        <span className="block text-base font-semibold leading-6 text-[var(--ink)]">{card.title}</span>
      </h3>
      {card.lines.map((line, i) => (
        <p key={i}>{line}</p>
      ))}
      <p data-testid="concept-card-write-down" className="mt-1 font-semibold">
        {card.writeDown}
      </p>
    </section>
  );
}
