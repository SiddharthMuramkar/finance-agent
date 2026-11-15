import { randomInt } from "node:crypto";
import { APIConnectionError, APIError, OpenAIError } from "openai";
import { ResponseFailed } from "./openai-items";
import type { Turn } from "./turn-status";
import { learnerFailureText, somethingWentWrong, type ProviderDetails } from "./failure-words";

export type { ProviderDetails };

export type FailureKind = "credits" | "rate_limit" | "overloaded" | "connection" | "error";

const SAVED = "Everything so far is saved.";

/**
 * Codes that waiting will not fix: the account is out of prepaid credit or reached a spend or usage limit. They come
 * back as a 429, like a rate limit. See https://developers.openai.com/api/docs/guides/error-codes and the spend
 * limits guide.
 */
const OUT_OF_CREDIT = new Set(["insufficient_quota", "credit_balance_exhausted", "organization_spend_limit_exceeded", "project_spend_limit_exceeded", "organization_usage_limit_exceeded"]);

/** OpenAI's safety monitoring stopped the request; asked again the same way it is stopped again, so it is not retried. */
const MISALIGNMENT = "misalignment_policy_violation";

/**
 * What the Learner is told when a turn fails, by the kind of failure. Running out of credit is told apart from a rate
 * limit only by its code (or a billing error's `insufficient_quota` type), so it is checked first. A missing
 * `OPENAI_API_KEY` fails when the client is made, with the SDK's own error rather than an API one. A request OpenAI's
 * safety monitoring stopped is never retried as it was: the Learner is asked to put it another way. An error after the
 * response started streaming has an error code but no HTTP status, and is read by its code.
 * See https://developers.openai.com/api/docs/guides/error-codes.
 * No case echoes what the provider said (A3, ADR 0007): anything else reads "Something went wrong on our side", with
 * the failed turn's reference (`newFailureRef`), and the provider's words go to `providerDetails`, for the Owner.
 */
export function describeFailure(error: unknown, ref: string = newFailureRef()): { kind: FailureKind; message: string } {
  if (error instanceof APIConnectionError) {
    return { kind: "connection", message: `Could not reach the OpenAI API. ${SAVED} Press Retry.` };
  }
  const code = error instanceof APIError || error instanceof ResponseFailed ? error.code : null;
  const status = error instanceof APIError ? (error.status ?? 0) : 0;
  if (code === MISALIGNMENT) {
    return { kind: "error", message: `OpenAI's safety checks stopped this turn. ${SAVED} Try asking another way.` };
  }
  if ((code && OUT_OF_CREDIT.has(code)) || (error instanceof APIError && error.type === "insufficient_quota")) {
    return {
      kind: "credits",
      message: `The OpenAI API has run out of credit or reached its spend limit. ${SAVED} Add credit at platform.openai.com → Billing (or raise the limit), then press Retry.`,
    };
  }
  if (status === 429 || code === "rate_limit_exceeded") {
    return { kind: "rate_limit", message: `The OpenAI API is limiting requests right now. ${SAVED} Wait a minute, then press Retry.` };
  }
  if (status === 401 || (error instanceof OpenAIError && !(error instanceof APIError) && /OPENAI_API_KEY|missing credentials/i.test(error.message))) {
    return { kind: "error", message: `The OpenAI API key is missing or not valid. ${SAVED} Set OPENAI_API_KEY to a valid key, then press Retry.` };
  }
  if (status >= 500 || code === "server_error") {
    return { kind: "overloaded", message: `OpenAI's servers are busy or had an error. ${SAVED} Press Retry.` };
  }
  return { kind: "error", message: somethingWentWrong(ref) };
}

/**
 * Crockford's base32 letters (no I, L, O or U) and the digits 2 to 9: a reference read off a screenshot is never misread,
 * and with no 0 it never reads as a status code such as "400" (A3).
 */
const REF_CHARACTERS = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

/** A failed turn's short reference (A3), such as "T7K2Q9": stored as `turns.failure_ref` and shown to the Learner. */
export function newFailureRef(): string {
  return Array.from({ length: 6 }, () => REF_CHARACTERS[randomInt(REF_CHARACTERS.length)]).join("");
}

/**
 * Whether the API refused the request with an HTTP error (a bad request, a rate limit, a server error) before any model
 * ran: OpenAI bills nothing for it. An error after the response started streaming has no HTTP status, and neither has a
 * dropped connection, so either may have been billed.
 */
export function refusedBeforeRunning(error: unknown): boolean {
  return error instanceof APIError && typeof error.status === "number";
}

/**
 * The provider's own words, request id and HTTP status for a failed API call (OpenAI's message is the one inside its
 * error body; a failed response has a code and no status); for any other error, its message (a programmer's words,
 * which the Learner never reads either).
 */
export function providerDetails(error: unknown): ProviderDetails {
  if (error instanceof APIError) {
    const inner = (error.error as { message?: unknown } | undefined)?.message;
    return { message: typeof inner === "string" ? inner : error.message, requestId: error.requestID ?? null, status: error.status ?? null };
  }
  if (error instanceof ResponseFailed) return { message: error.code ? `${error.code}: ${error.message}` : error.message, requestId: null, status: null };
  return { message: error instanceof Error ? error.message : String(error), requestId: null, status: null };
}

/**
 * What the Study Workspace shows of the Learner's unfinished latest turn when it opens (a reload): the Learner's words
 * for a failure (`learnerFailureText`), and the provider's only for a Learner with Show developer details on (A3).
 */
export function failedTurnView(turn: Pick<Turn, "error" | "failureRef" | "providerError" | "providerRequestId" | "providerStatus">, developerDetails: boolean): { error: string | null; provider?: ProviderDetails } {
  const error = learnerFailureText(turn.error, turn.failureRef);
  if (!developerDetails || turn.providerError === null) return { error };
  return { error, provider: { message: turn.providerError, requestId: turn.providerRequestId, status: turn.providerStatus } };
}
