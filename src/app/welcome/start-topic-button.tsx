"use client";

import { useState } from "react";
import { chooseTopic, openWorkspace } from "../course/jump-button";
import { PrimaryButton } from "../ui";

/**
 * The Welcome's big Start this Topic: chooses the Topic, as the Course Map does, then opens the Study
 * Workspace, which shows the Topic's new Session and starts the Tutor's opener by itself.
 */
export function StartTopicButton({ topicId }: { topicId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = async () => {
    setBusy(true);
    const failed = await chooseTopic({ topicId });
    if (!failed) return openWorkspace();
    setError(failed);
    setBusy(false);
  };
  return (
    <div className="mt-5">
      <PrimaryButton data-start-topic={topicId} disabled={busy} onClick={() => void start()} className="w-full !py-3 text-base">
        Start this Topic
      </PrimaryButton>
      {error && (
        <p role="alert" className="mt-2 text-xs leading-4 text-[var(--danger)]">
          {error}
        </p>
      )}
    </div>
  );
}
