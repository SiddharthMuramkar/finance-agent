"use client";

import { useState } from "react";
import { PrimaryButton } from "../primitives";

/**
 * "Continue with Google": posts to Better Auth's social sign-in and follows the address it returns
 * (Google's own page). `callbackURL` is built by the server from the safe destination rule, so a
 * crafted `next` cannot turn sign-in into an open redirect (C1b).
 */
export function GoogleButton({ callbackURL }: { callbackURL: string }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function start() {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch("/api/auth/sign-in/social", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "google", callbackURL }),
      });
      const data = (await response.json()) as { url?: string };
      if (!response.ok || !data.url) throw new Error("no sign-in address");
      window.location.assign(data.url);
    } catch {
      setBusy(false);
      setFailed(true);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <PrimaryButton type="button" onClick={start} loading={busy}>
        Continue with Google
      </PrimaryButton>
      {failed && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          Sign-in didn&apos;t work. Try again.
        </p>
      )}
    </div>
  );
}
