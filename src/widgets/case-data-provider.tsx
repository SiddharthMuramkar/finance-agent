"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createCaseDataCache, type CaseDataCache } from "./case-data-cache";
import type { CaseLoad } from "./case-data-client";

const CaseDataContext = createContext<CaseDataCache | null>(null);

/**
 * Gives a page one shared Case Data cache (case-data-cache.ts). `revealed` lists the Cases whose reveal the Learner
 * has seen, read on the server; `turnRunning` is the Tutor turn's state, and the cache is cleared each time a turn ends.
 */
export function CaseDataProvider({ revealed = [], turnRunning = false, children }: { revealed?: readonly string[]; turnRunning?: boolean; children: ReactNode }) {
  const [cache] = useState(() => createCaseDataCache(undefined, revealed));
  const shown = revealed.join(" ");
  useEffect(() => cache.setRevealed(shown ? shown.split(" ") : []), [cache, shown]);
  const wasRunning = useRef(turnRunning);
  useEffect(() => {
    if (wasRunning.current && !turnRunning) cache.clear();
    wasRunning.current = turnRunning;
  }, [cache, turnRunning]);
  return <CaseDataContext.Provider value={cache}>{children}</CaseDataContext.Provider>;
}

/**
 * The page's Case loads. Outside a CaseDataProvider (a Widget drawn on its own), a cache of the component's own.
 * The function changes each time the cache is cleared or a reveal changes, so effects that read through it run again.
 */
export function useCaseLoad(): CaseLoad {
  const shared = useContext(CaseDataContext);
  const [own] = useState(() => (shared ? null : createCaseDataCache()));
  const cache = (shared ?? own)!;
  const version = useSyncExternalStore(cache.subscribe, cache.version, cache.version);
  // `version` is in the list on purpose: a clear or a reveal makes a fresh function, so readers fetch again.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo<CaseLoad>(() => (caseId) => cache.load(caseId), [cache, version]);
}
