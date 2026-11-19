"use client";

import { useState } from "react";
import { IconButton } from "./icon-button";
import { MenuItem, useMenu } from "./primitives";
import { RestartConfirm } from "./restart-confirm";

/**
 * The Topic bar's "⋯" button (three dots) and its menu (B3b), a .popover: one row, "Start this Topic over…", which opens the same inline confirm as
 * Settings → Your Topics. The keyboard is A5's shared menu behaviour (useMenu): Enter, Space or ArrowDown opens; the
 * arrows, Home and End move; Escape closes it and returns focus to the button. The confirm takes a full row of the bar
 * under its title, so it is seen where the Learner pressed. The bar is a Band (spec 2026-11-12 F3), so the menu and the
 * confirm are cards on it (`band-card`): they read like the page, and the Band's white text and white buttons stop at
 * their edge. The menu is a native popover (audit batch 2): drawn in the top layer, over the workspace under the bar, with
 * no z-index, and still a card on the Band in the DOM, so the band-card rules reach it. `className` places the button in
 * the bar.
 */
export function TopicOptions({ topicId, className = "" }: { topicId: string; className?: string }) {
  const [confirming, setConfirming] = useState(false);
  const { toggleRef, hide, toggleProps, menuProps } = useMenu();

  return (
    <>
      <div className={`inline-flex shrink-0 ${className}`.trim()}>
        <IconButton {...toggleProps} label="Topic options">
          <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor" stroke="none">
            <circle cx="3.5" cy="8" r="1.25" />
            <circle cx="8" cy="8" r="1.25" />
            <circle cx="12.5" cy="8" r="1.25" />
          </svg>
        </IconButton>
        {/* Laid out only while open (open:flex): a display class of its own would show it closed too. */}
        <div {...menuProps} aria-label="Topic options" className="popover band-card w-60 flex-col gap-0.5 open:flex">
          <MenuItem
            onClick={() => {
              hide();
              setConfirming(true);
            }}
          >
            Start this Topic over…
          </MenuItem>
        </div>
      </div>
      {confirming && (
        <div className="band-card col-span-full rounded-xl">
          <RestartConfirm
            topicId={topicId}
            onCancel={() => {
              setConfirming(false);
              toggleRef.current?.focus();
            }}
          />
        </div>
      )}
    </>
  );
}
