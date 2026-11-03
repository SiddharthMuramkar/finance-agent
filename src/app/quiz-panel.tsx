"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Marking } from "@/course/quiz";
import type { OpenQuiz } from "@/learner/quiz";
import { MarkedText } from "@/widgets/marked-text";
import { PrimaryButton } from "./ui";

type Result = Marking & { attemptNo: number };

/** The name of the right panel's tab for an open quiz: "Check 1 of 2". */
export const checkTabName = (quiz: Pick<OpenQuiz, "checkNumber" | "checkCount">) => `Check ${quiz.checkNumber} of ${quiz.checkCount}`;

/**
 * The quiz the Course Navigator calls for, as the body of the right panel's Check tab ("Check 1 of 2").
 * Code wrote this page's questions, and the server marks them: the browser holds only prompts and choices
 * until an answer has been submitted. The marking stays on screen until the Learner dismisses it, even once
 * the server has no open quiz any more; `onDismiss` tells the Widget host, which then lets the tab go.
 */
export function QuizPanel({ quiz, onDismiss }: { quiz: OpenQuiz | null; onDismiss?: () => void }) {
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
    onDismiss?.();
    router.refresh();
  }

  if (result) {
    return (
      <section aria-label="Quiz result" data-testid="quiz-result">
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
              <MarkedText text={q.explanation} className="text-[var(--muted)]" />
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
        {result.passed && <p className="mt-2 text-xs leading-4 text-[var(--muted)]">Press Next in the conversation to carry on.</p>}
      </section>
    );
  }
  if (!quiz) return null;
  const complete = quiz.questions.every((q) => picked[q.id]);
  return (
    <section aria-label="Quiz" data-testid="quiz">
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
  );
}
