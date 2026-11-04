"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { CaseData } from "@/case-data/case-data";
import { createCaseDataCache, type CaseDataCache } from "./case-data-cache";
import type { CaseLoad } from "./case-data-client";

const CaseDataContext = createContext<CaseDataCache | null>(null);

/**
 * Gives a page one shared Case Data cache (case-data-cache.ts). `revealed` lists the Cases whose reveal the Learner
 * has seen, read on the server; `turnRunning` is the Tutor turn's state, and the cache revalidates in the background each time a turn ends (stale while revalidating: what is held stays on screen).
 * `cases`, when given, is every Case the page may read, already read on the server (Home's signed-out Widget): the
 * cache answers from them alone and never calls the Case Data route, and a Case not among them reads as missing.
 */
export function CaseDataProvider({
  revealed = [],
  turnRunning = false,
  cases,
  children,
}: {
  revealed?: readonly string[];
  turnRunning?: boolean;
  cases?: readonly CaseData[];
  children: ReactNode;
}) {
  const [cache] = useState(() => createCaseDataCache(cases && (async (caseId) => cases.find((c) => c.caseId === caseId) ?? null), revealed));
  const shown = revealed.join(" ");
  useEffect(() => cache.setRevealed(shown ? shown.split(" ") : []), [cache, shown]);
  const wasRunning = useRef(turnRunning);
  useEffect(() => {
    if (wasRunning.current && !turnRunning) void cache.revalidate();
    wasRunning.current = turnRunning;
  }, [cache, turnRunning]);
  return <CaseDataContext.Provider value={cache}>{children}</CaseDataContext.Provider>;
}

/**
 * The page's Case loads. Outside a CaseDataProvider (a Widget drawn on its own), a cache of the component's own.
 * The function changes each time the cache is cleared, a reveal changes or revalidation finds new data, so effects that read through it run again.
 */
export function useCaseLoad(): CaseLoad {
  const shared = useContext(CaseDataContext);
  const [own] = useState(() => (shared ? null : createCaseDataCache()));
  const cache = (shared ?? own)!;
  const version = useSyncExternalStore(cache.subscribe, cache.version, cache.version);
  // `version` is in the list on purpose: a clear, a reveal or new data makes a fresh function, so readers fetch again.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo<CaseLoad>(() => (caseId) => cache.load(caseId), [cache, version]);
}
