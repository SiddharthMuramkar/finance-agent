"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * The small Back-history link for the panel's open view (#81): while `on` (a phone), opening a view adds one Back step,
 * and Back closes the view instead of leaving the page. The step keeps the page's own history state (Next.js keeps its
 * router's in it), so Back never navigates. Returns the close to use from the panel: it goes Back when a step was
 * added, so no stale step is left behind. Off (a laptop, a tablet), it never touches history and closing just closes.
 */
export function useBackCloses(open: boolean, close: () => void, on: boolean): () => void {
  const pushed = useRef(false);
  const closeNow = useRef(close);
  useEffect(() => {
    closeNow.current = close;
  });

  useEffect(() => {
    if (!on || !open || pushed.current) return;
    window.history.pushState({ ...window.history.state, panelOpen: true }, "");
    pushed.current = true;
  }, [on, open]);

  useEffect(() => {
    if (!on) return;
    const onBack = () => {
      if (!pushed.current) return;
      pushed.current = false;
      closeNow.current();
    };
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, [on]);

  return useCallback(() => {
    if (pushed.current) window.history.back();
    else closeNow.current();
  }, []);
}
