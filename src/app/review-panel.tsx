"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReviewAnswer, ReviewState } from "@/learner/review";
import { MarkedText } from "@/widgets/marked-text";
import { PrimaryButton } from "./ui";
import { FoldedRow, useClaimPrimary } from "./workspace-parts";

type Answered = Extract<ReviewAnswer, { ok: true }>;

/** A marked Review: right or not, the right answer, a wrong pick's mix-up fix when it is a Known mistake, and the explanation. */
export function ReviewResultView({
  result,
  review,
  onNext,
}: {
  result: Answered;
  review: Pick<ReviewState, "dueCount" | "done" | "cap">;
  onNext: () => void;
}) {
  const text = (id: string | null) =>
    result.choices.find((c) => c.id === id)?.text;
  return (
    <FoldedRow label="Spaced review · marked" open data-testid="review-result">
      <section aria-label="Review result">
        <p className="text-sm font-medium leading-5">
          {result.correct
            ? "Correct."
            : `Not quite. You chose: ${text(result.chosen) ?? "no answer"}.`}
        </p>
        <p className="mt-1 text-sm leading-5">
          Right answer: {text(result.answer)}
        </p>
        {result.mistake && (
          <p
            data-testid="review-fix"
            className="mt-1 text-sm leading-5 text-[var(--danger)]"
          >
            {result.mistake.fix}
          </p>
        )}
        <MarkedText
          text={result.explanation}
          className="mt-1 text-sm leading-5 text-[var(--muted)]"
        />
        {result.credit && (
          <p className="mt-1 text-xs leading-4 text-[var(--muted)]">
            Question: {result.credit}.
            {result.verified
              ? ""
              : " The answer key has not been checked by a person yet."}
          </p>
        )}
        <PrimaryButton onClick={onNext} className="mt-3">
          {review.dueCount > 1 && review.done + 1 < review.cap
            ? "Next review"
            : "Done"}
        </PrimaryButton>
      </section>
    </FoldedRow>
  );
}

/**
 * Spaced review at the top of the workspace, folded into one row ("Spaced review · N due"). One old
 * quiz question at a time, most overdue first; code marks it and reschedules it. No model call.
 */
export function ReviewPanel({ review }: { review: ReviewState }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string>();
  const [result, setResult] = useState<Answered | null>(null);
  const [continued, setContinued] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Submit answer (once a choice is picked) and the marked review's Next review or Done are the view's one primary
  // while they show, so the Next chip steps back (Appendix B.7, #478).
  useClaimPrimary(!!result || (!!review.question && !!picked));

  async function submit() {
    if (!review.question || !picked) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: review.question.id,
          choiceId: picked,
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error ?? "The review could not be marked.");
      setResult(data);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The review could not be marked.",
      );
    } finally {
      setBusy(false);
    }
  }

  function next() {
    setContinued(true);
    setResult(null);
    setPicked(undefined);
    router.refresh();
  }

  if (result)
    return <ReviewResultView result={result} review={review} onNext={next} />;
  if (!review.question) return null;
  const q = review.question;
  return (
    <FoldedRow
      label={`Spaced review · ${review.dueCount} due`}
      open={continued || undefined}
      data-testid="review"
    >
      <section aria-label="Review">
        <p className="mb-3 text-xs leading-4 text-[var(--muted)]">
          Up to {review.cap} a day; {review.done} done so far.
        </p>
        <fieldset>
          <legend className="mb-1 text-sm leading-5">{q.prompt}</legend>
          <div className="flex flex-col gap-2">
            {q.choices.map((c) => (
              <label
                key={c.id}
                data-affordance="chip"
                data-state={picked === c.id ? "showing" : "idle"}
                data-allow-pointer
                className="chip min-h-11 cursor-pointer !justify-start gap-3 !rounded-2xl !px-3 !py-2 text-left text-sm leading-5 font-normal"
              >
                <input
                  type="radio"
                  name={`review-${q.id}`}
                  checked={picked === c.id}
                  onChange={() => setPicked(c.id)}
                />
                {c.text}
              </label>
            ))}
          </div>
        </fieldset>
        {error && (
          <p className="mt-2 text-sm leading-5 text-[var(--danger)]">{error}</p>
        )}
        <PrimaryButton
          onClick={() => void submit()}
          disabled={!picked || busy}
          className="mt-3"
        >
          Submit answer
        </PrimaryButton>
      </section>
    </FoldedRow>
  );
}
