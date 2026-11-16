"use client";

import { useState } from "react";
import { Button } from "../primitives";

type Said = { kind: "reply" | "problem"; text: string };

/**
 * The AI Tutor in the Assignment (spec #68, ticket #110): the Learner asks about their saved Own Case, and the Tutor
 * names each input the range check flagged and asks what story it assumes. Each message is a Tutor Turn: it counts
 * against the daily caps, and the "limit reached" words show when one is hit.
 */
export function AssignmentTutor() {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [said, setSaid] = useState<Said[]>([]);

  const send = async () => {
    const text = message.trim();
    if (!text || sending) return;
    setSending(true);
    const response = await fetch("/api/assignment/turn", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: text }) }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { reply?: string; error?: string } | null;
    setSending(false);
    if (response?.ok && body?.reply) {
      setMessage("");
      setSaid((all) => [...all, { kind: "reply", text: body.reply! }]);
    } else setSaid((all) => [...all, { kind: "problem", text: body?.error ?? "The Tutor could not answer. Try again." }]);
  };

  return (
    <section data-assignment-tutor aria-labelledby="assignment-tutor-title" className="mt-10 flex max-w-[640px] flex-col gap-3">
      <h2 id="assignment-tutor-title" className="type-h2">
        Ask the Tutor about your Own Case
      </h2>
      <p className="text-sm leading-5 text-[var(--muted)]">Save your Own Case first. The Tutor reads your figures and asks what story each unusual one assumes.</p>
      {said.map((s, i) => (
        <p key={i} data-assignment-said={s.kind} className={`whitespace-pre-line text-sm leading-5 ${s.kind === "problem" ? "text-[var(--danger)]" : ""}`}>
          {s.text}
        </p>
      ))}
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label htmlFor="assignment-tutor-message" className="text-sm font-medium leading-5">
          Your message
        </label>
        <textarea id="assignment-tutor-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className="field w-full" />
        <div>
          <Button type="submit" variant="primary" loading={sending}>
            Ask the Tutor
          </Button>
        </div>
      </form>
    </section>
  );
}
