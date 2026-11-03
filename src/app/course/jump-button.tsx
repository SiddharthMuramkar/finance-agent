"use client";

import { useState } from "react";
import { PrimaryButton, SecondaryButton } from "../ui";

/** A full page load, so the workspace's server page re-reads the saved place. */
function openWorkspace() {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load is wanted here
  window.location.assign("/");
}

async function post(topicId: string | null): Promise<string | null> {
  const res = await fetch("/api/jump", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topicId }) });
  if (res.ok) return null;
  const { error } = (await res.json().catch(() => ({ error: null }))) as { error: string | null };
  return error ?? `Could not change Topic (${res.status}).`;
}

/** Chooses a Topic. With unmet prerequisites, it first asks the Learner to confirm. Then it opens the workspace. */
export function JumpButton({ topicId, title, unmet }: { topicId: string; title: string; unmet: string[] }) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    const failed = await post(topicId);
    if (failed) setError(failed);
    else openWorkspace();
  };
  return (
    <div className="mt-2 text-sm">
      {!asking ? (
        <SecondaryButton data-jump={topicId} onClick={() => (unmet.length ? setAsking(true) : void go())} className="mt-1 !px-2 !py-0.5 text-xs">
          Study this Topic
        </SecondaryButton>
      ) : (
        <div role="alertdialog" aria-label={`Prerequisites for ${title}`} className="mt-2 rounded border border-[var(--src-line)] bg-[var(--src-tint)] p-3 text-xs leading-4">
          <p>
            {title} builds on {unmet.join(", ")}, which you have not passed yet. You can fill the gap first, or go ahead anyway.
          </p>
          <div className="mt-2 flex gap-2">
            <PrimaryButton data-confirm-jump={topicId} onClick={() => void go()} className="!px-2 !py-1 text-xs">
              Go ahead
            </PrimaryButton>
            <SecondaryButton onClick={() => setAsking(false)} className="!px-2 !py-1 text-xs">
              Not now
            </SecondaryButton>
          </div>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-[var(--danger)]">{error}</p>}
    </div>
  );
}

/** Goes back to the default path. The chosen Topic keeps its progress. */
export function BackToPathButton() {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <SecondaryButton
        data-back-to-path
        onClick={async () => {
          const failed = await post(null);
          if (failed) setError(failed);
          else openWorkspace();
        }}
        className="mt-2 !px-2 !py-1 text-xs"
      >
        Back to the default path
      </SecondaryButton>
      {error && <p className="mt-1 text-xs text-[var(--danger)]">{error}</p>}
    </>
  );
}
