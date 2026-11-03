import type { CaseData } from "@/case-data/case-data";
import { fetchCaseData, type CaseLoad } from "./case-data-client";

/**
 * One page's Case Data, shared by every chart, Formula Card, Widget tool and Sourced strip on it, so each Case is
 * fetched once per page however many read it.
 * - Keyed by Case and reveal state: the page says which Cases are revealed (`setRevealed`), and a Case read before its
 *   reveal is fetched afresh after it, so data dated after the as-of date is never served before the reveal.
 * - Cleared after every Tutor turn (`clear`), since a turn can open a reveal.
 * - A failed load is forgotten, so a later read tries again. `load` never rejects.
 * `version` counts clears and reveal changes; `subscribe` hears each, so a Widget already drawn reads again.
 */
export type CaseDataCache = {
  load: CaseLoad;
  clear: () => void;
  setRevealed: (caseIds: readonly string[]) => void;
  subscribe: (listener: () => void) => () => void;
  version: () => number;
};

export function createCaseDataCache(fetchCase: CaseLoad = (caseId) => fetchCaseData(caseId), revealed: readonly string[] = []): CaseDataCache {
  const entries = new Map<string, Promise<CaseData | null>>();
  const listeners = new Set<() => void>();
  let shown = new Set(revealed);
  let version = 0;
  const changed = () => {
    version++;
    for (const listener of listeners) listener();
  };
  const keyOf = (caseId: string) => `${caseId}|${shown.has(caseId) ? "revealed" : "withheld"}`;

  return {
    load(caseId) {
      const key = keyOf(caseId);
      const loaded = entries.get(key);
      if (loaded) return loaded;
      const loading = new Promise<CaseData | null>((resolve) => resolve(fetchCase(caseId))).then(
        (data) => data ?? null,
        () => null,
      );
      entries.set(key, loading);
      void loading.then((data) => {
        if (!data && entries.get(key) === loading) entries.delete(key);
      });
      return loading;
    },
    clear() {
      entries.clear();
      changed();
    },
    setRevealed(caseIds) {
      const next = new Set(caseIds);
      if (next.size === shown.size && [...next].every((id) => shown.has(id))) return;
      shown = next;
      changed();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    version: () => version,
  };
}
