"use client";

import { createContext, useContext, useState } from "react";
import { Chip } from "./primitives";
import { ResultIcon } from "./result-icon";
import type {
  QuickTryData,
  QuickTryResultData,
} from "@/tutor/session-item-kinds";

/** What a result remembers of its try's choices: the id tapped and the id of the right one (neither on an older result). */
export type QuickTryPick = Pick<QuickTryResultData, "choice" | "answer">;

/**
 * What the Study Workspace gives each Quick try (conversation.tsx): whether a Tutor turn is running (the input is
 * locked then), which tries already have a result (by key, with the choice tapped and the right one, read from the stored
 * result so a reload draws them again), and how to send an answer. With no host (old Sessions, Past Sessions pages) a
 * Quick try draws read-only.
 */
export type QuickTryHost = {
  locked: boolean;
  answered: ReadonlyMap<string, QuickTryPick>;
  /** Sends the id of the tapped choice; resolves to an error message to show, or null once it is marked. */
  answer: (key: string, choice: string) => Promise<string | null>;
};

export const QuickTryContext = createContext<QuickTryHost | null>(null);

/** The try's data when it is one (an older or broken row draws nothing). */
export function quickTryOf(data: Record<string, unknown>): QuickTryData | null {
  const { key, prompt, kind } = data;
  if (
    typeof key !== "string" ||
    typeof prompt !== "string" ||
    (kind !== "number" && kind !== "truth" && kind !== "choice")
  )
    return null;
  return data as unknown as QuickTryData;
}

/** The choice tapped and the right choice from a stored result's data; a missing or odd value is left out. */
export function pickOf(data: Record<string, unknown>): QuickTryPick {
  return {
    ...(typeof data.choice === "string" && { choice: data.choice }),
    ...(typeof data.answer === "string" && { answer: data.answer }),
  };
}

/** A result's data when it is one. */
export function quickTryResultOf(
  data: Record<string, unknown>,
): QuickTryResultData | null {
  const { key, verdict, line } = data;
  if (
    typeof key !== "string" ||
    typeof line !== "string" ||
    (verdict !== "right" && verdict !== "known_mistake" && verdict !== "wrong")
  )
    return null;
  return { key, verdict, line, ...pickOf(data) };
}

/**
 * A Quick try in the conversation: its ask (with the first step shown done, for a half-done try) and the choices to tap,
 * never a box to type in (ADR 0002). A wrong tap shows its mix-up fix at once, in the result under the try. Locked while
 * a Tutor turn runs and once the try has a result; read-only with no host. An older stored try (kind "number", no
 * choices) draws read-only too, with a line that a fresh one comes from the Tutor.
 */
export function QuickTryView({ data }: { data: QuickTryData }) {
  const host = useContext(QuickTryContext);
  const [picked, setPicked] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const result = host?.answered.get(data.key);
  const done = result !== undefined;
  // The stored result wins over the live tap, so a reload and a live answer draw the same marks.
  const chosen = result?.choice ?? picked;
  const disabled = !host || host.locked || done || sending;
  const choices =
    data.choices ??
    (data.kind === "truth"
      ? [
          { id: "true", text: "True" },
          { id: "false", text: "False" },
        ]
      : []);
  const send = async (choice: string) => {
    if (!host || disabled) return;
    setPicked(choice);
    setSending(true);
    setError(null);
    setError(await host.answer(data.key, choice));
    setSending(false);
  };
  return (
    <section
      data-testid="quick-try"
      aria-label="Quick try"
      className="self-stretch rounded-xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-sm leading-6"
    >
      <h3 className="type-eyebrow mb-1 text-key-number">
        Quick try{data.drill ? ` · ${data.drill.n} of ${data.drill.of}` : ""}
      </h3>
      <p>{data.prompt}</p>
      {data.halfDone && (
        <p data-testid="quick-try-half-done" className="text-[var(--muted)]">
          {data.halfDone}
        </p>
      )}
      {host && choices.length > 0 && (
        <div
          role="group"
          aria-label="Choose an answer"
          className="mt-2 flex flex-wrap gap-2"
        >
          {choices.map((c) => {
            // Once answered (spec 2026-11-12 G4): only the right choice shows a tick; a wrong tap shows a cross and
            // "Your pick", so a tick never sits on a wrong answer. Both stay at full strength beside each other, the tapped
            // chip keeping its pressed look. Before the mark, and on an older result that kept no right answer, the
            // tapped chip shows only its pressed look.
            const right = done && result.answer === c.id;
            const tapped = chosen === c.id;
            const wrongPick = done && tapped && result.answer !== undefined && !right;
            const mark = right || (done && tapped);
            return (
              <Chip
                key={c.id}
                data-testid={
                  data.kind === "truth" ? `quick-try-${c.id}` : "quick-try-choice"
                }
                data-right={right ? "true" : undefined}
                data-wrong-pick={wrongPick ? "true" : undefined}
                active={tapped}
                disabled={disabled}
                onClick={() => void send(c.id)}
                className={`text-left text-sm leading-5 ${mark ? "disabled:opacity-100" : ""} ${right ? "border-[var(--success)]" : ""}`.trim()}
              >
                {right && (
                  <>
                    <ResultIcon ok className="size-3.5" />
                    <span className="sr-only">{tapped ? "Your pick, right: " : "Right answer: "}</span>
                  </>
                )}
                {wrongPick && (
                  <>
                    <ResultIcon ok={false} className="size-3.5" />
                    <span className="sr-only">Not right: </span>
                  </>
                )}
                {c.text}
                {wrongPick && (
                  <span data-testid="quick-try-your-pick" className="text-xs font-medium text-[var(--muted)]">
                    <span aria-hidden="true">· </span>Your pick
                  </span>
                )}
              </Chip>
            );
          })}
        </div>
      )}
      {host && choices.length === 0 && (
        <p className="mt-1 text-xs text-[var(--muted)]">
          This is an older question. Ask the Tutor for a fresh Quick try.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-1 text-xs text-[var(--danger)]">
          {error}
        </p>
      )}
    </section>
  );
}

/** A Quick try's result: "Right.", the Known mistake's fix, or "Not quite.", after a tick or a cross (never colour alone). */
export function QuickTryResultView({ data }: { data: QuickTryResultData }) {
  const right = data.verdict === "right";
  return (
    <p
      data-testid="quick-try-result"
      data-verdict={data.verdict}
      className={`flex items-start gap-2 self-start text-sm leading-5 ${right ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
    >
      <ResultIcon ok={right} className="mt-0.5 size-4" />
      {data.line}
    </p>
  );
}
