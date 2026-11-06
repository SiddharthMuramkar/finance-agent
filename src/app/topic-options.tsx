"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { IconButton } from "./icon-button";
import { MenuItem } from "./primitives";
import { RestartConfirm } from "./restart-confirm";

/**
 * The Topic bar's "⋯" button and its menu (B3b): one row, "Start this Topic over…", which opens the same inline confirm as
 * Settings → Your Topics. ArrowDown opens the menu; the arrows, Home and End move; Escape closes it and returns focus to the
 * button. The confirm sits under the bar's title, so it is seen where the Learner pressed.
 */
export function TopicOptions({ topicId }: { topicId: string }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const rows = () => [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
  useEffect(() => {
    if (!open) return;
    rows()[0]?.focus();
    const away = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const close = () => {
    setOpen(false);
    toggle.current?.focus();
  };
  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = rows();
    const i = list.indexOf(document.activeElement as HTMLElement);
    const moves: Record<string, number> = { ArrowDown: (i + 1) % list.length, ArrowUp: (i - 1 + list.length) % list.length, Home: 0, End: list.length - 1 };
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key in moves) {
      e.preventDefault();
      list[moves[e.key]]?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

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
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && !open) {
              e.preventDefault();
              setOpen(true);
            }
          }}
        >
          <span aria-hidden="true" className="text-base leading-none">
            ⋯
          </span>
        </IconButton>
        {open && (
          <div ref={menu} id={menuId} role="menu" aria-label="Topic options" onKeyDown={onMenuKey} className="absolute top-full right-0 z-20 mt-1 w-56 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1">
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
