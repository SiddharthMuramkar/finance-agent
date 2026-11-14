/**
 * The words a Learner reads when a turn fails with no wording of its own (spec 2026-11-12, A3; ADR 0016). No imports,
 * so the browser bundle can use them too: a Learner never reads provider or programmer text, from the server or the page.
 */

/** The catch-all failure, as the Learner reads it. */
export const SOMETHING_WENT_WRONG = "Something went wrong on our side. Everything so far is saved. Press Retry.";

/** The catch-all with the short reference the Owner searches for (stored on the failed turn as `failure_ref`). */
export const somethingWentWrong = (ref: string) => `${SOMETHING_WENT_WRONG} Reference: ${ref}`;

/** What the provider said about a failure, for the Owner only: stored with the failed turn, shown under "Under the hood". */
export type ProviderDetails = { message: string; requestId: string | null; status: number | null };

/** The fixed start of the catch-all an older build stored with the provider's words after it (before A3). */
const OLD_CATCH_ALL = "The turn failed:";

/**
 * A failed turn's stored words as the Learner reads them on a reload: what was stored, unless an older build stored the
 * provider's words, which then read as the catch-all (with the turn's reference when it has one).
 */
export function learnerFailureText(error: string | null, ref: string | null): string | null {
  if (error === null || !error.startsWith(OLD_CATCH_ALL)) return error;
  return ref ? somethingWentWrong(ref) : SOMETHING_WENT_WRONG;
}
