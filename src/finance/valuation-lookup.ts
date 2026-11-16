import { valuationBlock, type ValuationBlock } from "./valuation-case.ts";
import { valuationCase } from "./valuation-cases.ts";

// The one lookup a Workbench draws its valuation from (spec #68; ADR 0010): the course's Valuation Cases first, then the
// Learner's Own Cases. Course Cases are in git (valuation-cases.ts), so the page, the server and the course check read the
// same figures; Own Cases are the Learner's, so whoever draws or reads the Widget hands them in (the page through
// OwnCasesContext, the server as an argument). Without them, only course Cases are found, as before.
//
// Imports only relative modules (no "@/" paths), like valuation-cases.ts, so plain Node can run it too.

/** The Learner's Own Cases, by id: a parsed valuation block, or null when the Learner has no such Own Case. */
export type OwnCases = (id: string) => ValuationBlock | null;

/** The valuation under this id: a course Case when there is one (a course Case always wins), else the Learner's Own Case, else null. */
export function findValuation(id: string, ownCases?: OwnCases | null): ValuationBlock | null {
  return valuationCase(id) ?? ownCases?.(id) ?? null;
}

/** Own Cases from stored `valuation:`-shaped blocks by id, each parsed once with its defaults filled in; a block that does not parse is not found. */
export function ownCaseLookup(blocks: Readonly<Record<string, unknown>>): OwnCases {
  const parsed = new Map<string, ValuationBlock | null>();
  return (id) => {
    if (!Object.hasOwn(blocks, id)) return null;
    if (!parsed.has(id)) {
      const result = valuationBlock.safeParse(blocks[id]);
      parsed.set(id, result.success ? result.data : null);
    }
    return parsed.get(id) ?? null;
  };
}
