"use client";

import { useContext, useState } from "react";
import type { Marking } from "@/course/quiz";
import type { SkipAheadQuiz } from "@/learner/skip-ahead";
import { WhatComesNextButton } from "./course/jump-button";
import { QuickTryContext } from "./quick-try-view";
import { PrimaryButton, SecondaryButton, secondaryButtonClass } from "./ui";
import { OptionRow, ResultIcon, useClaimPrimary } from "./workspace-parts";

/** What the Topic Start card offers (src/course/topic-start.ts): the Choice, or the line that today's quiz is used. */
export type SkipAheadOffer = "offer" | "tried_today";

/** The words of the Choice on the Topic Start card (spec 2026-11-12 A8). */
export const SKIP_AHEAD_CHOICE = "I know this: quiz me";

/** Under the Choice: what the quiz is and what it does. */
export const SKIP_AHEAD_HINT = "One question on each idea. Miss no more than one and the whole Topic is passed. One try a day.";

/** Instead of the Choice once today's quiz is used. */
export const SKIP_AHEAD_TRIED = "You have had today's quiz for this Topic. You can try it again tomorrow.";

type Result = Marking & { next: string | null };

/** A marked choice's words, with the figure code worked out for a computed question's choice. */
function choiceText(q: Marking["questions"][number], id: string | null): string {
  const c = q.choices.find((x) => x.id === id);
  return c ? (c.figure ? `${c.text} (${c.figure})` : c.text) : "none";
}

async function post(body: object): Promise<Record<string, unknown>> {
  const res = await fetch("/api/skip-ahead", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const data = ((await res?.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  if (!res?.ok) throw new Error(typeof data.error === "string" ? data.error : "That did not work. Try again.");
  return data;
}

/**
 * Skip ahead on the Topic Start card (spec 2026-11-12 A8, ADR 0004). "I know this: quiz me" opens one mixed quiz in the
 * card: one question for each idea of the Topic, picked and marked by code on the server, whose key the browser never
 * holds before the answers are in. Missing no more than one passes the whole Topic: the card says so, with What comes
 * next and the Course Map. Otherwise it shows the answers and fixes, and the Topic simply carries on from its story. One
 * try a day: after it, the card says when it can be tried again. With no Quick try host (a passed Topic, Past Sessions)
 * nothing is offered.
 */
export function SkipAheadView({ topicId, offer }: { topicId: string; offer: SkipAheadOffer }) {
  const host = useContext(QuickTryContext);
  const [state, setState] = useState<SkipAheadOffer>(offer);
  const [quiz, setQuiz] = useState<SkipAheadQuiz | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // While the quiz is open, its Submit is the view's one primary; once passed, What comes next is (#478).
  useClaimPrimary(!!quiz || !!result?.passed);

  if (!host) return null;

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const data = (await post({ topicId })) as { quiz: SkipAheadQuiz };
      setQuiz(data.quiz);
      setPicked({});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!quiz) return;
    setBusy(true);
    setError(null);
    try {
      const data = (await post({ attemptId: quiz.attemptId, answers: picked })) as unknown as Result;
      setResult(data);
      setQuiz(null);
      setState("tried_today");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const errorLine = error && (
    <p role="alert" className="mt-2 text-sm leading-5 text-[var(--danger)]">
      {error}
    </p>
  );

  if (result?.passed) {
    return (
      <div data-testid="skip-ahead-result" data-passed="true" className="mt-4 border-t border-[var(--rule)] pt-4">
        <p className="flex items-start gap-2 text-sm leading-5">
          <ResultIcon ok className="mt-0.5 size-4" />
          <span>
            <span className="font-semibold">
              {result.correctCount} of {result.shown} right. Topic passed.
            </span>{" "}
            It shows as passed on the Course Map, and these questions come back later as Reviews.
          </span>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {result.next && <WhatComesNextButton label={result.next} />}
          <a href="/course" data-affordance="button" className={secondaryButtonClass}>
            Course Map
          </a>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div data-testid="skip-ahead-result" data-passed="false" className="mt-4 border-t border-[var(--rule)] pt-4">
        <p className="flex items-start gap-2 text-sm leading-5">
          <ResultIcon ok={false} className="mt-0.5 size-4" />
          <span>
            <span className="font-semibold">
              {result.correctCount} of {result.shown} right.
            </span>{" "}
            Skipping ahead needs {result.needed}. No harm done: the Topic carries on from its story, and you can try the quiz again tomorrow.
          </span>
        </p>
        <ol className="mt-3 divide-y divide-[var(--rule)] text-sm leading-5">
          {result.questions.map((q) => (
            <li key={q.id} className="flex flex-col gap-1 py-2">
              <p className="font-medium">{q.prompt}</p>
              <p className="flex items-start gap-2">
                <ResultIcon ok={q.correct} className="mt-0.5 size-4" />
                <span>{q.correct ? `Right: ${choiceText(q, q.answer)}` : `Your pick: ${choiceText(q, q.chosen)}. Right answer: ${choiceText(q, q.answer)}`}</span>
              </p>
              {q.mistake && <p className="border-l-2 border-[var(--danger)] pl-3">{q.mistake.fix}</p>}
            </li>
          ))}
        </ol>
        <SecondaryButton className="mt-2" onClick={() => setResult(null)}>
          Close
        </SecondaryButton>
      </div>
    );
  }

  if (quiz) {
    const answered = quiz.questions.filter((q) => picked[q.id]).length;
    return (
      <section aria-label="Quick quiz on this Topic" data-testid="skip-ahead-quiz" className="mt-4 border-t border-[var(--rule)] pt-4">
        <p className="text-sm leading-5 text-[var(--muted)]">
          {quiz.questions.length} questions, one on each idea. Get {quiz.needed} right and the whole Topic is passed.
        </p>
        <ol className="mt-3 flex flex-col gap-6">
          {quiz.questions.map((q, i) => (
            <li key={q.id}>
              <fieldset>
                <legend className="mb-2">
                  <span className="type-eyebrow block text-[var(--muted)]">
                    Question {i + 1} of {quiz.questions.length}
                  </span>
                  <span className="mt-1 block text-[15px] font-semibold leading-[22px] text-[var(--ink)]">{q.prompt}</span>
                </legend>
                <div className="flex flex-col gap-2">
                  {q.choices.map((c) => (
                    <OptionRow key={c.id} name={`skip-${quiz.attemptId}-${q.id}`} checked={picked[q.id] === c.id} onChange={() => setPicked({ ...picked, [q.id]: c.id })}>
                      {c.text}
                    </OptionRow>
                  ))}
                </div>
              </fieldset>
            </li>
          ))}
        </ol>
        {errorLine}
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <PrimaryButton data-testid="skip-ahead-submit" onClick={() => void submit()} disabled={answered < quiz.questions.length || busy || host.locked}>
            Submit answers
          </PrimaryButton>
          <SecondaryButton onClick={() => setQuiz(null)} disabled={busy}>
            Not now
          </SecondaryButton>
          <p className="text-[13px] leading-[18px] tabular-nums text-[var(--muted)]">
            {answered} of {quiz.questions.length} answered
          </p>
        </div>
      </section>
    );
  }

  if (state === "tried_today") {
    return (
      <p data-testid="skip-ahead-tried" className="mt-3 text-xs leading-4 text-[var(--muted)]">
        {SKIP_AHEAD_TRIED}
      </p>
    );
  }

  return (
    <div data-testid="skip-ahead" className="mt-3">
      <SecondaryButton data-testid="skip-ahead-open" onClick={() => void open()} disabled={busy || host.locked}>
        {SKIP_AHEAD_CHOICE}
      </SecondaryButton>
      <p className="mt-1 text-xs leading-4 text-[var(--muted)]">{SKIP_AHEAD_HINT}</p>
      {errorLine}
    </div>
  );
}
