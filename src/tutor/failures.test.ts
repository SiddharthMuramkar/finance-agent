import { APIConnectionError, APIConnectionTimeoutError, APIError } from "openai";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { OWNER_LEARNER_ID, turns } from "@/db/schema";
import { presentValueOnly } from "@/test/present-value-map";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { SOMETHING_WENT_WRONG } from "./failure-words";
import { describeFailure, failedTurnView, newFailureRef, providerDetails } from "./failures";
import { ResponseFailed } from "./openai-items";
import { runTutorTurn, type TurnEvent } from "./turn";

/**
 * A Learner never reads provider text (spec 2026-11-12, A3; ADR 0016). The spec's own test: no Learner-facing string
 * contains "400", "invalid_request_error" or "request_id", across SDK errors, the turn's stored error and a reload.
 */

const FORBIDDEN = ["400", "invalid_request_error", "request_id"];
const CATCH_ALL = /^Something went wrong on our side\. Everything so far is saved\. Press Retry\. Reference: [2-9A-HJKMNP-TV-Z]{6}$/;

/** An OpenAI API error as the SDK builds it from the HTTP answer: `{ error: { message, type, param, code } }` and the request id header. */
const apiError = (status: number, type: string, message: string, code: string | null = null, requestId = "req_7c1f0a9e2b4d") =>
  APIError.generate(status, { error: { message, type, param: null, code } }, message, new Headers({ "x-request-id": requestId }));

/**
 * The OpenAI counterpart of the 11 November lock-out (ADR 0016): replayed reasoning the API will not take. The Learner
 * once read the provider's words after "The turn failed: "; now they never do.
 */
const LOCK_OUT = apiError(400, "invalid_request_error", "The encrypted content for item rs_68f1a2b3c4d5 could not be verified.", "invalid_encrypted_content");

const BATTERY: [string, unknown][] = [
  ["the lock-out's 400", LOCK_OUT],
  ["a reasoning item with nothing after it", apiError(400, "invalid_request_error", "Item 'rs_68f1a2b3c4d5' of type 'reasoning' was provided without its required following item.")],
  ["a context too long", apiError(400, "invalid_request_error", "Your input exceeds the context window of this model. Please adjust your input and try again.", "context_length_exceeded")],
  ["a bad key", apiError(401, "invalid_request_error", "Incorrect API key provided: sk-proj-****. You can find your API key at https://platform.openai.com/account/api-keys.", "invalid_api_key")],
  ["no permission", apiError(403, "invalid_request_error", "You are not allowed to sample from this model", "model_not_allowed")],
  ["no such model", apiError(404, "invalid_request_error", "The model `gpt-old` does not exist or you do not have access to it.", "model_not_found")],
  ["a request too large", apiError(413, "invalid_request_error", "Request too large.")],
  ["out of credit", apiError(429, "insufficient_quota", "You exceeded your current quota, please check your plan and billing details.", "insufficient_quota")],
  ["a rate limit", apiError(429, "requests", "Rate limit reached for gpt-6.1-sol on tokens per min (TPM).", "rate_limit_exceeded")],
  ["an API error", apiError(500, "server_error", "The server had an error while processing your request. Sorry about that!", "server_error")],
  ["overloaded", apiError(503, "server_error", "The engine is currently overloaded, please try again later.", "server_is_overloaded")],
  ["a failed response", new ResponseFailed("invalid_prompt", "Invalid prompt: 400 invalid_request_error request_id req_9")],
  ["a dropped connection", new APIConnectionError({ message: "Connection error." })],
  ["a timeout", new APIConnectionTimeoutError()],
  ["a programmer's error", new Error('400 {"error":{"message":"x","type":"invalid_request_error","param":null,"code":null}} request_id req_1')],
  ["a thrown string", "invalid_request_error request_id req_2"],
];

const clean = (text: string | null | undefined) => FORBIDDEN.filter((word) => text?.includes(word));

describe("a Learner never reads provider text (A3)", () => {
  it.each(BATTERY)("%s reads in plain words", (_, error) => {
    const { kind, message } = describeFailure(error, newFailureRef());
    expect(clean(message)).toEqual([]);
    // Only a missing or bad key and OpenAI's safety stop have words of their own among the "error" kind (failures.ts).
    if (kind === "error" && !/OPENAI_API_KEY|another way/.test(message)) expect(message).toMatch(CATCH_ALL);
  });

  it("keeps the provider's words, request id and status for the Owner", () => {
    expect(providerDetails(LOCK_OUT)).toEqual({ message: "The encrypted content for item rs_68f1a2b3c4d5 could not be verified.", requestId: "req_7c1f0a9e2b4d", status: 400 });
    expect(providerDetails(new ResponseFailed("server_error", "The server had an error."))).toEqual({ message: "server_error: The server had an error.", requestId: null, status: null });
    expect(providerDetails(new Error("boom"))).toEqual({ message: "boom", requestId: null, status: null });
  });

  it("gives a short reference that never reads as a status code", () => {
    const refs = Array.from({ length: 500 }, newFailureRef);
    for (const ref of refs) expect(ref).toMatch(/^[2-9A-HJKMNP-TV-Z]{6}$/);
    expect(new Set(refs).size).toBeGreaterThan(490);
  });

  it("every failed turn shows and stores plain words, with its reference and the provider's words kept apart", async () => {
    const db = await testDb();
    const map = presentValueOnly({ withoutInsight: true });
    for (const [, error] of BATTERY) {
      // Twice: a replay refusal gets one heal (A2) before the turn fails.
      const { client } = scriptedClient([{ error: error as Error }, { error: error as Error }]);
      const events: TurnEvent[] = [];
      for await (const e of runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Why discount?")) events.push(e);
      const shown = events.at(-1) as Extract<TurnEvent, { type: "error" }>;
      expect(shown.type).toBe("error");
      expect(clean(shown.message)).toEqual([]);
      expect(shown).not.toHaveProperty("provider");
      const [turn] = await db.select().from(turns).orderBy(sql`${turns.id} desc`).limit(1);
      expect(turn).toMatchObject({ status: "failed", error: shown.message, failureRef: expect.stringMatching(/^[2-9A-HJKMNP-TV-Z]{6}$/) });
      expect(turn.providerError).toBe(providerDetails(error).message);
      // What a reload shows the Learner.
      expect(clean(failedTurnView(turn, false).error)).toEqual([]);
    }
  });

  it("a reload of a turn an older build failed shows the catch-all, not the provider's words it stored", () => {
    const old = { error: `The turn failed: ${LOCK_OUT.message}. Everything so far is saved. Press Retry.`, failureRef: null, providerError: null, providerRequestId: null, providerStatus: null };
    expect(failedTurnView(old, false)).toEqual({ error: SOMETHING_WENT_WRONG });
    expect(failedTurnView({ ...old, failureRef: "T7K2Q9" }, false)).toEqual({ error: `${SOMETHING_WENT_WRONG} Reference: T7K2Q9` });
    // Words of our own are shown as stored.
    const credits = describeFailure(apiError(429, "insufficient_quota", "quota", "insufficient_quota")).message;
    expect(failedTurnView({ ...old, error: credits }, false)).toEqual({ error: credits });
  });

  it("a reload shows the provider's words only with Show developer details on", () => {
    const failed = { error: `${SOMETHING_WENT_WRONG} Reference: T7K2Q9`, failureRef: "T7K2Q9", providerError: "The encrypted content for item rs_68f1a2b3c4d5 could not be verified.", providerRequestId: "req_1", providerStatus: 400 };
    expect(failedTurnView(failed, false)).toEqual({ error: failed.error });
    expect(failedTurnView(failed, true)).toEqual({ error: failed.error, provider: { message: failed.providerError, requestId: "req_1", status: 400 } });
  });
});
