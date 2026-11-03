"use client";

import { useState } from "react";
import { send } from "../profile/profile-form";
import { PrimaryButton, SecondaryButton } from "../ui";

/** The Show developer details switch: saved at once, for this Learner on every device. */
export function DeveloperDetailsSwitch({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const change = async (next: boolean) => {
    setOn(next);
    setSaving(true);
    const failed = await send("/api/settings", "PUT", { showDeveloperDetails: next });
    setSaving(false);
    setError(failed);
    if (failed) setOn(!next);
  };

  return (
    <div className="text-sm">
      <label className="flex items-start gap-2 leading-5">
        <input
          type="checkbox"
          checked={on}
          disabled={saving}
          onChange={(e) => void change(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
        />
        <span>
          Show developer details
          <span className="block text-xs leading-4 text-[var(--muted)]">
            Adds an &ldquo;Under the hood&rdquo; line under each Tutor reply: the model, the steps, tokens, time and cost.
          </span>
        </span>
      </label>
      {error && (
        <p role="alert" className="mt-2 text-xs leading-4 text-[var(--danger)]">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Start over as a new learner: a button that first asks for confirmation, then posts a plain form to
 * /api/start-over, whose 303 opens the Welcome as the fresh Learner.
 */
export function StartOverButton({ confirmValue }: { confirmValue: string }) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <SecondaryButton onClick={() => setAsking(true)}>Start over as a new learner</SecondaryButton>;
  return (
    <div role="alertdialog" aria-labelledby="start-over-question" className="rounded-lg border border-[var(--border)] p-4 text-sm">
      <p id="start-over-question" className="font-medium leading-5">
        Start over as a new learner?
      </p>
      <p className="mt-1 leading-5 text-[var(--muted)]">
        You begin again at the Welcome with no progress, Notes or Sessions. Nothing is deleted: your current progress is kept, but you won&rsquo;t see it here again.
        Any other device signed in as you is signed out.
      </p>
      <form action="/api/start-over" method="post" className="mt-3 flex items-center gap-2">
        <input type="hidden" name="confirm" value={confirmValue} />
        <PrimaryButton type="submit">Yes, start over</PrimaryButton>
        <SecondaryButton onClick={() => setAsking(false)}>Cancel</SecondaryButton>
      </form>
    </div>
  );
}
