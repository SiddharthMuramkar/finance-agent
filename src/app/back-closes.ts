"use client";

import { useCallback, useEffect, useRef } from "react";

/** The history entry's mark for the panel's open view: the Back step useBackCloses adds. */
const STEP = "panelOpen";
const isStep = (state: unknown) => !!(state as Record<string, unknown> | null)?.[STEP];

/**
 * The small Back-history link for the panel's open view (#81): while `on` (a phone), opening a view adds one Back step,
 * and Back closes the view instead of leaving the page. The step keeps the page's own history state (Next.js keeps its
 * router's in it), so Back never navigates. Returns the close to use from the panel: it goes Back when a step was
 * added, so no stale step is left behind. Off (a laptop, a tablet), it never adds a step and closing just closes.
 *
 * Three edges: Back is heard for as long as a step is there, `on` or not (a phone turned past the breakpoint with the
 * view open still closes it, and the step goes with it); a page reloaded on the step (the view now closed) takes that
 * step as its own, so it is used up by the next Back or close and never left behind; and a second close while the first
 * Back is under way does nothing, so a double tap never goes Back twice and leaves the page.
 */
export function useBackCloses(open: boolean, close: () => void, on: boolean): () => void {
  const pushed = useRef(false);
  const closing = useRef(false);
  const closeNow = useRef(close);
  useEffect(() => {
    closeNow.current = close;
  });

  useEffect(() => {
    // Reloaded on the step: it is still there, so it is ours.
    if (isStep(window.history.state)) pushed.current = true;
    const onBack = () => {
      if (!pushed.current) return;
      pushed.current = false;
      closing.current = false;
      closeNow.current();
    };
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, []);

  useEffect(() => {
    if (!on || !open || pushed.current) return;
    window.history.pushState({ ...window.history.state, [STEP]: true }, "");
    pushed.current = true;
  }, [on, open]);

  return useCallback(() => {
    if (closing.current) return;
    if (pushed.current) {
      closing.current = true;
      window.history.back();
    } else closeNow.current();
  }, []);
}
