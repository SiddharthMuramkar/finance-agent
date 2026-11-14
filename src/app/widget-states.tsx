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
  /**
   * The Learner's own slider values that a push (a preset) replaced, while they differ from what the Widget holds now:
   * what the "Your last settings" chip puts back (spec 2026-11-12 G5). Undefined when there is nothing to offer.
   */
  lastSettings: (key: string) => Record<string, number> | undefined;
  /** Puts the Learner's last settings back (a push that remembers nothing), and the chip goes. */
  restore: (key: string) => void;
};

const WidgetStatesContext = createContext<WidgetStore | null>(null);

/** The page's Widget state, or null outside the Study Workspace (the Notebook, Older sessions, Home), where nothing is saved. */
export const useWidgetStore = () => useContext(WidgetStatesContext);

/** How long after the last change the Widget's state is posted: a slider drag makes one save, not dozens. */
const SAVE_AFTER_MS = 400;

type Values = Record<string, number>;

export const sameValues = (a: Values, b: Values) => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => b[k] === a[k]);
};

/**
 * The Learner's play to remember when a push replaces a Widget's values `now` (spec 2026-11-12 G5). Values the last
 * push set are not the Learner's play, so a second preset keeps what was remembered before it (`kept`); so does a
 * Widget with no values yet. Otherwise `now` is the Learner's play.
 */
export function playToKeep(now: Values | undefined, lastPushed: Values | undefined, kept: Values | undefined): Values | undefined {
  if (!now || !Object.keys(now).length) return kept;
  if (lastPushed && sameValues(now, lastPushed)) return kept;
  return now;
}

/** What "Your last settings" offers: the remembered play while it differs from what the Widget holds now, else nothing. */
export function lastSettingsOffer(kept: Values | undefined, now: Values | undefined): Values | undefined {
  return kept && !(now && sameValues(kept, now)) ? kept : undefined;
}

/**
 * Whether a Widget that arrives with a preset (a step's reply named the numbers) must be moved to it as it opens: when
 * the Learner's saved play differs from the preset, or, with nothing saved, when the Widget would otherwise open at
 * its declared settings and those differ from the preset. A Widget with no preset opens as it was left.
 */
export function opensAtPreset(saved: Values | undefined, preset: Values | undefined, declared: Values): boolean {
  if (!preset || !Object.keys(preset).length) return false;
  return !sameValues(saved && Object.keys(saved).length ? saved : declared, preset);
}

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
    // G5: the Learner's play a push replaced (by key), and the values each key's last push set.
    const play = new Map<string, Values>();
    const pushed = new Map<string, Values>();
    const move = (key: string, values: Values) => {
      api.save(key, { values });
      revisions.set(key, (revisions.get(key) ?? 0) + 1);
      for (const listener of listeners) listener();
    };
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
        // A slider move can bring the remembered play back by hand: "Your last settings" reads it again (G5).
        if (play.has(key)) for (const listener of listeners) listener();
        pending.add(key);
        clearTimeout(timer);
        timer = setTimeout(flush, SAVE_AFTER_MS);
      },
      push: (key, values) => {
        if (states.has(key) && sameValues(values, states.get(key)!.values)) return;
        const kept = playToKeep(states.get(key)?.values, pushed.get(key), play.get(key));
        if (kept) play.set(key, kept);
        pushed.set(key, values);
        move(key, values);
      },
      lastSettings: (key) => lastSettingsOffer(play.get(key), states.get(key)?.values),
      restore: (key) => {
        const kept = play.get(key);
        if (!kept) return;
        play.delete(key);
        pushed.delete(key);
        move(key, kept);
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
          play.clear();
          pushed.clear();
          for (const [key, state] of Object.entries(saved ?? {})) states.set(key, state);
        }
        session = id;
        flush();
      },
    };
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
