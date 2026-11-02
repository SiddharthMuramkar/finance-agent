"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Marking } from "@/course/quiz";
import type { OpenQuiz } from "@/learner/quiz";

type Result = Marking & { attemptNo: number };

/**
 * The quiz the Course Navigator calls for. Code wrote this page's questions, and the server marks
 * them: the browser holds only prompts and choices until an answer has been submitted.
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
      <section aria-label="Quiz result" data-testid="quiz-result" className="mb-6 rounded-lg border border-stone-300 p-4 dark:border-stone-700">
        <p className="font-medium">
          {result.correctCount} of {result.shown} correct. {result.passed ? "Passed." : `Not yet: you need ${result.needed}. Try again with different questions where there are any.`}
        </p>
        <ol className="mt-3 flex flex-col gap-3 text-sm">
          {result.questions.map((q) => (
            <li key={q.id}>
              <p>{q.prompt}</p>
              <p className={q.correct ? "text-teal-800 dark:text-teal-300" : "text-red-700 dark:text-red-400"}>
                {q.correct ? "Correct" : `Your answer: ${q.choices.find((c) => c.id === q.chosen)?.text ?? "none"}`}
                {" – "}
                right answer: {q.choices.find((c) => c.id === q.answer)?.text}
              </p>
              <p className="text-stone-600 dark:text-stone-400">{q.explanation}</p>
            </li>
          ))}
        </ol>
        <button onClick={dismiss} className="mt-3 rounded bg-stone-900 px-4 py-2 text-sm text-white dark:bg-stone-100 dark:text-stone-900">
          {result.passed ? "Done" : "Try again"}
        </button>
        {result.passed && <p className="mt-2 text-xs text-stone-500">Press Continue to tell the Tutor.</p>}
      </section>
    );
  }
  if (!quiz) return null;
  const complete = quiz.questions.every((q) => picked[q.id]);
  return (
    <section aria-label="Quiz" data-testid="quiz" className="mb-6 rounded-lg border border-stone-300 p-4 dark:border-stone-700">
      <p className="mb-3 text-sm font-medium">Quiz{quiz.attemptNo > 0 ? ` (attempt ${quiz.attemptNo + 1})` : ""}</p>
      <ol className="flex flex-col gap-4">
        {quiz.questions.map((q) => (
          <li key={q.id}>
            <fieldset>
              <legend className="mb-1 text-sm">{q.prompt}</legend>
              {q.choices.map((c) => (
                <label key={c.id} className="flex items-center gap-2 py-0.5 text-sm">
                  <input type="radio" name={`${quiz.attemptId}-${q.id}`} checked={picked[q.id] === c.id} onChange={() => setPicked({ ...picked, [q.id]: c.id })} />
                  {c.text}
                </label>
              ))}
            </fieldset>
          </li>
        ))}
      </ol>
      {error && <p className="mt-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      <button onClick={() => void submit()} disabled={!complete || busy} className="mt-3 rounded bg-stone-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900">
        Submit answers
      </button>
    </section>
  );
}
