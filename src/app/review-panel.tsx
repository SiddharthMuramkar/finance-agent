"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReviewAnswer, ReviewState } from "@/learner/review";
import { MarkedText } from "@/widgets/marked-text";
import { PrimaryButton } from "./ui";
import { FoldedRow, OptionRow, ResultIcon, useClaimPrimary } from "./workspace-parts";

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
  // A computed question's choice shows the figure code worked out for it (spec D2): "Margin 10% to 12% ($48.51)".
  const text = (id: string | null) => {
    const c = result.choices.find((x) => x.id === id);
    return c && (c.figure ? `${c.text} (${c.figure})` : c.text);
  };
  return (
    <FoldedRow label="Spaced review" badge="marked" open data-testid="review-result">
      <section aria-label="Review result">
        {result.predict ? (
          // A predict tap is shown beside the result, never marked wrong (spec D1).
          <p data-testid="review-predict" className="text-sm leading-5">
            You said: {text(result.chosen) ?? "nothing"}. It landed: {result.predict.landed}, at{" "}
            <span className="text-key-number font-semibold tabular-nums">{result.predict.figure}</span> a share.
          </p>
        ) : (
          <>
            <div className="flex items-start gap-2">
              <ResultIcon ok={result.correct} className="mt-0.5 size-4" />
              <p className="text-sm font-medium leading-5">
                {result.correct
                  ? "Correct."
                  : `Not quite. You chose: ${text(result.chosen) ?? "no answer"}.`}
              </p>
            </div>
            <p className="mt-2 text-sm leading-5">
              Right answer: {text(result.answer)}
            </p>
          </>
        )}
        {result.mistake && (
          <p
            data-testid="review-fix"
            className="mt-2 border-l-2 border-[var(--danger)] pl-3 text-sm leading-5"
          >
            {result.mistake.fix}
          </p>
        )}
        {/* The explanation may draw a Formula Card (a Widget part), which keeps its own colours. */}
        <div data-widget-content className="mt-2">
          <MarkedText
            text={result.explanation}
            className="text-sm leading-5 text-[var(--muted)]"
          />
        </div>
        {result.credit && (
          <p className="mt-2 text-xs leading-4 text-[var(--muted)]">
            Question: {result.credit}.
            {result.verified
              ? ""
              : " The answer key has not been checked by a person yet."}
          </p>
        )}
        <PrimaryButton onClick={onNext} className="mt-4">
          {review.dueCount > 1 && review.done + 1 < review.cap
            ? "Next review"
            : "Done"}
        </PrimaryButton>
      </section>
    </FoldedRow>
  );
}

/**
 * Spaced review at the top of the workspace, folded into one hairline row ("Spaced review", a "N due" badge). One old
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
      label="Spaced review"
      badge={`${review.dueCount} due`}
      open={continued || undefined}
      data-testid="review"
    >
      <section aria-label="Review">
        <p className="mb-3 text-xs leading-4 text-[var(--muted)]">
          Up to {review.cap} a day; {review.done} done so far.
        </p>
        <fieldset>
          <legend className="mb-3 text-[15px] font-semibold leading-[22px]">{q.prompt}</legend>
          <div className="flex flex-col gap-2">
            {q.choices.map((c) => (
              <OptionRow
                key={c.id}
                name={`review-${q.id}`}
                checked={picked === c.id}
                onChange={() => setPicked(c.id)}
              >
                {c.text}
              </OptionRow>
            ))}
          </div>
        </fieldset>
        {error && (
          <p className="mt-2 text-sm leading-5 text-[var(--danger)]">{error}</p>
        )}
        <PrimaryButton
          onClick={() => void submit()}
          disabled={!picked || busy}
          className="mt-4"
        >
          Submit answer
        </PrimaryButton>
      </section>
    </FoldedRow>
  );
}
