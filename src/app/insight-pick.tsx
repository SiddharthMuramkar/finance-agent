"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "./ui";

/** The explore step's Insight question with its written choices (`insight.pick`, ADR 0020), as the page sends it. */
export type InsightPickView = {
  question: string;
  choices: { id: string; text: string }[];
  /** Once settled (found or told), how, with the written Insight: drawn after a reload too, until explore is finished. */
  settled?: { how: "found" | "told"; written: string };
};

const NOT_MARKED = "That tap could not be marked. Try again.";

type Marked = { released: "found" | "hint_1" | "hint_2" | "told"; fix?: string; hint?: string; written?: string };

/**
 * The Insight settled by a tap (ticket #88): the question and its choices above the message box. Code marks the tap
 * (POST /api/insight-pick): a wrong one shows its fix and the hint code released; the right one, or a third miss, shows
 * the written Insight, and the page re-reads the Learner's place so the Next chip moves on to Your turn.
 */
export function InsightPick({ pick }: { pick: InsightPickView }) {
  const router = useRouter();
  const [pressed, setPressed] = useState<string | null>(null);
  const [marked, setMarked] = useState<(Marked & { choice: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown: (Marked & { choice?: string }) | null = marked ?? (pick.settled ? { released: pick.settled.how, written: pick.settled.written } : null);
  const settled = shown?.released === "found" || shown?.released === "told";

  const tap = async (choice: string) => {
    setPressed(choice);
    setError(null);
    try {
      const response = await fetch("/api/insight-pick", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ choice }) });
      const body = (await response.json().catch(() => ({}))) as Marked & { error?: string };
      if (!response.ok) setError(body.error ?? NOT_MARKED);
      else {
        setMarked({ ...body, choice });
        if (body.released === "found" || body.released === "told") router.refresh();
      }
    } catch {
      // No answer at all (offline, a dropped connection): say so, and the choices stay to tap again.
      setError(NOT_MARKED);
    } finally {
      setPressed(null);
    }
  };

  return (
    <section aria-label="Insight question" data-testid="insight-pick" className="relative z-[1] mb-2">
      <p className="text-sm leading-5 text-[var(--ink)]">
        <span className="font-medium">Open question:</span> {pick.question}
      </p>
      <div role="group" aria-label="Insight choices" className="mt-2 flex flex-wrap gap-2">
        {pick.choices.map((c) => (
          <Button
            key={c.id}
            variant="secondary"
            size="sm"
            data-testid="insight-pick-choice"
            data-picked={marked?.choice === c.id ? "" : undefined}
            pressed={marked?.choice === c.id}
            loading={pressed === c.id}
            disabled={pressed !== null || settled}
            onClick={() => void tap(c.id)}
          >
            {c.text}
          </Button>
        ))}
      </div>
      {/* Both live regions stay mounted, so a screen reader announces what is put in them (a region inserted together with
          its text may not be read). The marking is polite; a tap that could not be marked is an alert. */}
      <div role="status" className="empty:hidden">
        {shown && (
          <div data-testid="insight-pick-result" data-released={shown.released} className="mt-2 text-sm leading-5">
            {shown.released === "found" && <p className="text-[var(--success)]">Found it.</p>}
            {shown.fix && shown.released !== "found" && <p>{shown.fix}</p>}
            {shown.hint && <p className="text-[var(--muted)]">Hint: {shown.hint}</p>}
            {shown.written && <p className="font-medium">{shown.written}</p>}
          </div>
        )}
      </div>
      <div role="alert" className="empty:hidden">
        {error && (
          <p className="mt-2 text-sm leading-5 text-[var(--danger)]" data-testid="insight-pick-error">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
