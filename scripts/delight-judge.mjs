// The Delight eval's four judges (spec Appendix D.2, ticket E4b): Beginner persona, Math police, Widget fit and
// Historian, each on Opus, one call per judge per prompt, JSON out. Used by scripts/widget-eval.mjs --set delight --judge.
// The caller loads tsx first (this file imports TypeScript) and passes the client, so tests and dry runs can
// give a fake one. Spend is counted against DELIGHT_BUDGET_USD (default 13 a round); once the next call would pass the
// cap, no more start and the missing judgements are reported as missing, never as passes.
import { readFileSync } from "node:fs";
import { JUDGES, JUDGE_MODEL, JUDGE_SYSTEM, judgeInput, parseJudge } from "../src/behaviour/delight/judges.ts";

const MAX_TOKENS = 1500;
/** What one judge call is expected to cost until a real one is known: a screenshot, the reply and the rubric on Opus. */
const FIRST_CALL_ESTIMATE_USD = 0.15;

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
 * because the cap was reached.
 */
export async function judgePrompt({ client, spend, evidence, screenshot, calls }) {
  const judgements = {};
  const errors = [];
  const skipped = [];
  for (const judge of JUDGES) {
    const messages = [{ role: "user", content: content(judge, evidence, screenshot) }];
    let done = false;
    for (let attempt = 0; attempt < 2 && !done; attempt++) {
      const estimate = calls.count ? spend.spent / calls.count : FIRST_CALL_ESTIMATE_USD;
      if (!spend.allows(estimate)) {
        skipped.push(judge);
        done = true;
        break;
      }
      const res = await client.messages.create({ model: JUDGE_MODEL, max_tokens: MAX_TOKENS, system: JUDGE_SYSTEM[judge], messages });
      calls.count += 1;
      spend.charge(JUDGE_MODEL, {
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
