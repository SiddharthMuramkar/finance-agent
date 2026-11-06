"use client";

import { useState } from "react";
import { IconButton } from "./icon-button";
import { MenuItem, useMenu } from "./primitives";
import { RestartConfirm } from "./restart-confirm";

/**
 * The Topic bar's "⋯" button and its menu (B3b): one row, "Start this Topic over…", which opens the same inline confirm as
 * Settings → Your Topics. The keyboard is A5's shared menu behaviour (useMenu): Enter, Space or ArrowDown opens; the
 * arrows, Home and End move; Escape closes it and returns focus to the button. The confirm sits under the bar's title, so
 * it is seen where the Learner pressed.
 */
export function TopicOptions({ topicId }: { topicId: string }) {
  const [confirming, setConfirming] = useState(false);
  const { open, setOpen, toggleRef: toggle, rootRef: root, menuRef: menu, menuId, onMenuKeyDown: onMenuKey, onToggleKeyDown } = useMenu();

  return (
    <>
      <div ref={root} className="relative inline-flex shrink-0">
        <IconButton
          ref={toggle}
          label="Topic options"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onClick={() => setOpen((o) => !o)}
          onKeyDown={onToggleKeyDown}
        >
          <span aria-hidden="true" className="text-base leading-none">
            ⋯
          </span>
        </IconButton>
        {open && (
          <div ref={menu} id={menuId} role="menu" aria-label="Topic options" onKeyDown={onMenuKey} className="absolute top-full right-0 z-20 mt-1 flex w-56 flex-col gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1">
            <MenuItem
              onClick={() => {
                setOpen(false);
                setConfirming(true);
              }}
            >
              Start this Topic over…
            </MenuItem>
          </div>
        )}
      </div>
      {confirming && (
        <div className="basis-full">
          <RestartConfirm
            topicId={topicId}
            onCancel={() => {
              setConfirming(false);
              toggle.current?.focus();
            }}
          />
        </div>
      )}
    </>
  );
}
