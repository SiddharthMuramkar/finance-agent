"use client";

import { defineComponent, type ComponentRenderProps } from "@openuidev/react-lang";
import { z } from "zod/v4";
import { Tag } from "@/app/primitives";
import { formatAmount } from "./format";
import { useChangeFlash, usePrefersReducedMotion } from "./motion";
import { toneRule, type Tone } from "./tones";

// Stat: one number, formatted properly, under the control that moves it. A "you" or "src" tone draws its rule in the mint or
// sunflower fill and also says it in words with a static Tag, since those fills are under 3:1 in Light and colour alone may
// not carry the meaning (issue #457, WCAG 2.2 SC 1.4.11).

export const statProps = z.object({
  label: z.string(),
  value: z.number().describe("The number: from a tool, a calculator, Case Data or an expression of $variables, never typed by hand"),
  unit: z.string().describe('inr, usd, percent, pp, bp, years, months, grams or x; any other text is added after the number ("of 3")'),
  note: z.string().optional(),
  tone: z.enum(["you", "src", "neutral"]).optional().describe("you = the Learner's assumption (teal rule), src = sourced (amber rule)"),
});

export function StatView({ label, value, unit, note, tone = "neutral" }: z.infer<typeof statProps> & { tone?: Tone }) {
  const reduced = usePrefersReducedMotion();
  const text = formatAmount(value, unit);
  const fresh = useChangeFlash(text, reduced);
  return (
    <div
      role="group"
      aria-label={`${label}: ${text}`}
      data-testid="stat"
      data-tone={tone}
      data-motion={reduced ? "reduced" : "full"}
      className="my-2 border-l-[3px] pl-3"
      style={{ borderColor: toneRule[tone] }}
    >
      <div className="text-xs text-[var(--muted)]">
        {label}
        {/* A "you" Stat is often a result worked out from the Learner's inputs, so its words never call it an assumption. */}
        {tone !== "neutral" && (
          <Tag kind={tone} className="ml-2 align-middle">
            {tone === "you" ? "From your inputs" : undefined}
          </Tag>
        )}
      </div>
      <div
        data-testid="stat-value"
        className="text-2xl font-semibold tabular-nums"
        style={{ opacity: fresh ? 0.35 : 1, transition: reduced ? undefined : "opacity 160ms var(--ease-out, ease-out)" }}
      >
        {text}
      </div>
      {note && <div className="text-xs text-[var(--muted)]">{note}</div>}
    </div>
  );
}

export const Stat = defineComponent({
  name: "Stat",
  description:
    'One important number, formatted for its unit (inr gets lakh and crore). Stat(label, value, unit, note?, tone?). Put it directly under the control that moves it. tone "you" marks the Learner\'s assumption, "src" a sourced figure.',
  props: statProps,
  component: ({ props }: ComponentRenderProps<z.infer<typeof statProps>>) => <StatView {...props} />,
});
