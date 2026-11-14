import type OpenAI from "openai";
import { composeMessageOf } from "@/tutor/compose";
import type { Effort } from "@/tutor/model";
import { TUTOR_MODEL } from "@/tutor/model";
import { costUsd } from "@/tutor/pricing";
import type { ApiUsage } from "@/tutor/usage";

/**
 * One plain Responses API call, for the paid harnesses' graders, judges and simulated Learners (never the Tutor Turn,
 * which goes through the model seam). Nothing is stored on OpenAI's side. The reply comes back in the app's words
 * (`end_turn`, `max_tokens`, `refusal`) with what it cost, so a harness never reads OpenAI's response shape itself.
 */
export type Asked = { text: string; stopReason: string; usage: ApiUsage | undefined; costUsd: number };

/** The slice of the OpenAI client this uses, so a test can pass a fake. */
export type Asker = Pick<OpenAI, "responses">;

/** The tokens of one reply as the price table counts them: input leaves out the cached and cache-written tokens. */
export function tokenCounts(usage: ApiUsage | undefined) {
  const cacheReadTokens = usage?.input_tokens_details?.cached_tokens ?? 0;
  const cacheWriteTokens = usage?.input_tokens_details?.cache_write_tokens ?? 0;
  return { inputTokens: Math.max(0, (usage?.input_tokens ?? 0) - cacheReadTokens - cacheWriteTokens), outputTokens: usage?.output_tokens ?? 0, cacheReadTokens, cacheWriteTokens };
}

/** What a reply cost, in dollars; 0 when the model has no price (the harnesses check `requirePrice` first). */
export const replyCost = (model: string, usage: ApiUsage | undefined): number => costUsd(model, tokenCounts(usage)) ?? 0;

export async function askModel(
  client: Asker,
  o: { system?: string; input: string; maxOutputTokens: number; model?: string; effort?: Effort },
): Promise<Asked> {
  const model = o.model ?? TUTOR_MODEL;
  // A reasoning model spends part of max_output_tokens thinking, so callers give it room beyond the reply they expect.
  const response = await client.responses.create({
    model,
    ...(o.system ? { instructions: o.system } : {}),
    input: o.input,
    reasoning: { effort: o.effort ?? "medium" },
    max_output_tokens: o.maxOutputTokens,
    store: false,
  });
  const message = composeMessageOf(response);
  return { text: message.content.map((b) => b.text ?? "").join(""), stopReason: message.stop_reason ?? "end_turn", usage: response.usage, costUsd: replyCost(model, response.usage) };
}
