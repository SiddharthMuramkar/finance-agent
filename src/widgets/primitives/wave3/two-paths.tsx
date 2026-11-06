"use client";

import { defineComponent, type ComponentRenderProps } from "@openuidev/react-lang";
import { useState } from "react";
import { z } from "zod/v4";
import { Button } from "@/app/primitives";
import { usePrefersReducedMotion } from "../wave1/motion";
import { motionFlag, Pic } from "./shared";

// TwoPaths: two characters make two choices. "See what happened" under each reveals its outcome as a row of objects
// (two houses against one), never as numbers.

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
  return (
    <div
      data-testid="path"
      data-side={tone}
      className={`flex min-w-0 flex-col gap-2 rounded-xl border border-t-4 border-[var(--brand-line)] bg-[var(--field)] p-3 ${tone === "left" ? "border-t-[var(--sun)]" : "border-t-[var(--violet)]"}`}
    >
      <div className="flex items-center gap-3">
        <span key={shown ? "told" : "waiting"} data-testid="path-character" className={`shrink-0 ${shown && !reduced ? "story-bounce" : ""}`}>
          <Pic name={path.emoji} size={48} />
        </span>
        <div className="min-w-0">
          <p className="text-base font-semibold leading-6 text-[var(--ink)]">{path.name}</p>
          <p className="text-sm leading-5 text-[var(--muted)]">{path.choice}</p>
        </div>
      </div>
      <div>
        <Button variant="secondary" size="sm" aria-expanded={shown} onClick={() => setShown((v) => !v)} className="story-toggle" data-testid="path-reveal">
          See what happened
        </Button>
      </div>
      <div aria-live="polite">
        {shown && (
          <div data-testid="path-outcome" className={`rounded-lg px-3 py-2 ${tone === "left" ? "bg-[var(--sun-tint)]" : "bg-[var(--violet-tint)]"} ${reduced ? "" : "story-pop"}`}>
            <p className="flex flex-wrap items-center gap-1" aria-hidden="true">
              {objects.map((name, i) => (
                <Pic key={i} name={name} size={32} />
              ))}
            </p>
            <p className="mt-1 text-sm font-medium leading-5 text-[var(--ink)]">{path.outcomeLine}</p>
          </div>
        )}
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
      <p className="mb-2 text-base font-semibold leading-6 text-[var(--ink)]">{question}</p>
      <div className="grid grid-cols-1 gap-3 @min-[520px]:grid-cols-2">
        <PathCard path={left} tone="left" />
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
