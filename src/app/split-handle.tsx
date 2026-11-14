"use client";

import { useEffect, useRef, useState } from "react";
import { SPLIT_COOKIE, SPLIT_DEFAULT, nextSplit, shareAtPointer, splitBounds, type SplitBounds } from "./split";
import { writeCookie } from "./theme-store";

/**
 * The Split handle (spec 2026-11-11, C2b). The Learner drags it, or moves it with the arrow keys, Home and End, and a
 * double-click puts the share back to 45. The share is written on the frame at once and saved in the `split` cookie.
 */
export function SplitHandle({ initial }: { initial: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [share, setShare] = useState(initial);
  const [bounds, setBounds] = useState<SplitBounds>({ min: 33, max: 67 });
  const shareRef = useRef(initial);
  const boundsRef = useRef(bounds);
  const drag = useRef<{ left: number; width: number; handle: number } | null>(null);
  const frameId = useRef(0);

  useEffect(() => {
    boundsRef.current = bounds;
  }, [bounds]);

  useEffect(() => {
    const el = ref.current;
    const frame = el?.closest<HTMLElement>("[data-split-frame]");
    if (!el || !frame || typeof ResizeObserver === "undefined") return;
    const measure = () => setBounds(splitBounds(frame.clientWidth - el.offsetWidth));
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(frame);
    return () => watch.disconnect();
  }, []);

  const apply = (n: number) => {
    const b = boundsRef.current;
    const next = Math.min(b.max, Math.max(b.min, n));
    shareRef.current = next;
    setShare(next);
    ref.current?.closest<HTMLElement>("[data-split-frame]")?.style.setProperty("--split-saved", String(next));
  };
  const save = (n: number) => writeCookie(SPLIT_COOKIE, String(n));

  const shown = Math.min(bounds.max, Math.max(bounds.min, share));

  return (
    <div
      ref={ref}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the conversation and the Widget panel"
      aria-valuenow={shown}
      aria-valuemin={bounds.min}
      aria-valuemax={bounds.max}
      aria-valuetext={`Conversation ${shown}%`}
      aria-controls="conversation-column widget-column"
      tabIndex={0}
      title="Drag to share the width. Double-click to reset."
      data-testid="split-handle"
      data-affordance="split"
      className="split-handle self-stretch max-lg:invisible"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const el = ref.current;
        const frame = el?.closest<HTMLElement>("[data-split-frame]");
        if (!el || !frame) return;
        el.setPointerCapture(event.pointerId);
        const rect = frame.getBoundingClientRect();
        drag.current = { left: rect.left, width: rect.width, handle: el.offsetWidth };
        document.documentElement.dataset.splitting = "";
      }}
      onPointerMove={(event) => {
        const d = drag.current;
        if (!d) return;
        const x = event.clientX;
        if (frameId.current) cancelAnimationFrame(frameId.current);
        frameId.current = requestAnimationFrame(() => apply(shareAtPointer(x, d, d.handle, boundsRef.current)));
      }}
      onPointerUp={() => {
        if (!drag.current) return;
        drag.current = null;
        delete document.documentElement.dataset.splitting;
        save(shareRef.current);
      }}
      onPointerCancel={() => {
        drag.current = null;
        delete document.documentElement.dataset.splitting;
        save(shareRef.current);
      }}
      onLostPointerCapture={() => {
        if (!drag.current && document.documentElement.dataset.splitting === undefined) return;
        drag.current = null;
        delete document.documentElement.dataset.splitting;
        save(shareRef.current);
      }}
      onKeyDown={(event) => {
        const next = nextSplit(shareRef.current, event.key, boundsRef.current);
        if (next === null) return;
        event.preventDefault();
        apply(next);
        save(next);
      }}
      onDoubleClick={() => {
        apply(SPLIT_DEFAULT);
        save(SPLIT_DEFAULT);
      }}
    >
      <span aria-hidden="true" data-split-line="" />
      <span aria-hidden="true" data-split-grip="" />
    </div>
  );
}
