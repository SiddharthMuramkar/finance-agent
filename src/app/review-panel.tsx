"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReviewAnswer, ReviewState } from "@/learner/review";

type Answered = Extract<ReviewAnswer, { ok: true }>;

/**
 * Spaced review at the top of the workspace, before the current Teaching Step. One old quiz
 * question at a time, most overdue first; code marks it and reschedules it. No model call.
 */
export function ReviewPanel({ review }: { review: ReviewState }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string>();
  const [result, setResult] = useState<Answered | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!review.question || !picked) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: review.question.id, choiceId: picked }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "The review could not be marked.");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The review could not be marked.");
    } finally {
      setBusy(false);
    }
  }

  function next() {
    setResult(null);
    setPicked(undefined);
    router.refresh();
  }

  if (result) {
    const text = (id: string | null) => result.choices.find((c) => c.id === id)?.text;
    return (
      <section aria-label="Review result" data-testid="review-result" className="mb-6 rounded-lg border border-stone-300 p-4 dark:border-stone-700">
        <p className="font-medium">{result.correct ? "Correct." : `Not quite. You chose: ${text(result.chosen) ?? "no answer"}.`}</p>
        <p className="mt-1 text-sm">Right answer: {text(result.answer)}</p>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{result.explanation}</p>
        {result.credit && (
          <p className="mt-1 text-xs text-stone-500">
            Question: {result.credit}.{result.verified ? "" : " The answer key has not been checked by a person yet."}
          </p>
        )}
        <button onClick={next} className="mt-3 rounded bg-stone-900 px-4 py-2 text-sm text-white dark:bg-stone-100 dark:text-stone-900">
          {review.dueCount > 1 && review.done + 1 < review.cap ? "Next review" : "Done"}
        </button>
      </section>
    );
  }
  if (!review.question) return null;
  const q = review.question;
  return (
    <section aria-label="Review" data-testid="review" className="mb-6 rounded-lg border border-stone-300 p-4 dark:border-stone-700">
      <p className="mb-1 text-sm font-medium">Review before today&apos;s step</p>
      <p className="mb-3 text-xs text-stone-500 dark:text-stone-400">
        {review.dueCount} due. Up to {review.cap} per Session; {review.done} done so far.
      </p>
      <fieldset>
        <legend className="mb-1 text-sm">{q.prompt}</legend>
        {q.choices.map((c) => (
          <label key={c.id} className="flex min-h-11 items-center gap-3 py-1 text-sm">
            <input type="radio" className="size-5 shrink-0" name={`review-${q.id}`} checked={picked === c.id} onChange={() => setPicked(c.id)} />
            {c.text}
          </label>
        ))}
      </fieldset>
      {error && <p className="mt-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      <button onClick={() => void submit()} disabled={!picked || busy} className="mt-3 rounded bg-stone-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900">
        Submit answer
      </button>
    </section>
  );
}
