"use client";

import { useEffect, useRef } from "react";
import { Button } from "./ui";

/**
 * What the restart form posts as `confirm`. The same words as RESTART_CONFIRM in src/learner/restart.ts, which this
 * client file cannot import (it reaches the database); a test keeps the two equal.
 */
export const RESTART_CONFIRM_VALUE = "restart-topic";

/**
 * The inline confirm for starting one Topic over (B3b), used by the Topic bar's ⋯ menu and Settings → Your Topics. A plain
 * form post to the Topic's restart route, so it works without scripts; Cancel only closes it, and nothing is posted.
 * On opening it moves focus to Cancel (the safe choice), so a keyboard Learner lands in the confirm and not on the page
 * when the control that opened it goes away; each caller sends focus back to its own opener on Cancel.
 */
export function RestartConfirm({ topicId, onCancel }: { topicId: string; onCancel: () => void }) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => cancel.current?.focus(), []);
  return (
    <form method="post" action={`/api/topics/${topicId}/restart`} data-testid="restart-confirm" className="flex flex-col items-start gap-2 rounded-lg border border-[var(--border)] p-3">
      <input type="hidden" name="confirm" value={RESTART_CONFIRM_VALUE} />
      <p className="measure text-sm leading-5">This clears your Checks and progress for this Topic. Your Notebook keeps the old conversation and your notes.</p>
      <div className="flex gap-2">
        <Button type="submit" variant="danger" size="sm">
          Start over
        </Button>
        <Button ref={cancel} variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
