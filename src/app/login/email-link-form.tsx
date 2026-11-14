"use client";

import { type FormEvent, useId, useState } from "react";
import { Button, LinkButton } from "../primitives";

/** Why a link wasn't sent, in the words the form shows. */
export type EmailLinkProblem = "throttled" | "daily_cap" | "not_sent" | "bad_email";

/**
 * Better Auth's refusal as one of the form's problems: its own per-address limit (`email_link_throttled`) and its
 * per-IP rate limit (a bare 429) both mean "wait a few minutes"; `email_link_daily_cap` is the site's daily cap; a 400
 * is an address it can't use; anything else, `email_not_sent` included, is a failed send (email-link.ts).
 */
export function emailLinkProblem(status: number, code: string | undefined): EmailLinkProblem {
  if (code === "email_link_daily_cap") return "daily_cap";
  if (code === "email_link_throttled" || status === 429) return "throttled";
  if (status === 400) return "bad_email";
  return "not_sent";
}

function problemWords(problem: EmailLinkProblem, google: boolean): string {
  if (problem === "throttled") return "Too many sign-in emails. Wait a few minutes, then try again.";
  if (problem === "daily_cap") return `Email sign-in is resting until tomorrow. ${google ? "Continue with Google instead." : "Try again then."}`;
  if (problem === "bad_email") return "That email address doesn't look right. Check it and try again.";
  return google ? "We couldn't send the email. Try again, or continue with Google." : "We couldn't send the email. Try again in a moment.";
}

/**
 * "Email me a sign-in link" (ADR 0014): posts the address to Better Auth's magic-link sign-in with a plain fetch, as
 * GoogleButton does, and on success swaps the form for "Check your email". `callbackURL` is built by the server from the
 * safe destination rule, so a crafted `next` can't turn the link into an open redirect. `primary`: the page's one
 * primary button when Google is off, else a secondary under it. `google`: whether Google is there to suggest instead
 * when email can't be sent. Works for any address, iCloud included; whoever is new then waits for the owner.
 */
export function EmailLinkForm({ callbackURL, primary, google }: { callbackURL: string; primary: boolean; google: boolean }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<EmailLinkProblem | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  // After "Use a different email" the field takes focus, so the keyboard isn't left on a button that is gone.
  const [again, setAgain] = useState(false);
  const id = useId();

  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    setBusy(true);
    setProblem(null);
    try {
      const response = await fetch("/api/auth/sign-in/magic-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, callbackURL }),
      });
      if (response.ok) {
        setSentTo(email);
        return;
      }
      const data = (await response.json().catch(() => ({}))) as { code?: string };
      setProblem(emailLinkProblem(response.status, data.code));
    } catch {
      setProblem("not_sent");
    } finally {
      setBusy(false);
    }
  }

  if (sentTo !== null)
    return (
      <div role="status" className="flex flex-col items-start gap-2">
        <h2 className="text-base font-semibold leading-6">Check your email</h2>
        <p className="text-sm leading-5 text-[var(--muted)]">
          We sent a sign-in link to <span className="break-all font-medium text-[var(--ink)]">{sentTo}</span>. It works once, for 15 minutes. Open it on this device.
        </p>
        <LinkButton
          className="text-sm"
          onClick={() => {
            setSentTo(null);
            setAgain(true);
          }}
        >
          Use a different email
        </LinkButton>
      </div>
    );

  return (
    <form onSubmit={send} className="flex flex-col gap-3">
      <label htmlFor={`${id}-email`} className="text-sm text-[var(--muted)]">
        Email
      </label>
      <input
        id={`${id}-email`}
        name="email"
        type="email"
        required
        autoComplete="email"
        spellCheck={false}
        autoFocus={primary || again}
        aria-describedby={problem ? `${id}-problem` : undefined}
        className="field h-11 w-full px-3 text-[15px]"
      />
      {problem && (
        <p id={`${id}-problem`} role="alert" className="text-sm text-[var(--danger)]">
          {problemWords(problem, google)}
        </p>
      )}
      <Button type="submit" variant={primary ? "primary" : "secondary"} size="lg" loading={busy} className="w-full">
        Email me a sign-in link
      </Button>
    </form>
  );
}
