import type { ReactNode } from "react";
import type { Topic } from "@/course/map";
import type { NextOffer } from "@/course/navigator";
import type { NextName } from "@/tutor/next";
import { Eyebrow, SecondaryButton } from "./ui";

// Small presentational pieces of the workspace's left column (issue #44).

const STAGE_NAMES: Record<Topic["stage"], string> = { foundation: "Foundation", follow: "Follow", judge: "Judge", analyse: "Analyse" };

/** Where the Learner is on the Course Map: their current Topic and its Stage. Null before any Topic. */
export type Place = { stage: Topic["stage"]; title: string } | null;

/**
 * A Topic passed in a turn, whose Session stays on screen until the Learner chooses where to go: its title,
 * and What comes next's label (null once every Topic is passed). Null while the shown Session is the current Topic's.
 */
export type PassedTopic = { title: string; next: string | null } | null;

/** The status card: "Course Map · Stage · Topic" and the plain summary. The way forward is the Next chip under the latest reply. */
export function StatusCard({ place, summary }: { place: Place; summary: string }) {
  const eyebrow = ["Course Map", place && STAGE_NAMES[place.stage], place?.title].filter(Boolean).join(" · ");
  return (
    <section aria-label="Where you stand" className="rounded-lg border border-[var(--border)] p-4">
      <Eyebrow className="mb-1">{eyebrow}</Eyebrow>
      <p className="whitespace-pre-line text-sm leading-5">{summary}</p>
    </section>
  );
}

/** The words "Just tell me" posts as the Learner's own message at an unsettled Explore. */
export const JUST_TELL_ME = "Just tell me.";

/**
 * The Next chip under the latest Tutor reply or card, from the Course Navigator's offer: "Next: <step> →",
 * "Complete this Topic →", or "Just tell me →" at an unsettled Explore (which posts "Just tell me." as the
 * Learner's message). Next and Complete send no Learner message: code writes the turn's note.
 */
export function NextChip({ offer, onNext, onJustTellMe }: { offer: NextOffer; onNext: (named: NextName) => void; onJustTellMe: () => void }) {
  const press = () => (offer.kind === "just_tell_me" ? onJustTellMe() : onNext(offer.kind === "complete" ? "complete" : offer.step));
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <SecondaryButton data-testid="next-chip" onClick={press}>
        {offer.label} →
      </SecondaryButton>
    </div>
  );
}

/** One folded row ("Spaced review · 2 due · Show") that opens in place. `open` starts it open. */
export function FoldedRow({ label, open, children, ...rest }: { label: ReactNode; open?: boolean; children: ReactNode } & { "data-testid"?: string }) {
  return (
    <details open={open} className="group rounded-lg border border-[var(--border)]" {...rest}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm leading-5 [&::-webkit-details-marker]:hidden">
        <span>{label}</span>
        <span className="text-xs leading-4 text-[var(--muted)]">
          <span className="group-open:hidden">Show</span>
          <span className="hidden group-open:inline">Hide</span>
        </span>
      </summary>
      <div className="border-t border-[var(--hairline)] p-4">{children}</div>
    </details>
  );
}
