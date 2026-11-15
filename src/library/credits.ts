// What the Library's source owners ask a reuser to show (#26). The credit lines themselves live in
// scripts/library/sources.json, in each owner's form (checked in src/library/credits.test.ts); this
// module holds the notices shown beside them. Wording from the owners' pages, checked 2026-11-15:
// the New York Fed Terms of Use (newyorkfed.org/privacy/termsofuse, "Last Updated: 6/9/2023").
// Packages only, so the Library scripts can import it too.

/** The name Value It publishes under, where a notice asks for the publisher's name. */
const PUBLISHER = "Value It";

/**
 * Shown with every passage: it is cut from its source and cleaned for search. CC BY-NC-SA asks a
 * reuser to indicate changes, and the New York Fed to label modified content clearly.
 */
export const PASSAGE_CHANGED_NOTE = "An excerpt: cut from the original and cleaned for search, with no other change. Read the original at the link.";

/**
 * The New York Fed's notice for reference-rate data or information, its bracketed form filled in:
 * "The [NAME OF DATA or CONTENT] is subject to the Terms of Use posted at newyorkfed.org. The New
 * York Fed is not responsible for publication of the [DATA NAME] by [NAME OF PUBLISHER], does not
 * [sanction] or [endorse] any particular republication, and has no liability for your use."
 */
export function referenceRateNotice(name: string, dataName: string, verb: "is" | "are" = "is"): string {
  return `The ${name} ${verb} subject to the Terms of Use posted at newyorkfed.org. The New York Fed is not responsible for publication of the ${dataName} by ${PUBLISHER}, does not sanction or endorse any particular republication, and has no liability for your use.`;
}

export const SOFR_NOTICE = referenceRateNotice("Secured Overnight Financing Rate (SOFR)", "SOFR");
export const EFFR_NOTICE = referenceRateNotice("Effective Federal Funds Rate (EFFR)", "EFFR");

/**
 * The notice for SOFR and EFFR together, for any page or widget that shows or explains either rate. None does today beyond
 * the Library passages from those two pages (passageNotices): the Signal Rates widget is a worked example with no outside
 * figures (spec §6.5.2), so it carries none.
 */
export const NYFED_REFERENCE_RATE_NOTICE = referenceRateNotice(
  "Secured Overnight Financing Rate (SOFR) and Effective Federal Funds Rate (EFFR) information",
  "SOFR and EFFR information",
);

/** The Library source holding the New York Fed pages (scripts/library/sources.json). */
export const NYFED_SOURCE = "nyfed-explainers";

/** The New York Fed pages that are reference-rate information, by document ref (scripts/library/sources.py NYFED_PAGES, "/" as "-"). */
const REFERENCE_RATE_PAGES: Record<string, string> = {
  "markets-reference-rates-sofr": SOFR_NOTICE,
  "markets-reference-rates-effr": EFFR_NOTICE,
};

/** The notices a passage must carry beyond its credit line: the reference-rate notice on a passage from the NY Fed's SOFR or EFFR page. */
export function passageNotices(passage: { sourceId: string; ref: string }): string[] {
  if (passage.sourceId !== NYFED_SOURCE) return [];
  const notice = REFERENCE_RATE_PAGES[passage.ref.split("#")[0]];
  return notice ? [notice] : [];
}
