"use client";

import { defineComponent, type ComponentRenderProps } from "@openuidev/react-lang";
import { z } from "zod/v4";
import { useChangeFlash, useDebounced, usePrefersReducedMotion } from "./motion";

// Verdict: the sentence the Learner should be able to say. It is the Widget's only live region, and a screen
// reader hears it only once it has stopped changing (400 ms), so dragging a slider does not spam it.

export const verdictProps = z.object({
  test: z.boolean().describe("A comparison of numbers, e.g. $rate < 3.38"),
  ifTrue: z.string(),
  ifFalse: z.string(),
});

export const VERDICT_DEBOUNCE_MS = 400;

export function VerdictView({ test, ifTrue, ifFalse }: z.infer<typeof verdictProps>) {
  const reduced = usePrefersReducedMotion();
  const text = test ? ifTrue : ifFalse;
  const announced = useDebounced(text, VERDICT_DEBOUNCE_MS);
  const flip = useChangeFlash(test, reduced);
  return (
    <div data-testid="verdict" data-motion={reduced ? "reduced" : "full"} className="my-2 flex gap-3">
      <span
        aria-hidden
        data-testid="verdict-rule"
        className="w-[3px] shrink-0 rounded-sm bg-[var(--brand)]"
        style={{ opacity: flip ? 0.3 : 1, transition: reduced ? undefined : "opacity 200ms var(--ease-out, ease-out)" }}
      />
      <p
        data-testid="verdict-text"
        className="text-[17px] leading-snug text-[var(--ink)]"
        style={{
          opacity: flip ? 0 : 1,
          transform: flip ? "translateY(2px)" : "none",
          transition: reduced ? undefined : "opacity 200ms var(--ease-out, ease-out), transform 200ms var(--ease-out, ease-out)",
        }}
      >
        {text}
      </p>
      <span aria-live="polite" role="status" data-testid="verdict-live" className="sr-only">
        {announced}
      </span>
    </div>
  );
}

export const Verdict = defineComponent({
  name: "Verdict",
  description: "The one sentence a comparison ends in, which rewrites itself: Verdict(test, ifTrue, ifFalse). End every comparison with a Verdict.",
  props: verdictProps,
  component: ({ props }: ComponentRenderProps<z.infer<typeof verdictProps>>) => <VerdictView {...props} />,
});
