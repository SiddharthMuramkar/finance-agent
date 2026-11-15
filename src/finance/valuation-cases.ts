import { valuationBlock, type ValuationBlock } from "./valuation-case.ts";
import { VALUATION_CASES } from "./valuation-cases.generated.ts";

// The Valuation Cases a Workbench Widget can be bound to (spec 2026-11-12, B3; ADR 0010): every `valuation:` block in
// course/topics, by Case id, as `npm run course:doc` copies them into valuation-cases.generated.ts. No file system and
// no database, so the browser (Home's Value levers, signed out), the server (what the Tutor is told) and the course check
// read the same figures. Each block is parsed once, on first use.
//
// Imports only relative modules (no "@/" paths), like valuation-case.ts, so plain Node can run it too.

const parsed = new Map<string, ValuationBlock | null>();

/** The Case's valuation block, parsed and with its defaults filled in; null when there is no such Case or its block does not parse. */
export function valuationCase(id: string): ValuationBlock | null {
  if (!Object.hasOwn(VALUATION_CASES, id)) return null;
  if (!parsed.has(id)) {
    const result = valuationBlock.safeParse(VALUATION_CASES[id]);
    parsed.set(id, result.success ? result.data : null);
  }
  return parsed.get(id) ?? null;
}

/** Every Case id that has a valuation block, sorted. */
export function valuationCaseIds(): string[] {
  return Object.keys(VALUATION_CASES).sort();
}
