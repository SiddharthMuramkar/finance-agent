"use client";

import { useEffect, useRef, useState } from "react";
import { PrimaryButton, SecondaryButton } from "../ui";

/** A full page load, so the workspace's server page re-reads the saved place. */
export function openWorkspace() {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load is wanted here
  window.location.assign("/study");
}

/** Chooses a Topic (null: back to the default path), or what comes next. Null when it worked, else what went wrong. */
export async function chooseTopic(choice: { topicId: string | null } | { next: true }): Promise<string | null> {
  const res = await fetch("/api/jump", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(choice) });
  if (res.ok) return null;
  const { error } = (await res.json().catch(() => ({ error: null }))) as { error: string | null };
  return error ?? `Could not change Topic (${res.status}).`;
}

/** The prerequisite confirm. It is a labelled group, not a modal dialog: focus moves to "Go ahead" when it appears, and Escape cancels. */
export function PrerequisiteConfirm({ topicId, title, unmet, onGo, onCancel }: { topicId: string; title: string; unmet: string[]; onGo: () => void; onCancel: () => void }) {
  return (
    <div
      role="group"
      aria-label={`Prerequisites for ${title}`}
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
      className="mt-2 rounded border border-[var(--src-line)] bg-[var(--src-tint)] p-3 text-xs leading-4"
    >
      <p>
        {title} builds on {unmet.join(", ")}, which you have not passed yet. You can fill the gap first, or go ahead anyway.
      </p>
      <div className="mt-2 flex gap-2">
        <PrimaryButton autoFocus data-confirm-jump={topicId} onClick={onGo} className="!px-2 !py-1 text-xs">
          Go ahead
        </PrimaryButton>
        <SecondaryButton onClick={onCancel} className="!px-2 !py-1 text-xs">
          Not now
        </SecondaryButton>
      </div>
    </div>
  );
}

/** Chooses a Topic. With unmet prerequisites, it first asks the Learner to confirm. Then it opens the workspace. */
export function JumpButton({ topicId, title, unmet }: { topicId: string; title: string; unmet: string[] }) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const wasAsking = useRef(false);
  // Keyboard and screen-reader users keep their place: when the confirm closes, focus goes back to the button.
  useEffect(() => {
    if (wasAsking.current && !asking) trigger.current?.focus();
    wasAsking.current = asking;
  }, [asking]);
  const go = async () => {
    const failed = await chooseTopic({ topicId });
    if (failed) setError(failed);
    else openWorkspace();
  };
  return (
    <div className="mt-2 text-sm">
      {!asking ? (
        <SecondaryButton ref={trigger} data-jump={topicId} onClick={() => (unmet.length ? setAsking(true) : void go())} className="mt-1 !px-2 !py-0.5 text-xs">
          Study this Topic
        </SecondaryButton>
      ) : (
        <PrerequisiteConfirm topicId={topicId} title={title} unmet={unmet} onGo={() => void go()} onCancel={() => setAsking(false)} />
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
          const failed = await chooseTopic({ topicId: null });
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

/**
 * What comes next: opens the Learner's current Topic (the Course Navigator's place), whose Session shows at
 * once. After a Topic passed in a turn, this is how the Learner leaves it. Refused while a turn is running.
 */
export function WhatComesNextButton({ label }: { label: string }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <PrimaryButton
        data-what-comes-next
        onClick={async () => {
          const failed = await chooseTopic({ next: true });
          if (failed) setError(failed);
          else openWorkspace();
        }}
      >
        {label} →
      </PrimaryButton>
      {error && <p className="mt-1 text-xs text-[var(--danger)]">{error}</p>}
    </>
  );
}
