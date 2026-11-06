"use client";

import { defineComponent, useStateField, type ComponentRenderProps } from "@openuidev/react-lang";
import { useId, type CSSProperties } from "react";
import { z } from "zod/v4";
import { Button } from "@/app/primitives";
import { usePrefersReducedMotion } from "../wave1/motion";
import { motionFlag, Pic } from "./shared";

// MythOrFact: a claim, and two buttons. A tap turns the card to its verdict (mint when right, coral when wrong) and the
// reason. Practice only: marked in the browser, counts toward nothing, kept in Widget state.

const cardProps = z.object({
  claim: z.string().describe("The claim: at most 16 words"),
  isFact: z.boolean(),
  why: z.string().describe("Why it is a myth or a fact: at most 20 words"),
  emoji: z.string().optional().describe("An emoji name for the claim"),
});

export const mythOrFactProps = z.object({
  cards: z.array(cardProps).describe("2 to 4 cards"),
});

type Props = z.infer<typeof mythOrFactProps>;

export function MythOrFactView({
  cards,
  picks,
  onPick,
}: {
  cards: Props["cards"];
  picks: (string | null | undefined)[];
  onPick: (index: number, pick: "myth" | "fact") => void;
}) {
  const reduced = usePrefersReducedMotion();
  if (!Array.isArray(cards) || cards.length < 1 || cards.some((c) => !c || typeof c.claim !== "string" || typeof c.why !== "string")) {
    return <p className="py-2 text-sm text-[var(--muted)]">The cards are still arriving.</p>;
  }
  return (
    <section data-testid="myth-or-fact" data-motion={motionFlag(reduced)} aria-label="Myth or fact" className="@container py-1">
      <div className="grid grid-cols-1 gap-3 @min-[560px]:grid-cols-2">
        {cards.slice(0, 4).map((card, i) => {
          const pick = picks[i] === "myth" || picks[i] === "fact" ? picks[i] : null;
          const right = pick !== null && (pick === "fact") === card.isFact;
          return (
            <div
              key={i}
              data-testid="myth-card"
              data-verdict={pick === null ? "open" : right ? "right" : "wrong"}
              className={`flex min-w-0 flex-col gap-2 rounded-xl border border-t-4 p-3 ${
                pick === null
                  ? "border-[var(--brand-line)] border-t-[var(--sun)] bg-[var(--field)]"
                  : right
                    ? "border-[var(--mint)] bg-[var(--mint-tint)]"
                    : "border-[var(--coral)] bg-[var(--coral-tint)]"
              }`}
            >
              <p className="flex items-start gap-3 text-base font-medium leading-6 text-[var(--ink)]">
                {card.emoji && (
                  <span className="shrink-0">
                    <Pic name={card.emoji} size={32} />
                  </span>
                )}
                <span>{card.claim}</span>
              </p>
              {pick === null ? (
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" data-testid="myth-button" style={{ "--face": "var(--coral-tint)", "--rim": "var(--coral-ink)", "--lip-colour": "var(--coral)" } as CSSProperties} onClick={() => onPick(i, "myth")}>
                    Myth
                  </Button>
                  <Button variant="secondary" size="sm" data-testid="fact-button" style={{ "--face": "var(--mint-tint)", "--rim": "var(--mint-ink)", "--lip-colour": "var(--mint)" } as CSSProperties} onClick={() => onPick(i, "fact")}>
                    Fact
                  </Button>
                </div>
              ) : (
                <div role="status" className={reduced ? "" : "story-pop"}>
                  <p className={`flex items-center gap-2 text-sm font-semibold ${right ? "text-[var(--mint-ink)]" : "text-[var(--coral-ink)]"}`}>
                    <span aria-hidden="true">{right ? "✓" : "✗"}</span>
                    {right ? "Right" : "Not quite"}: it is {card.isFact ? "a fact" : "a myth"}.
                  </p>
                  <p className="mt-1 text-sm leading-5 text-[var(--ink)]">
                    <strong className="font-semibold">{card.isFact ? "Fact" : "Myth"}.</strong> {card.why}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MythOrFactBound({ props }: ComponentRenderProps<Props>) {
  const name = `myth-or-fact-${useId()}`;
  const field = useStateField<unknown>(name, undefined);
  const picks: (string | null)[] = Array.isArray(field.value) ? (field.value as (string | null)[]) : [];
  return (
    <MythOrFactView
      cards={props.cards}
      picks={picks}
      onPick={(i, pick) => {
        const next = [...picks];
        while (next.length < (props.cards?.length ?? 0)) next.push(null);
        if (!next[i]) next[i] = pick;
        field.setValue(next);
      }}
    />
  );
}

export const MythOrFact = defineComponent({
  name: "MythOrFact",
  description:
    "Myth or fact practice: MythOrFact(cards). cards are 2 to 4 {claim (at most 16 words), isFact, why (at most 20 words), emoji?}. Each card has Myth and Fact buttons and turns to the verdict and the why. Not marked.",
  props: mythOrFactProps,
  component: MythOrFactBound,
});
