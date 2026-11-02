"use client";

import { useState } from "react";

type Line = { role: "user" | "assistant"; text: string };

/** The conversation with the Tutor. Replies appear as they stream. */
export function Conversation({ initial }: { initial: Line[] }) {
  const [lines, setLines] = useState<Line[]>(initial);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const message = draft.trim();
    if (!message || busy) return;
    setDraft("");
    setError(null);
    setBusy(true);
    setLines((l) => [...l, { role: "user", text: message }, { role: "assistant", text: "" }]);
    const appendText = (text: string) =>
      setLines((l) => [...l.slice(0, -1), { role: "assistant", text: l[l.length - 1].text + text }]);
    try {
      const res = await fetch("/api/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok || !res.body) throw new Error(`The Tutor could not answer (${res.status}).`);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const parts = buffer.split("\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          if (!part) continue;
          const event = JSON.parse(part);
          if (event.type === "text") appendText(event.text);
          if (event.type === "error") setError(event.message);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The turn failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col p-6">
      <h1 className="mb-6 text-lg font-semibold">Study Workspace</h1>
      <ol className="flex flex-1 flex-col gap-4">
        {lines.map((line, i) => (
          <li key={i} className={line.role === "user" ? "self-end max-w-[85%]" : "max-w-[85%]"}>
            <div
              className={
                line.role === "user"
                  ? "rounded-lg bg-stone-200 px-3 py-2 dark:bg-stone-800"
                  : "whitespace-pre-wrap leading-relaxed"
              }
            >
              {line.text || (busy && i === lines.length - 1 ? "…" : "")}
            </div>
          </li>
        ))}
      </ol>
      {error && <p className="my-3 text-sm text-red-700 dark:text-red-400">{error}</p>}
      <form onSubmit={send} className="sticky bottom-0 mt-6 flex gap-2 bg-inherit py-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask the Tutor"
          aria-label="Message"
          className="flex-1 rounded border border-stone-300 bg-white px-3 py-2 dark:border-stone-700 dark:bg-stone-900"
        />
        <button
          disabled={busy}
          className="rounded bg-stone-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
        >
          Send
        </button>
      </form>
    </main>
  );
}
