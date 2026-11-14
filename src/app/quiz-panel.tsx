"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Marking } from "@/course/quiz";
import type { MissedQuiz, OpenQuiz } from "@/learner/quiz";
import { MarkedText } from "@/widgets/marked-text";
import type { SessionItemData } from "./session-item-view";
import { PrimaryButton, SecondaryButton } from "./ui";
import { OptionRow, ResultIcon } from "./workspace-parts";

/** A marking on screen, with the Check's number for Try Check <k> again. */
type Result = Marking & { attemptNo: number; checkNumber: number };

/** What the server says after marking a submission: the verdict, and the result card it stored for the conversation. */
/** `item` is the result card; `complete` the Topic complete card, when the pass passed the Topic (its last Due Check). */
export type QuizSubmitted = {
  passed: boolean;
  item?: SessionItemData;
  complete?: SessionItemData;
};

/** The name of the right panel's tab for an open quiz: "Check 1 of 2". */
export const checkTabName = (
  quiz: Pick<OpenQuiz, "checkNumber" | "checkCount">,
) => `Check ${quiz.checkNumber} of ${quiz.checkCount}`;

/** A marked choice's words, with the figure code worked out for a computed question's choice: "Margin 10% to 12% ($48.51)". */
function choiceWithFigure(q: Marking["questions"][number], id: string | null): string | undefined {
  const c = q.choices.find((x) => x.id === id);
  return c && (c.figure ? `${c.text} (${c.figure})` : c.text);
}

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
  const [result, setResult] = useState<Result | null>(
    missed && {
      ...missed.result,
      attemptNo: missed.attemptNo,
      checkNumber: missed.checkNumber,
    },
  );
  // The attempt Try again made, shown until the page's own copy of it arrives.
  const [retried, setRetried] = useState<OpenQuiz | null>(null);
  const active =
    retried && (!quiz || retried.attemptId >= quiz.attemptId) ? retried : quiz;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(body: object): Promise<Record<string, unknown>> {
    const res = await fetch("/api/quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "The quiz could not be marked.");
    return data;
  }

  async function submit() {
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      const data = (await post({
        attemptId: active.attemptId,
        answers: picked,
      })) as Marking & {
        attemptNo: number;
        item?: SessionItemData;
        complete?: SessionItemData;
      };
      setResult({ ...data, checkNumber: active.checkNumber });
      onSubmitted?.({
        passed: data.passed,
        item: data.item,
        complete: data.complete,
      });
      // The summary and the Next on offer come from the server; the marking stays on screen.
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The quiz could not be marked.",
      );
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
      setError(
        e instanceof Error
          ? e.message
          : "The next attempt could not be opened.",
      );
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

  const complete = !!active && active.questions.every((q) => picked[q.id]?.trim());
  // No primary claim here: while a Check is open, or after a miss, the Course Navigator offers no Next (nextOfferNow is
  // null), so Submit and Try again are already the view's one primary. A passed Check's Done is secondary: Next in the
  // conversation is the main move then (Appendix B.7, #478).

  if (result) {
    return (
      <section aria-label="Quiz result" data-testid="quiz-result">
        {/* The verdict, with its icon (never colour alone); the first <p> is the verdict. */}
        <div className="flex items-start gap-3">
          <ResultIcon ok={result.passed} className="mt-px size-5" />
          <p className="text-[15px] leading-[22px] text-[var(--ink)]">
            <span className="font-semibold">
              {result.correctCount} of {result.shown} correct.{result.passed ? " Passed." : ""}
            </span>
            {result.passed
              ? ""
              : ` Not yet: you need ${result.needed}. The answers and fixes are below, and the Tutor will help with the first idea you missed. Try again when you are ready, with different questions where there are any.`}
          </p>
        </div>
        <ol className="mt-4 divide-y divide-[var(--rule)] border-t border-[var(--rule)] text-sm leading-5">
          {result.questions.map((q) => (
            <li key={q.id} className="flex flex-col gap-2 py-4">
              <p className="font-medium">{q.prompt}</p>
              {q.predict ? (
                // A predict tap is stored and shown beside the result, never marked wrong (spec D1).
                <p data-testid="quiz-predict" className="flex min-h-11 items-start gap-2 rounded-lg bg-[var(--wash)] px-3 py-2.5 text-[var(--ink)]">
                  <span>
                    You said: {q.predict.said ?? "nothing"}. It landed: {q.predict.landed}, at <span className="text-key-number font-semibold tabular-nums">{q.predict.figure}</span> a share.
                  </span>
                </p>
              ) : (
              <p
                data-correct={q.correct}
                className={`flex min-h-11 items-start gap-2 rounded-lg px-3 py-2.5 text-[var(--ink)] ${q.correct ? "bg-[var(--success-tint)]" : "bg-[var(--danger-tint)]"}`}
              >
                <ResultIcon ok={q.correct} className="mt-0.5 size-4" />
                <span>
                  {q.correct
                    ? "Correct"
                    : `Your answer: ${choiceWithFigure(q, q.chosen) ?? "none"}`}
                  {" – "}
                  right answer: {choiceWithFigure(q, q.answer)}
                </span>
              </p>
              )}
              {q.mistake && (
                <p data-testid="quiz-fix" className="border-l-2 border-[var(--danger)] pl-3">
                  {q.mistake.fix}
                </p>
              )}
              {/* The explanation may draw a Formula Card (a Widget part), which keeps its own colours. */}
              <div data-widget-content>
                <MarkedText
                  text={q.explanation}
                  className="text-[var(--muted)]"
                />
              </div>
              {q.credit && (
                <p className="text-xs leading-4 text-[var(--muted)]">
                  Question: {q.credit}.
                  {q.verified
                    ? ""
                    : " The answer key has not been checked by a person yet."}
                </p>
              )}
            </li>
          ))}
        </ol>
        {error && (
          <p className="mt-2 text-sm leading-5 text-[var(--danger)]">{error}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--rule)] pt-5">
          {result.passed ? (
            <SecondaryButton onClick={dismiss}>
              Done
            </SecondaryButton>
          ) : (
            <PrimaryButton
              onClick={() => void retry()}
              disabled={busy}
            >
              Try Check {result.checkNumber} again →
            </PrimaryButton>
          )}
          {result.passed && (
            <p className="text-[13px] leading-[18px] text-[var(--muted)]">
              Press Next in the conversation to carry on.
            </p>
          )}
        </div>
      </section>
    );
  }
  if (!active) return null;
  const count = active.questions.length;
  const answered = active.questions.filter((q) => picked[q.id]?.trim()).length;
  return (
    <section aria-label="Quiz" data-testid="quiz">
      {active.attemptNo > 0 && (
        <p className="mb-3 text-xs leading-4 text-[var(--muted)]">
          Attempt {active.attemptNo + 1}
        </p>
      )}
      <ol className="flex flex-col gap-8">
        {active.questions.map((q, i) => (
          <li key={q.id}>
            <fieldset>
              <legend className="mb-3">
                <span className="type-eyebrow block text-[var(--muted)]">
                  Question {i + 1} of {count}
                </span>{" "}
                <span className="mt-1 block text-[15px] font-semibold leading-[22px] text-[var(--ink)]">{q.prompt}</span>
              </legend>
              <div className="flex flex-col gap-2">
                {q.choices.map((c) => (
                  <OptionRow
                    key={c.id}
                    name={`${active.attemptId}-${q.id}`}
                    checked={picked[q.id] === c.id}
                    onChange={() => setPicked({ ...picked, [q.id]: c.id })}
                  >
                    {c.text}
                  </OptionRow>
                ))}
              </div>
            </fieldset>
          </li>
        ))}
      </ol>
      {error && (
        <p className="mt-2 text-sm leading-5 text-[var(--danger)]">{error}</p>
      )}
      <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--rule)] pt-5">
        <PrimaryButton
          onClick={() => void submit()}
          disabled={!complete || busy}
        >
          Submit answers
        </PrimaryButton>
        {/* A quiet count, not a live region: the app has one live region, for the turn (workspace.test). */}
        <p data-testid="quiz-answered" className="text-[13px] leading-[18px] text-[var(--muted)] tabular-nums">
          {answered} of {count} answered
        </p>
      </div>
    </section>
  );
}
