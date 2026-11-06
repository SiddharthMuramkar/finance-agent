"use client";

import { defineComponent, type ComponentRenderProps } from "@openuidev/react-lang";
import { useState } from "react";
import { z } from "zod/v4";
import { Button, Tag } from "@/app/primitives";
import { usePrefersReducedMotion } from "../wave1/motion";
import { motionFlag, Pic } from "./shared";

// TwoPaths: two characters make two choices. "See what happened" under each reveals its outcome as a row of objects
// (two houses against one), never as numbers. Both paths are a story, so both carry sunflower (Appendix A); the sides
// differ by place, character and choice, never by an accent that means something else (violet is lingo).
// At rest it is already a story moment (ticket R-E2a, CL-1): each character stands large on a sunflower sticker tilted
// towards the other path, their choice sits in a borderless thought bubble (so it never reads as a button), "or" stands between the paths, and a dashed slot with an
// hourglass waits for the Learner until the outcome replaces it.

const pathProps = z.object({
  emoji: z.string().describe("An emoji name for the character"),
  name: z.string(),
  choice: z.string().describe("What they chose: at most 10 words"),
  outcome: z.array(z.string()).describe("1 to 6 emoji names that show what they ended up with"),
  outcomeLine: z.string().describe("The outcome in words: at most 14 words, and no digits"),
});

export const twoPathsProps = z.object({
  question: z.string().describe("At most 20 words"),
  left: pathProps,
  right: pathProps,
});

type Props = z.infer<typeof twoPathsProps>;
type Path = z.infer<typeof pathProps>;

/** What is wrong with a path, in words, or null: an outcome line carrying a digit would turn the picture back into a sum. */
export function pathProblem(path: Path | undefined): string | null {
  if (!path || typeof path.outcomeLine !== "string") return "A path is still arriving";
  if (/\d/.test(path.outcomeLine)) return "The outcome line must use words, not digits";
  return null;
}

function PathCard({ path, tone }: { path: Path; tone: "left" | "right" }) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(false);
  const objects = (path.outcome ?? []).slice(0, 6);
  // Each card is opaque (--field) under its sunflower tint: the tints are see-through in Dark.
  return (
    <div
      data-testid="path"
      data-side={tone}
      className="min-w-0 overflow-hidden rounded-xl border border-t-4 border-[var(--sun)] bg-[var(--field)] shadow-[0_6px_16px_-8px_var(--shadow)]"
    >
      <div className="flex h-full flex-col gap-3 bg-[var(--sun-tint)] p-3">
        <div className="flex items-center gap-3">
          <span
            data-testid="path-sticker"
            aria-hidden="true"
            className={`grid size-20 shrink-0 place-items-center rounded-2xl border-2 border-[var(--sun)] bg-[var(--sun-tag)] shadow-[0_4px_10px_-4px_var(--shadow)] ${tone === "left" ? "-rotate-3" : "rotate-3"} ${reduced ? "" : "story-pop"}`}
          >
            <span key={shown ? "told" : "waiting"} data-testid="path-character" className={shown && !reduced ? "story-bounce" : ""}>
              <Pic name={path.emoji} size={64} />
            </span>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold leading-7 text-[var(--ink)]">{path.name}</p>
            <div data-testid="path-choice" className="mt-1 flex items-end gap-1.5">
              <span aria-hidden="true" className="shrink-0">
                <Pic name="thought-balloon" size={24} />
              </span>
              <p className="min-w-0 rounded-2xl rounded-bl-sm bg-[var(--field)] px-3 py-1.5 text-sm italic leading-5 text-[var(--ink)]">
                {path.choice}
              </p>
            </div>
          </div>
        </div>
        <div aria-live="polite">
          {shown ? (
            <div data-testid="path-outcome" className={`rounded-lg border border-[var(--sun)] bg-[var(--field)] px-3 py-2 ${reduced ? "" : "story-pop"}`}>
              <p className="flex flex-wrap items-center gap-1" aria-hidden="true">
                {objects.map((name, i) => (
                  <Pic key={i} name={name} size={32} />
                ))}
              </p>
              <p className="mt-1 text-sm font-medium leading-5 text-[var(--ink)]">{path.outcomeLine}</p>
            </div>
          ) : (
            <div data-testid="path-waiting" className="flex min-h-14 items-center gap-2 rounded-lg border-2 border-dashed border-[var(--sun)] bg-[var(--field)] px-3 py-2">
              <span aria-hidden="true" className="shrink-0">
                <Pic name="hourglass-not-done" size={32} />
              </span>
              <p className="text-sm leading-5 text-[var(--muted)]">What happened to {path.name}?</p>
            </div>
          )}
        </div>
        <div className="mt-auto">
          <Button variant="secondary" size="sm" aria-expanded={shown} onClick={() => setShown((v) => !v)} className="story-toggle" data-testid="path-reveal">
            See what happened
          </Button>
        </div>
      </div>
    </div>
  );
}

export function TwoPathsView({ question, left, right }: Props) {
  const reduced = usePrefersReducedMotion();
  const problem = pathProblem(left) ?? pathProblem(right);
  if (problem) return <p data-testid="two-paths-problem" className="py-2 text-sm text-[var(--muted)]">{problem}.</p>;
  return (
    <section data-testid="two-paths" data-motion={motionFlag(reduced)} aria-label="Two paths" className="@container py-1">
      <Tag tone="sun">Two paths</Tag>
      <p className="mt-1 mb-3 text-base font-semibold leading-6 text-[var(--ink)]">{question}</p>
      <div className="grid grid-cols-1 items-stretch gap-2 @min-[520px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <PathCard path={left} tone="left" />
        <span
          data-testid="paths-or"
          aria-hidden="true"
          className="self-center justify-self-center text-sm font-bold uppercase tracking-wide text-[var(--sun-ink)]"
        >
          or
        </span>
        <PathCard path={right} tone="right" />
      </div>
    </section>
  );
}

export const TwoPaths = defineComponent({
  name: "TwoPaths",
  description:
    "Two characters, two choices, two outcomes shown as objects: TwoPaths(question, left, right). left and right are {emoji, name, choice (at most 10 words), outcome (1 to 6 emoji names), outcomeLine (at most 14 words, no digits)}.",
  props: twoPathsProps,
  component: ({ props }: ComponentRenderProps<Props>) => <TwoPathsView {...props} />,
});
