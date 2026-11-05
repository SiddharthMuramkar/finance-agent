"use client";

import { createContext, useContext, useState } from "react";
import type {
  QuickTryData,
  QuickTryResultData,
} from "@/tutor/session-item-kinds";

/**
 * What the Study Workspace gives each Quick try (conversation.tsx): whether a Tutor turn is running (the input is
 * locked then), which tries already have a result, and how to send an answer. With no host (old Sessions, Past
 * Sessions pages) a Quick try draws read-only.
 */
export type QuickTryHost = {
  locked: boolean;
  answered: ReadonlySet<string>;
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
  return { key, verdict, line };
}

/**
 * A Quick try in the conversation: its ask (with the first step shown done, for a half-done try) and the choices to tap,
 * never a box to type in (ADR 0009). A wrong tap shows its mix-up fix at once, in the result under the try. Locked while
 * a Tutor turn runs and once the try has a result; read-only with no host. An older stored try (kind "number", no
 * choices) draws read-only too, with a line that a fresh one comes from the Tutor.
 */
export function QuickTryView({ data }: { data: QuickTryData }) {
  const host = useContext(QuickTryContext);
  const [picked, setPicked] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = host?.answered.has(data.key) ?? false;
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
      className="self-stretch rounded-lg border border-[var(--brand-line)] bg-[var(--brand-tint)] px-4 py-3 text-sm leading-6"
    >
      <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
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
          {choices.map((c) => (
            <button
              key={c.id}
              type="button"
              data-testid={
                data.kind === "truth" ? `quick-try-${c.id}` : "quick-try-choice"
              }
              aria-pressed={picked === c.id}
              disabled={disabled}
              onClick={() => void send(c.id)}
              className="pressable min-h-9 rounded-md border border-[var(--border)] border-b-[3px] bg-[var(--bg)] px-3 py-1 font-medium enabled:hover:bg-[var(--hairline)] disabled:opacity-60 aria-pressed:border-[var(--brand)] aria-pressed:bg-[var(--brand-tint)]"
            >
              {c.text}
            </button>
          ))}
        </div>
      )}
      {host && choices.length === 0 && (
        <p className="mt-1 text-xs text-[var(--muted)]">
          This is an older question. Ask the Tutor for a fresh Quick try.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-1 text-xs text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </section>
  );
}

/** A Quick try's result: "Right.", the Known mistake's fix, or "Not quite.". */
export function QuickTryResultView({ data }: { data: QuickTryResultData }) {
  return (
    <p
      data-testid="quick-try-result"
      data-verdict={data.verdict}
      className={`self-start text-sm leading-5 ${data.verdict === "right" ? "text-[var(--you)]" : "text-[var(--color-danger)]"}`}
    >
      {data.line}
    </p>
  );
}
