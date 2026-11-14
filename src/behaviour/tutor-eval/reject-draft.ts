/**
 * A rejected draft on demand, for the live probe T20 (spec 2026-11-12, A1 and A2). The real model writes the turn; the
 * first step that ends it (its draft) is stored with one more text block, long enough to pass every word cap, so the
 * reply checks reject the draft (V1) and the real model writes the retry, as they do in the app when a draft runs long.
 *
 * The padded step is stored as code edited it: without its `replay` block, so it is sent back rebuilt from its readable
 * blocks (openai-items.ts), which the API always accepts (ADR 0015), and the model reads the long draft the correction
 * is about. Keeping the replay under edited text would be the very bug A1 forbids. The retry's request then holds the
 * draft and code's correction, and every later turn is built after a rejected draft, which is the case A1 is about.
 */
import type { Block, ModelClient, StepResult } from "@/tutor/model";

/** Plain words with no number, id, ask or currency, so the only check they break is the word cap. */
const LINE = "Here is the same idea once more, said slowly so it can sink in.";

/** 280 words: more than any reply's cap. */
export const PADDING = Array.from({ length: 20 }, () => LINE).join(" ");

/** The draft padded: one text block after the model's own blocks, and no replay block, since its text was edited. */
function padded(result: StepResult): StepResult {
  const content: Block[] = [...result.content.filter((b) => b.type !== "replay"), { type: "text", text: PADDING }];
  return { ...result, content };
}

/**
 * The model client of one turn whose first draft is rejected: the first step that ends the turn with text is padded;
 * every other step (tool calls, the retry, a compaction) comes back as the model wrote it.
 */
export function rejectingFirstDraft(inner: ModelClient): ModelClient {
  return wrap(inner, { done: false });
}

function wrap(inner: ModelClient, state: { done: boolean }): ModelClient {
  return {
    step(request, options) {
      const stream = inner.step(request, options);
      let final: Promise<StepResult> | undefined;
      return {
        [Symbol.asyncIterator]: () => stream[Symbol.asyncIterator](),
        final: () =>
          (final ??= stream.final().then((result) => {
            if (state.done || result.stopReason !== "end_turn" || !result.content.some((b) => b.type === "text" && b.text.trim())) return result;
            state.done = true;
            return padded(result);
          })),
      };
    },
    compact: (request, options) => inner.compact(request, options),
    ...(inner.forRun && { forRun: () => wrap(inner.forRun!(), state) }),
  };
}
