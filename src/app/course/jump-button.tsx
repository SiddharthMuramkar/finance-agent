"use client";

import { useState } from "react";

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
        <button
          data-jump={topicId}
          onClick={() => (unmet.length ? setAsking(true) : void go())}
          className="mt-1 rounded border border-stone-400 px-2 py-0.5 text-xs hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-900"
        >
          Study this Topic
        </button>
      ) : (
        <div role="alertdialog" aria-label={`Prerequisites for ${title}`} className="mt-2 rounded border border-amber-600 p-3 text-xs dark:border-amber-500">
          <p>
            {title} builds on {unmet.join(", ")}, which you have not passed yet. You can fill the gap first, or go ahead anyway.
          </p>
          <div className="mt-2 flex gap-2">
            <button data-confirm-jump={topicId} onClick={() => void go()} className="rounded bg-stone-900 px-2 py-1 text-white dark:bg-stone-100 dark:text-stone-900">
              Go ahead
            </button>
            <button onClick={() => setAsking(false)} className="rounded border border-stone-400 px-2 py-1 dark:border-stone-600">
              Not now
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-700 dark:text-red-400">{error}</p>}
    </div>
  );
}

/** Goes back to the default path. The chosen Topic keeps its progress. */
export function BackToPathButton() {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        data-back-to-path
        onClick={async () => {
          const failed = await post(null);
          if (failed) setError(failed);
          else openWorkspace();
        }}
        className="mt-2 rounded border border-stone-400 px-2 py-1 text-xs dark:border-stone-600"
      >
        Back to the default path
      </button>
      {error && <p className="mt-1 text-xs text-red-700 dark:text-red-400">{error}</p>}
    </>
  );
}
