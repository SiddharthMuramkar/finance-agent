"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

// The one place the app speaks to screen readers. A message with its own live region inside a scroller could make
// the page taller or scroll; this single region is mounted once in the root layout, outside every scroller.

type Announce = (message: string) => void;

const AnnouncerContext = createContext<Announce>(() => {});

/** Says `message` to screen readers once. Outside an AnnouncerProvider (a test, a static page) it does nothing. */
export function useAnnounce(): Announce {
  return useContext(AnnouncerContext);
}

/**
 * Holds the app's single polite live region (data-testid="app-announcer") and gives useAnnounce() to everything below.
 * Saying the same words twice in a row is announced twice: the region is emptied first and filled on the next frame,
 * because a screen reader speaks only a change of text.
 */
export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Nothing may call the setter after unmount: a late timer would hit a torn-down window in tests.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    },
    [],
  );
  const announce = useCallback<Announce>((message) => {
    if (timer.current) clearTimeout(timer.current);
    setText("");
    timer.current = setTimeout(() => {
      timer.current = null;
      setText(message);
    }, 50);
  }, []);
  const value = useMemo(() => announce, [announce]);
  return (
    <AnnouncerContext.Provider value={value}>
      {children}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-testid="app-announcer">
        {text}
      </div>
    </AnnouncerContext.Provider>
  );
}
