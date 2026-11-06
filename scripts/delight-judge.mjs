// The Delight eval's four judges (spec Appendix D.2, ticket E4b): Beginner persona, Math police, Widget fit and
// Historian, each on Opus, one call per judge per prompt, JSON out. Used by scripts/widget-eval.mjs --set delight --judge.
// The caller loads tsx first (this file imports TypeScript) and passes the client, so tests and dry runs can
// give a fake one. Spend is counted against DELIGHT_BUDGET_USD (default 13 a round), in the same Spend that already holds
// the round's Tutor turns; once the next call would pass the cap, no more start and the missing judgements are reported
// as missing, never as passes.
import { readFileSync } from "node:fs";
import { JUDGES, JUDGE_MODEL, JUDGE_SYSTEM, judgeInput, parseJudge } from "../src/behaviour/delight/judges.ts";

const MAX_TOKENS = 1500;

/** A real Anthropic client (reads ANTHROPIC_API_KEY from the environment, which only the paid G2 round sets). */
export async function realClient() {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  return new Anthropic();
}

function content(judge, evidence, screenshot) {
  const blocks = [];
  if (screenshot) blocks.push({ type: "image", source: { type: "base64", media_type: "image/png", data: readFileSync(screenshot).toString("base64") } });
  blocks.push({ type: "text", text: judgeInput(judge, evidence) });
  return blocks;
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
        res = await client.messages.create({ model: JUDGE_MODEL, max_tokens: MAX_TOKENS, system: JUDGE_SYSTEM[judge], messages });
      } catch (e) {
        // A 429, an overload or a dropped connection is a missed call, not the end of the prompt: ask the same request
        // once more after a pause, and if that fails too, report this judge as missing and go on to the next.
        if (attempt === 1) errors.push(`${judge}: API error: ${String(e?.message ?? e).split("\n")[0]}`);
        else if (retryDelayMs > 0) await new Promise((r) => setTimeout(r, retryDelayMs));
        continue;
      }
      spend.chargeJudge(JUDGE_MODEL, {
        inputTokens: res.usage?.input_tokens ?? 0,
        outputTokens: res.usage?.output_tokens ?? 0,
        cacheReadTokens: res.usage?.cache_read_input_tokens ?? 0,
        cacheWriteTokens: res.usage?.cache_creation_input_tokens ?? 0,
      });
      const text = (res.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
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
