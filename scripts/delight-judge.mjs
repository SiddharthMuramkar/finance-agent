// The Delight eval's four judges (spec Appendix D.2, ticket E4b): Beginner persona, Math police, Widget fit and
// Historian, each on gpt-6.1-sol, one call per judge per prompt, JSON out. Used by scripts/widget-eval.mjs --set delight --judge.
// The caller loads tsx first (this file imports TypeScript) and passes the client, so tests and dry runs can
// give a fake one. Spend is counted against DELIGHT_BUDGET_USD (default 13 a round), in the same Spend that already holds
// the round's Tutor turns; once the next call would pass the cap, no more start and the missing judgements are reported
// as missing, never as passes.
import { readFileSync } from "node:fs";
import { JUDGES, JUDGE_MODEL, JUDGE_SYSTEM, judgeInput, parseJudge } from "../src/behaviour/delight/judges.ts";

// The model thinks before it answers and max_output_tokens counts the thinking too, so this leaves room for both.
const MAX_OUTPUT_TOKENS = 8000;

/** A real OpenAI client (reads OPENAI_API_KEY from the environment, which only the paid G2 round sets). */
export async function realClient() {
  const { default: OpenAI } = await import("openai");
  return new OpenAI();
}

function content(judge, evidence, screenshot) {
  const parts = [];
  if (screenshot) parts.push({ type: "input_image", image_url: `data:image/png;base64,${readFileSync(screenshot).toString("base64")}` });
  parts.push({ type: "input_text", text: judgeInput(judge, evidence) });
  return parts;
}

/**
 * Runs the four judges for one prompt. Returns { judgements, errors, skipped }: a judgement per judge that answered
 * valid JSON (re-asked once when it did not), an error line per judge that failed twice, and the judges not started
 * because the cap was reached. An API error on one call (429, overloaded, network) never throws out of here: that call
 * is tried once more after `retryDelayMs`, then reported in `errors`, and the judgements already made are kept. Each call is estimated at the judges' own average so far (spend.nextJudgeCall), so the
 * Tutor's spend in the same total never makes a judge call look dearer than it is.
 */
export async function judgePrompt({ client, spend, evidence, screenshot, retryDelayMs = 5000 }) {
  const judgements = {};
  const errors = [];
  const skipped = [];
  for (const judge of JUDGES) {
    const messages = [{ role: "user", content: content(judge, evidence, screenshot) }];
    let done = false;
    for (let attempt = 0; attempt < 2 && !done; attempt++) {
      if (!spend.allows(spend.nextJudgeCall())) {
        skipped.push(judge);
        done = true;
        break;
      }
      let res;
      try {
        res = await client.responses.create({ model: JUDGE_MODEL, instructions: JUDGE_SYSTEM[judge], input: messages, reasoning: { effort: "medium" }, max_output_tokens: MAX_OUTPUT_TOKENS, store: false });
      } catch (e) {
        // A 429, an overload or a dropped connection is a missed call, not the end of the prompt: ask the same request
        // once more after a pause, and if that fails too, report this judge as missing and go on to the next.
        if (attempt === 1) errors.push(`${judge}: API error: ${String(e?.message ?? e).split("\n")[0]}`);
        else if (retryDelayMs > 0) await new Promise((r) => setTimeout(r, retryDelayMs));
        continue;
      }
      // OpenAI's input count includes the cached and cache-written tokens, which the price table counts apart.
      const cacheReadTokens = res.usage?.input_tokens_details?.cached_tokens ?? 0;
      const cacheWriteTokens = res.usage?.input_tokens_details?.cache_write_tokens ?? 0;
      spend.chargeJudge(JUDGE_MODEL, {
        inputTokens: Math.max(0, (res.usage?.input_tokens ?? 0) - cacheReadTokens - cacheWriteTokens),
        outputTokens: res.usage?.output_tokens ?? 0,
        cacheReadTokens,
        cacheWriteTokens,
      });
      const text = res.output_text ?? "";
      try {
        judgements[judge] = parseJudge(judge, text);
        done = true;
      } catch (e) {
        if (attempt === 1) errors.push(`${judge}: ${e.message}`);
        else messages.push({ role: "assistant", content: text || "(empty)" }, { role: "user", content: "That was not valid. Return only the JSON object, in the shape shown, with no other text." });
      }
    }
  }
  return { judgements, errors, skipped };
}
