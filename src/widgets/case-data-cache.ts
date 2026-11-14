import type { CaseData } from "@/case-data/case-data";
import { REFERENCE_CASE } from "@/case-data/reference";
import { fetchCaseData, type CaseLoad } from "./case-data-client";

/**
 * One page's Case Data, shared by every chart, Formula Card, Widget tool and Sourced strip on it, so each Case is
 * fetched once per page however many read it.
 * - Keyed by Case and reveal state: the page says which Cases are revealed (`setRevealed`), and a Case read before its
 *   reveal is fetched afresh after it, so data dated after the as-of date is never served before the reveal.
 * - Stale while revalidating: after a Tutor turn the page calls `revalidate`, which keeps every entry on screen, asks the
 *   server again in the background and replaces an entry only if its payload changed (then readers hear it). A Widget
 *   already drawn never flashes "Fetching sourced data…" for a turn that changed nothing. `clear` drops everything.
 * - A failed load is forgotten, so a later read tries again. `load` never rejects.
 * - The reference Case is clipped by the Learner's other started Topics, so it is also keyed by that clip date
 *   (`setReferenceClip`): when the clip changes the held reference entry is dropped and fetched afresh.
 * `version` counts clears, reveal changes and changed revalidations; `subscribe` hears each, so a Widget already drawn reads again.
 */
export type CaseDataCache = {
  load: CaseLoad;
  clear: () => void;
  /** Asks the server again for every Case held for the current reveal state; replaces one only if its data changed. */
  revalidate: () => Promise<void>;
  setRevealed: (caseIds: readonly string[]) => void;
  /** The date the reference Case is clipped to (null: not clipped). A change drops the held reference entry, so it is fetched afresh. */
  setReferenceClip: (clip: string | null) => void;
  subscribe: (listener: () => void) => () => void;
  version: () => number;
};

export function createCaseDataCache(fetchCase: CaseLoad = (caseId) => fetchCaseData(caseId), revealed: readonly string[] = []): CaseDataCache {
  const entries = new Map<string, Promise<CaseData | null>>();
  const listeners = new Set<() => void>();
  let shown = new Set(revealed);
  let version = 0;
  let referenceClip: string | null = null;
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
    async revalidate() {
      const stale = [...entries].filter(([key]) => key === keyOf(key.slice(0, key.lastIndexOf("|"))));
      await Promise.all(
        stale.map(async ([key, held]) => {
          const caseId = key.slice(0, key.lastIndexOf("|"));
          const [before, now] = await Promise.all([held, new Promise<CaseData | null>((resolve) => resolve(fetchCase(caseId))).then((d) => d ?? null, () => null)]);
          // A failed read keeps what is held; so does a read that finished after the entry was replaced or cleared.
          if (!now || entries.get(key) !== held || JSON.stringify(before) === JSON.stringify(now)) return;
          entries.set(key, Promise.resolve(now));
          changed();
        }),
      );
    },
    setRevealed(caseIds) {
      const next = new Set(caseIds);
      if (next.size === shown.size && [...next].every((id) => shown.has(id))) return;
      shown = next;
      changed();
    },
    setReferenceClip(clip) {
      if (clip === referenceClip) return;
      referenceClip = clip;
      for (const key of [...entries.keys()]) if (key.startsWith(`${REFERENCE_CASE}|`)) entries.delete(key);
      changed();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    version: () => version,
  };
}
