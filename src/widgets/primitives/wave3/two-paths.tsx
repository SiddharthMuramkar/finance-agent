"use client";

import { defineComponent, type ComponentRenderProps } from "@openuidev/react-lang";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { z } from "zod/v4";
import { Button, Tag } from "@/app/primitives";
import { usePrefersReducedMotion } from "../wave1/motion";
import { motionFlag, Pic } from "./shared";

// TwoPaths: two characters make two choices. "See what happened" under each reveals its outcome as a row of Icons
// (two houses against one), never as numbers. Both paths are a story, so both carry sunflower (Appendix A); the sides
// differ by place, character and choice, never by an accent that means something else (violet is lingo).
// At rest it is already a story moment (tickets R-E2a, CL-1, A9b): each path is a quiet card with a 2 px sunflower top
// edge, its character's Icon sits in a plain hairline circle, their choice is plain text beside a thought-balloon Icon (so
// it never reads as a button), "or" stands between the paths, and a dashed slot with an hourglass Icon waits for the
// Learner until the outcome replaces it. See what happened is the app's secondary Button; its chevron points up while the
// outcome is open.

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
  // Each card is opaque (--raised) with a 2 px sunflower top edge and no tint (ADR 0015).
  return (
    <div
      data-testid="path"
      data-side={tone}
      className="min-w-0 overflow-hidden rounded-xl border border-[var(--rule)] border-t-2 border-t-[var(--sun)] bg-[var(--raised)]"
    >
      <div className="flex h-full flex-col gap-3 p-3">
        <div className="flex items-center gap-3">
          <span
            data-testid="path-sticker"
            aria-hidden="true"
            className="grid size-12 shrink-0 place-items-center rounded-full border border-[var(--rule)]"
          >
            <span key={shown ? "told" : "waiting"} data-testid="path-character">
              <Pic name={path.emoji} size={24} />
            </span>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-medium text-[var(--ink)]">{path.name}</p>
            <div data-testid="path-choice" className="mt-1 flex items-start gap-1.5">
              <span aria-hidden="true" className="shrink-0">
                <Pic name="thought-balloon" size={16} />
              </span>
              <p className="min-w-0 text-sm leading-5 text-[var(--ink-2)]">{path.choice}</p>
            </div>
          </div>
        </div>
        <div aria-live="polite">
          {shown ? (
            <div data-testid="path-outcome" className={`rounded-lg border border-[var(--rule)] bg-[var(--raised)] px-3 py-2 ${reduced ? "" : "story-step"}`}>
              <p className="flex flex-wrap items-center gap-1" aria-hidden="true">
                {objects.map((name, i) => (
                  <Pic key={i} name={name} size={24} />
                ))}
              </p>
              <p className="mt-1 text-sm font-medium leading-5 text-[var(--ink)]">{path.outcomeLine}</p>
            </div>
          ) : (
            <div data-testid="path-waiting" className="flex min-h-14 items-center gap-2 rounded-lg border border-dashed border-[var(--line-strong)] px-3 py-2">
              <span aria-hidden="true" className="shrink-0">
                <Pic name="hourglass-not-done" size={20} />
              </span>
              <p className="text-sm leading-5 text-[var(--muted)]">What happened to {path.name}?</p>
            </div>
          )}
        </div>
        <div className="mt-auto">
          <Button variant="secondary" size="sm" aria-expanded={shown} onClick={() => setShown((v) => !v)} data-testid="path-reveal">
            See what happened {shown ? <ChevronUp size={16} strokeWidth={1.75} aria-hidden /> : <ChevronDown size={16} strokeWidth={1.75} aria-hidden />}
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
      <p className="mt-1 mb-3 text-base font-medium leading-6 text-[var(--ink)]">{question}</p>
      <div className="grid grid-cols-1 items-stretch gap-2 @min-[520px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <PathCard path={left} tone="left" />
        <span
          data-testid="paths-or"
          aria-hidden="true"
          className="self-center justify-self-center text-xs font-medium uppercase tracking-wide text-[var(--muted)]"
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
