import { APIConnectionError, APIError } from "@anthropic-ai/sdk";

export type FailureKind = "credits" | "rate_limit" | "overloaded" | "connection" | "error";

const SAVED = "Everything so far is saved.";

/**
 * What the Learner is told when a turn fails, by the kind of failure. Exhausted credits
 * come back as a 402 billing error, or a 400 when a spend limit is reached (the 400 is
 * told apart only by its message). See https://platform.claude.com/docs/en/api/errors.
 */
export function describeFailure(error: unknown): { kind: FailureKind; message: string } {
  if (error instanceof APIConnectionError) {
    return { kind: "connection", message: `Could not reach the Claude API. ${SAVED} Press Retry.` };
  }
  if (error instanceof APIError) {
    const status = error.status ?? 0;
    if (status === 402 || (status === 400 && /credit balance|spend limit|billing/i.test(error.message))) {
      return {
        kind: "credits",
        message: `The Claude API credits have run out or a spend limit was reached. ${SAVED} Add credits in the Claude Console, then press Retry.`,
      };
    }
    if (status === 429) return { kind: "rate_limit", message: `The Claude API is limiting requests right now. ${SAVED} Wait a minute, then press Retry.` };
    if (status >= 500) return { kind: "overloaded", message: `Claude's servers are busy or had an error. ${SAVED} Press Retry.` };
  }
  const reason = error instanceof Error ? error.message : String(error);
  return { kind: "error", message: `The turn failed: ${reason}. ${SAVED} Press Retry.` };
}
