"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Marking } from "@/course/quiz";
import type { OpenQuiz } from "@/learner/quiz";
import { PrimaryButton } from "./ui";
import { FoldedRow } from "./workspace-parts";

type Result = Marking & { attemptNo: number };

/**
 * The quiz the Course Navigator calls for, folded into one row ("Quiz Check open"). Code wrote this
 * page's questions, and the server marks them: the browser holds only prompts and choices until an
 * answer has been submitted.
 */
export function QuizPanel({ quiz }: { quiz: OpenQuiz | null }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!quiz) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId: quiz.attemptId, answers: picked }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "The quiz could not be marked.");
      setResult(data);
      // The summary and the next attempt come from the server; the marking stays on screen until dismissed.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The quiz could not be marked.");
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    setResult(null);
    setPicked({});
    router.refresh();
  }

  if (result) {
    return (
      <FoldedRow label="Quiz Check marked" open data-testid="quiz-result">
        <section aria-label="Quiz result">
          <p className="text-sm font-medium leading-5">
            {result.correctCount} of {result.shown} correct. {result.passed ? "Passed." : `Not yet: you need ${result.needed}. Try again with different questions where there are any.`}
          </p>
          <ol className="mt-3 flex flex-col gap-3 text-sm leading-5">
            {result.questions.map((q) => (
              <li key={q.id}>
                <p>{q.prompt}</p>
                <p className={q.correct ? "text-[var(--you)]" : "text-[var(--danger)]"}>
                  {q.correct ? "Correct" : `Your answer: ${q.choices.find((c) => c.id === q.chosen)?.text ?? "none"}`}
                  {" – "}
                  right answer: {q.choices.find((c) => c.id === q.answer)?.text}
                </p>
                <p className="text-[var(--muted)]">{q.explanation}</p>
                {q.credit && (
                  <p className="text-xs leading-4 text-[var(--muted)]">
                    Question: {q.credit}.{q.verified ? "" : " The answer key has not been checked by a person yet."}
                  </p>
                )}
              </li>
            ))}
          </ol>
          <PrimaryButton onClick={dismiss} className="mt-3">
            {result.passed ? "Done" : "Try again"}
          </PrimaryButton>
          {result.passed && <p className="mt-2 text-xs leading-4 text-[var(--muted)]">Press Continue to tell the Tutor.</p>}
        </section>
      </FoldedRow>
    );
  }
  if (!quiz) return null;
  const complete = quiz.questions.every((q) => picked[q.id]);
  return (
    <FoldedRow label="Quiz Check open" data-testid="quiz">
      <section aria-label="Quiz">
        {quiz.attemptNo > 0 && <p className="mb-3 text-xs leading-4 text-[var(--muted)]">Attempt {quiz.attemptNo + 1}</p>}
        <ol className="flex flex-col gap-4">
          {quiz.questions.map((q) => (
            <li key={q.id}>
              <fieldset>
                <legend className="mb-1 text-sm leading-5">{q.prompt}</legend>
                {q.choices.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 py-1 text-sm leading-5">
                    <input type="radio" className="accent-[var(--brand)]" name={`${quiz.attemptId}-${q.id}`} checked={picked[q.id] === c.id} onChange={() => setPicked({ ...picked, [q.id]: c.id })} />
                    {c.text}
                  </label>
                ))}
              </fieldset>
            </li>
          ))}
        </ol>
        {error && <p className="mt-2 text-sm leading-5 text-[var(--danger)]">{error}</p>}
        <PrimaryButton onClick={() => void submit()} disabled={!complete || busy} className="mt-3">
          Submit answers
        </PrimaryButton>
      </section>
    </FoldedRow>
  );
}
