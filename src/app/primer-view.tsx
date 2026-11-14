"use client";

import { useContext, useState } from "react";
import type { PrimerData } from "@/course/primers";
import type { QuickTryData } from "@/tutor/session-item-kinds";
import { DoFirstLink } from "./course/jump-button";
import { QuickTryContext, QuickTryView } from "./quick-try-view";
import { SecondaryButton } from "./ui";

/** The Elective that teaches the Primer's idea in depth: opened by choosing it, or the Course Map while it is Coming. */
function ElectiveLink({ elective }: { elective: PrimerData["primer"]["elective"] }) {
  if (elective.written) return <DoFirstLink topicId={elective.id} title={elective.title} />;
  return (
    <a href="/course" data-affordance="link" data-elective={elective.id} className="link">
      {elective.title} (coming)
    </a>
  );
}

/**
 * A Primer in the conversation (spec 2026-11-12, C3): a two-minute stop inside a Spine Topic, stored by code where the
 * Topic file places it. At most three lines, one Lingo term as a card, one Quick try (answered and marked like any other,
 * through the Study Workspace's Quick try host), and a link to the Elective that teaches the idea in depth. "I know
 * this" passes over it: the Primer folds to one line, now and after a reload. With no host (a passed Topic, Past
 * Sessions) it draws read-only, with no button.
 */
export function PrimerView({ data }: { data: PrimerData }) {
  const host = useContext(QuickTryContext);
  const [passed, setPassed] = useState(data.primer.passed === true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { primer } = data;
  const answered = host?.answered.has(data.key) ?? false;
  const quickTry: QuickTryData = { key: data.key, checkId: data.checkId, skillId: data.skillId, prompt: data.prompt, kind: data.kind, choices: data.choices };

  const pass = async () => {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/primer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: data.key }) }).catch(() => null);
    setBusy(false);
    if (response?.ok) setPassed(true);
    else setError("That could not be saved. Try again.");
  };

  return (
    <section
      data-testid="primer"
      data-passed={passed ? "true" : undefined}
      aria-label={`Primer: ${primer.title}`}
      className="self-stretch rounded-xl border border-[var(--line)] px-4 py-3 text-sm leading-6"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="mb-1">
          <span className="type-eyebrow block text-[var(--muted)]">Primer · two minutes</span>
          <span className="sr-only"> · </span>
          <span className="block text-base font-semibold leading-6 text-[var(--ink)]">{primer.title}</span>
        </h3>
        {host && !passed && !answered && (
          <SecondaryButton data-testid="primer-know-this" onClick={() => void pass()} disabled={busy || host.locked}>
            I know this
          </SecondaryButton>
        )}
      </div>
      {passed ? (
        <p data-testid="primer-passed" className="text-[var(--muted)]">
          Passed over. In depth: <ElectiveLink elective={primer.elective} />
        </p>
      ) : (
        <>
          {primer.lines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
          <dl data-testid="primer-term" aria-label={`Lingo: ${primer.term.term}`} className="mt-2 rounded-lg border border-[var(--line)] bg-[var(--wash)] px-3 py-2">
            <dt className="font-semibold text-[var(--ink)]">{primer.term.term}</dt>
            <dd>{primer.term.means}</dd>
            {primer.term.example && <dd className="text-[var(--muted)]">{primer.term.example}</dd>}
          </dl>
          <div className="mt-2 flex">
            <QuickTryView data={quickTry} />
          </div>
          <p data-testid="primer-elective" className="mt-2 text-xs leading-4 text-[var(--muted)]">
            In depth: <ElectiveLink elective={primer.elective} />
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="mt-1 text-xs text-[var(--danger)]">
          {error}
        </p>
      )}
    </section>
  );
}
