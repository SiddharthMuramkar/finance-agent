"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "../ui";
import { DENY_CONFIRM } from "./done";

// The buttons on /admin's rows (ADR 0014). Every change is a plain form post to /api/admin/access, whose 303 reloads the
// page with the result, so they work without scripts; scripts only open and close the confirm.

/** Approve: posts at once, no confirm (it only lets someone in, and Deny undoes it). */
export function ApproveButton({ userId }: { userId: string }) {
  return (
    <form action="/api/admin/access" method="post">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="action" value="approve" />
      <Button type="submit" variant="secondary" size="sm">
        Approve
      </Button>
    </form>
  );
}

const ASK = {
  deny: {
    opener: "Deny",
    question: (email: string) => `Deny ${email}?`,
    detail: "They can't come in, now or later, unless you approve them. Nothing is sent to them.",
    yes: "Yes, deny",
  },
  remove: {
    opener: "Remove access",
    question: (email: string) => `Remove access for ${email}?`,
    detail: "They are signed out at once and can't sign back in. Their progress is kept.",
    yes: "Yes, remove access",
  },
} as const;

/**
 * A row's buttons, then its confirm on a line of its own (the row is a wrapping flex row; the confirm takes its full
 * width). "deny", for a waiting person: Approve and Deny. "remove", for someone with access: Remove access, an outline
 * danger button. Deny and Remove access are the same change (a denial, and their sessions end), so both confirms post
 * `action=deny` with `confirm=deny`; the confirm is modelled on Settings' Start over: it names the email, lands on
 * Cancel (the safe choice), and Cancel gives focus back to the button that opened it.
 */
export function RowActions({ userId, email, kind }: { userId: string; email: string; kind: "deny" | "remove" }) {
  const [asking, setAsking] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const id = useId();
  const words = ASK[kind];
  useEffect(() => {
    if (asking) cancel.current?.focus();
  }, [asking]);
  return (
    <>
      <div className="flex shrink-0 items-center gap-2">
        {kind === "deny" && <ApproveButton userId={userId} />}
        <Button
          ref={opener}
          variant="secondary"
          size="sm"
          className={kind === "remove" ? "btn-danger-outline" : ""}
          aria-expanded={asking}
          onClick={() => setAsking(true)}
        >
          {words.opener}
        </Button>
      </div>
      {asking && (
        <div
          role="alertdialog"
          aria-labelledby={`${id}-question`}
          aria-describedby={`${id}-detail`}
          className="basis-full rounded-xl border border-[var(--line)] bg-[var(--wash)] p-3 text-sm"
        >
          <p id={`${id}-question`} className="break-all font-medium leading-5">
            {words.question(email)}
          </p>
          <p id={`${id}-detail`} className="measure mt-1 leading-5 text-[var(--muted)]">
            {words.detail}
          </p>
          <form action="/api/admin/access" method="post" className="mt-3 flex items-center gap-2">
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="action" value="deny" />
            <input type="hidden" name="confirm" value={DENY_CONFIRM} />
            <Button type="submit" variant="danger" size="sm">
              {words.yes}
            </Button>
            <Button
              ref={cancel}
              variant="secondary"
              size="sm"
              onClick={() => {
                setAsking(false);
                opener.current?.focus();
              }}
            >
              Cancel
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
