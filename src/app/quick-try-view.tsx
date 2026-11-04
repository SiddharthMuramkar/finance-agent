"use client";

import { createContext, useContext, useState } from "react";
import type { QuickTryData, QuickTryResultData } from "@/tutor/session-item-kinds";

/**
 * What the Study Workspace gives each Quick try (conversation.tsx): whether a Tutor turn is running (the input is
 * locked then), which tries already have a result, and how to send an answer. With no host (old Sessions, Past
 * Sessions pages) a Quick try draws read-only.
 */
export type QuickTryHost = {
  locked: boolean;
  answered: ReadonlySet<string>;
  /** Sends the answer; resolves to an error message to show, or null once it is marked. */
  answer: (key: string, input: string) => Promise<string | null>;
};

export const QuickTryContext = createContext<QuickTryHost | null>(null);

/** The try's data when it is one (an older or broken row draws nothing). */
export function quickTryOf(data: Record<string, unknown>): QuickTryData | null {
  const { key, prompt, kind } = data;
  if (typeof key !== "string" || typeof prompt !== "string" || (kind !== "number" && kind !== "truth")) return null;
  return data as unknown as QuickTryData;
}

/** A result's data when it is one. */
export function quickTryResultOf(data: Record<string, unknown>): QuickTryResultData | null {
  const { key, verdict, line } = data;
  if (typeof key !== "string" || typeof line !== "string" || (verdict !== "right" && verdict !== "known_mistake" && verdict !== "wrong")) return null;
  return { key, verdict, line };
}

/** The unit as the box shows it beside the number. */
const UNIT_LABELS: Record<string, string> = { bp: "bp", points: "points", percent: "%", inr: "₹", years: "years", ratio: "" };

/**
 * A Quick try in the conversation: its ask (with the first step shown done, for a half-done try), and a number box or
 * True and False buttons. Locked while a Tutor turn runs and once it has a result; read-only with no host.
 */
export function QuickTryView({ data }: { data: QuickTryData }) {
  const host = useContext(QuickTryContext);
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = host?.answered.has(data.key) ?? false;
  const disabled = !host || host.locked || done || sending;
  const send = async (input: string) => {
    if (!host || disabled || !input.trim()) return;
    setSending(true);
    setError(null);
    setError(await host.answer(data.key, input));
    setSending(false);
  };
  const unit = data.unit ? UNIT_LABELS[data.unit] ?? data.unit : "";
  return (
    <section data-testid="quick-try" aria-label="Quick try" className="self-stretch rounded-lg border border-[var(--brand-line)] bg-[var(--brand-tint)] px-4 py-3 text-sm leading-6">
      <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
        Quick try{data.drill ? ` · ${data.drill.n} of ${data.drill.of}` : ""}
      </h3>
      <p>{data.prompt}</p>
      {data.halfDone && (
        <p data-testid="quick-try-half-done" className="text-[var(--muted)]">
          {data.halfDone}
        </p>
      )}
      {host &&
        (data.kind === "truth" ? (
          <div className="mt-2 flex gap-2">
            {["True", "False"].map((choice) => (
              <button
                key={choice}
                type="button"
                data-testid={`quick-try-${choice.toLowerCase()}`}
                disabled={disabled}
                onClick={() => void send(choice)}
                className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1 font-medium disabled:opacity-50"
              >
                {choice}
              </button>
            ))}
          </div>
        ) : (
          <form
            className="mt-2 flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send(value);
            }}
          >
            <input
              data-testid="quick-try-input"
              aria-label="Your answer"
              inputMode="decimal"
              autoComplete="off"
              value={value}
              disabled={disabled}
              onChange={(e) => setValue(e.target.value)}
              className="w-28 rounded-md border border-[var(--border)] bg-[var(--field)] px-2 py-1 disabled:opacity-50"
            />
            {unit && <span className="text-[var(--muted)]">{unit}</span>}
            <button type="submit" data-testid="quick-try-check" disabled={disabled || !value.trim()} className="rounded-md bg-[var(--brand)] px-3 py-1 font-medium text-[var(--brand-ink)] disabled:opacity-50">
              Check
            </button>
          </form>
        ))}
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
    <p data-testid="quick-try-result" data-verdict={data.verdict} className={`self-start text-sm leading-5 ${data.verdict === "right" ? "text-[var(--you)]" : ""}`}>
      {data.line}
    </p>
  );
}
