import type { TurnEvent, TurnInput } from "@/tutor/turn";

/** What one whole Tutor turn used, summed over every part it took (a resumed turn has more than one). */
export type WholeTurn = {
  text: string;
  failed: string;
  resumes: number;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; costUsd: number; durationMs: number };
};

/**
 * Runs one Tutor turn to a whole reply, the way the browser does: a turn cut off at its time limit
 * is resumed with `{ resume: true }` (its saved text comes back as a replay), and a reply cut short
 * at max_tokens is finished with Finish this reply (`{ finish: true }`) and joined to the earlier part. After
 * `maxResumes` extra runs it stops and says the turn is still cut off. `run` is the real Tutor Turn
 * in the live runner and a script in tests.
 */
export async function takeWholeTurn(run: (input: TurnInput) => AsyncIterable<TurnEvent>, message: string, maxResumes = 3): Promise<WholeTurn> {
  const out: WholeTurn = { text: "", failed: "", resumes: 0, usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0, durationMs: 0 } };
  let input: TurnInput = message;
  let join: "same" | "paragraph" = "same";
  for (;;) {
    let part = "";
    let cutOff = false;
    let cutShort = false;
    let sawReplay = false;
    for await (const e of run(input)) {
      if (e.type === "text") part += e.text;
      else if (e.type === "replay") {
        part = e.text;
        sawReplay = true;
      } else if (e.type === "cut_off") cutOff = true;
      else if (e.type === "cut_short") cutShort = true;
      else if (e.type === "error") out.failed = e.message;
      else if (e.type === "refusal") out.failed = `refusal: ${e.message}`;
      else if (e.type === "busy") out.failed = e.message;
      else if (e.type === "done") {
        out.usage.inputTokens += e.usage.inputTokens;
        out.usage.outputTokens += e.usage.outputTokens;
        out.usage.cacheReadTokens += e.usage.cacheReadTokens;
        out.usage.cacheWriteTokens += e.usage.cacheWriteTokens;
        out.usage.costUsd += e.usage.costUsd ?? 0;
        out.usage.durationMs += e.usage.durationMs;
      }
    }
    // A replay carries the whole reply saved so far, so it replaces what earlier resumed parts gave.
    if (sawReplay) out.text = part;
    else out.text = out.text && join === "paragraph" ? `${out.text}\n\n${part}` : out.text + part;
    if (out.failed || !(cutOff || cutShort)) return out;
    if (out.resumes >= maxResumes) {
      out.failed = `The turn was still cut off after ${maxResumes} resumes.`;
      return out;
    }
    out.resumes++;
    input = cutOff ? { resume: true } : { finish: true };
    // A resumed time-limit part continues the same text; a finished max_tokens part starts a new paragraph.
    join = cutOff ? "same" : "paragraph";
  }
}
