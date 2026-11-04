"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { SavedWidget, WidgetStates } from "@/widgets/widget-state";

/**
 * The Study Workspace's Widget state: each Widget's slider values and ticked Guided Tasks in the shown Session, by
 * Widget key. It starts from what the server saved (the page reads it with the Session) and outlives any one
 * Widget, so a Widget mounted again after a tab switch draws as it was left. Changes are posted to
 * /api/widget-state a moment after the Learner stops moving (and at once when the page is left), so a reload
 * draws them too.
 */
export type WidgetStore = {
  /** What is saved for this Widget key, if anything. */
  saved: (key: string) => SavedWidget | undefined;
  /** Saves new slider values or more ticks (ticks are added, never taken away). */
  save: (key: string, change: Partial<SavedWidget>) => void;
  /** Every Widget's state as it stands now, by Widget key: what each turn request tells the Tutor of. */
  all: () => WidgetStates;
  /**
   * Applies slider values the server pushed (the Tutor updated a Widget): saves them like a drag would (replacing a
   * pending save for the key), leaves ticked Guided Tasks as they are, and bumps the key's revision.
   */
  push: (key: string, values: Record<string, number>) => void;
  /** Counts the server pushes that changed this Widget's values; a Widget keyed by it remounts at the new values. */
  revision: (key: string) => number;
  /** Calls back when any revision changes; returns the way to stop. */
  subscribe: (listener: () => void) => () => void;
};

/** The store behind a store's `all` function, so the turn stream (given only `all`) can push server-sent state. */
const storeByAll = new WeakMap<() => WidgetStates, WidgetStore>();
export const storeOf = (all: (() => WidgetStates) | undefined): WidgetStore | undefined => (all ? storeByAll.get(all) : undefined);

const WidgetStatesContext = createContext<WidgetStore | null>(null);

/** The page's Widget state, or null outside the Study Workspace (Notes, Older sessions, Home), where nothing is saved. */
export const useWidgetStore = () => useContext(WidgetStatesContext);

/** How long after the last change the Widget's state is posted: a slider drag makes one save, not dozens. */
const SAVE_AFTER_MS = 400;

const sameValues = (a: Record<string, number>, b: Record<string, number>) => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => b[k] === a[k]);
};

/**
 * The shown Session's Widget state, for WidgetStatesProvider to hand to the Widgets and for each turn request to
 * carry. `sessionId` is the Session the page shows; before its first turn there is none, and changes wait until the
 * turn has made it.
 */
export function useWidgetStates(sessionId: number | undefined, initial: WidgetStates | undefined): WidgetStore {
  const [store] = useState(() => {
    const states = new Map<string, SavedWidget>(Object.entries(initial ?? {}));
    const pending = new Set<string>();
    let session = sessionId;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const revisions = new Map<string, number>();
    const listeners = new Set<() => void>();
    const flush = () => {
      clearTimeout(timer);
      if (session === undefined) return;
      for (const key of pending) {
        const state = states.get(key);
        if (!state) continue;
        // keepalive: a save made as the page is left (a reload) still reaches the server.
        void fetch("/api/widget-state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: session, widgetKey: key, ...state }),
          keepalive: true,
        }).catch(() => {});
      }
      pending.clear();
    };
    const api: WidgetStore & { flush: () => void; showSession: (id: number | undefined, saved: WidgetStates | undefined) => void } = {
      saved: (key) => states.get(key),
      all: () => Object.fromEntries(states),
      save: (key, change) => {
        const now = states.get(key) ?? { values: {}, ticked: [] };
        const next = {
          values: change.values ?? now.values,
          ticked: change.ticked ? [...new Set([...now.ticked, ...change.ticked])] : now.ticked,
        };
        if (sameValues(next.values, now.values) && next.ticked.length === now.ticked.length && states.has(key)) return;
        states.set(key, next);
        pending.add(key);
        clearTimeout(timer);
        timer = setTimeout(flush, SAVE_AFTER_MS);
      },
      push: (key, values) => {
        if (states.has(key) && sameValues(values, states.get(key)!.values)) return;
        api.save(key, { values });
        revisions.set(key, (revisions.get(key) ?? 0) + 1);
        for (const listener of listeners) listener();
      },
      revision: (key) => revisions.get(key) ?? 0,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => void listeners.delete(listener);
      },
      flush,
      showSession: (id, saved) => {
        if (id === session) return;
        // The first turn made the Session: what waited is saved to it. Another Session: start from its own state.
        if (session !== undefined) {
          flush();
          states.clear();
          for (const [key, state] of Object.entries(saved ?? {})) states.set(key, state);
        }
        session = id;
        flush();
      },
    };
    storeByAll.set(api.all, api);
    return api;
  });
  useEffect(() => store.showSession(sessionId, initial), [store, sessionId, initial]);
  useEffect(() => {
    const leave = () => store.flush();
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [store]);
  return store;
}

/** Holds the shown Session's Widget state (useWidgetStates) for the Widgets beneath it. */
export function WidgetStatesProvider({ store, children }: { store: WidgetStore; children: ReactNode }) {
  return <WidgetStatesContext.Provider value={store}>{children}</WidgetStatesContext.Provider>;
}
