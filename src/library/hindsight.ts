import { yearsIn } from "./ingest.ts";

// The hindsight judge: does a passage the as-of rule let through still give a Case's ending away?
// scripts/library-score.mjs runs it on the real Library and src/library/hindsight.test.ts on a
// PGlite one. Packages and .ts-suffixed relative imports only, so Node runs it with type stripping.

/** A search made as of a Case's date, with the words that would tell what happened after that date. */
export type HindsightProbe = {
  q: string;
  asOf: string;
  /** Words or phrases that give the ending away, matched as whole words, ignoring case. */
  outcome: string[];
  /** The Signal Case whose ending this probe guards (spec Appendix A), if it guards one. */
  case?: string;
};

/** What the judge reads from one search result. */
export type JudgedPassage = { kind: "dated" | "timeless"; publishedOn: string | null; text: string };

/** Why a passage could give the ending away. */
export type HindsightFlag = {
  /** Years the text mentions that are after the as-of year. */
  laterYears: number[];
  /** The probe's outcome words found in the text. */
  outcomeWords: string[];
  /** A dated passage published after the as-of date (the as-of rule should never let one through). */
  datedAfterAsOf: boolean;
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The outcome words a text contains. A word boundary is required only where the phrase starts or ends with a letter or digit, so "AWS" does not match "laws". */
export function outcomeWordsIn(text: string, outcome: string[]): string[] {
  return outcome.filter((o) => {
    const start = /^\w/.test(o) ? "\\b" : "";
    const end = /\w$/.test(o) ? "\\b" : "";
    return new RegExp(`${start}${escape(o)}${end}`, "i").test(text);
  });
}

/** The flag for a passage that could tell the probe's ending, or null when it tells nothing later than the as-of date. */
export function hindsightFlag(passage: JudgedPassage, probe: Pick<HindsightProbe, "asOf" | "outcome">): HindsightFlag | null {
  const year = Number(probe.asOf.slice(0, 4));
  const laterYears = [...new Set(yearsIn(passage.text))].filter((y) => y > year);
  const outcomeWords = outcomeWordsIn(passage.text, probe.outcome);
  const datedAfterAsOf = passage.kind === "dated" && (passage.publishedOn === null || passage.publishedOn > probe.asOf);
  return laterYears.length || outcomeWords.length || datedAfterAsOf ? { laterYears, outcomeWords, datedAfterAsOf } : null;
}
