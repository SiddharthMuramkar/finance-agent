"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Marking } from "@/course/quiz";
import type { MissedQuiz, OpenQuiz } from "@/learner/quiz";
import { MarkedText } from "@/widgets/marked-text";
import type { SessionItemData } from "./session-item-view";
import { PrimaryButton } from "./ui";

/** A marking on screen, with the Check's number for Try Check <k> again. */
type Result = Marking & { attemptNo: number; checkNumber: number };

/** What the server says after marking a submission: the verdict, and the result card it stored for the conversation. */
/** `item` is the result card; `complete` the Topic complete card, when the pass passed the Topic (its last Due Check). */
export type QuizSubmitted = { passed: boolean; item?: SessionItemData; complete?: SessionItemData };

/** The name of the right panel's tab for an open quiz: "Check 1 of 2". */
export const checkTabName = (quiz: Pick<OpenQuiz, "checkNumber" | "checkCount">) => `Check ${quiz.checkNumber} of ${quiz.checkCount}`;

/**
 * The quiz the Course Navigator calls for, as the body of the right panel's Check tab ("Check 1 of 2").
 * Code wrote this page's questions, and the server marks them: the browser holds only prompts and choices
 * until an answer has been submitted. `onSubmitted` hands the verdict and its result card to the conversation.
 * After a pass, the marking stays on screen until the Learner dismisses it, even once the server has no open quiz
 * any more; `onDismiss` tells the Widget host, which then lets the tab go. After a miss (`missed`, after a reload),
 * the marking stays with Try Check <k> again →, and only that press makes the next attempt.
 */
export function QuizPanel({
  quiz,
  missed = null,
  onSubmitted,
  onDismiss,
}: {
  quiz: OpenQuiz | null;
  missed?: MissedQuiz | null;
  onSubmitted?: (submitted: QuizSubmitted) => void;
  onDismiss?: () => void;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(missed && { ...missed.result, attemptNo: missed.attemptNo, checkNumber: missed.checkNumber });
  // The attempt Try again made, shown until the page's own copy of it arrives.
  const [retried, setRetried] = useState<OpenQuiz | null>(null);
  const active = retried && (!quiz || retried.attemptId >= quiz.attemptId) ? retried : quiz;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(body: object): Promise<Record<string, unknown>> {
    const res = await fetch("/api/quiz", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "The quiz could not be marked.");
    return data;
  }

  async function submit() {
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      const data = (await post({ attemptId: active.attemptId, answers: picked })) as Marking & { attemptNo: number; item?: SessionItemData; complete?: SessionItemData };
      setResult({ ...data, checkNumber: active.checkNumber });
      onSubmitted?.({ passed: data.passed, item: data.item, complete: data.complete });
      // The summary and the Next on offer come from the server; the marking stays on screen.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The quiz could not be marked.");
    } finally {
      setBusy(false);
    }
  }

  /** Try Check <k> again: the server makes the next attempt now, and the panel shows it. */
  async function retry() {
    setBusy(true);
    setError(null);
    try {
      const data = (await post({ retry: true })) as { quiz: OpenQuiz };
      setRetried(data.quiz);
      setResult(null);
      setPicked({});
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The next attempt could not be opened.");
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
          {result.correctCount} of {result.shown} correct. {result.passed ? "Passed." : `Not yet: you need ${result.needed}. The Tutor will go over what you missed; try again when you are ready, with different questions where there are any.`}
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
        {error && <p className="mt-2 text-sm leading-5 text-[var(--danger)]">{error}</p>}
        {result.passed ? (
          <PrimaryButton onClick={dismiss} className="mt-3">
            Done
          </PrimaryButton>
        ) : (
          <PrimaryButton onClick={() => void retry()} disabled={busy} className="mt-3">
            Try Check {result.checkNumber} again →
          </PrimaryButton>
        )}
        {result.passed && <p className="mt-2 text-xs leading-4 text-[var(--muted)]">Press Next in the conversation to carry on.</p>}
      </section>
    );
  }
  if (!active) return null;
  const complete = active.questions.every((q) => picked[q.id]);
  return (
    <section aria-label="Quiz" data-testid="quiz">
      {active.attemptNo > 0 && <p className="mb-3 text-xs leading-4 text-[var(--muted)]">Attempt {active.attemptNo + 1}</p>}
      <ol className="flex flex-col gap-4">
        {active.questions.map((q) => (
          <li key={q.id}>
            <fieldset>
              <legend className="mb-1 text-sm leading-5">{q.prompt}</legend>
              {q.choices.map((c) => (
                <label key={c.id} className="flex items-center gap-2 py-1 text-sm leading-5">
                  <input type="radio" className="accent-[var(--brand)]" name={`${active.attemptId}-${q.id}`} checked={picked[q.id] === c.id} onChange={() => setPicked({ ...picked, [q.id]: c.id })} />
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
