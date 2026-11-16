import { StepAborted, type ModelClient, type RunnableTool, type StepRequest, type StepResult, type StepStream, type ToolResultBlock, type ToolUseBlock } from "./model";

/**
 * The Tool Runner: the Tutor's loop of model steps. Each step goes to the model client; a step that stops for
 * tool calls has them run here, one after another in call order, and the runner loops with the call and its results
 * appended to its own history (`params.messages`). Any other stop (end of turn, length limit, refusal) ends the loop.
 *
 * The Tutor Turn (turn.ts) relies on exactly this:
 * - `params.messages` is the runner's own array, changed in place: each tool step appends the step's assistant
 *   message and then one user message with its tool results; nothing is appended after any other stop.
 * - A thrown tool error becomes an `is_error` tool result whose text is "Error: <message>"; the model reads it.
 * - An aborted signal (the Learner pressed Stop) ends the open step and starts no new one; a tool already running
 *   finishes, and its results are still appended before the loop throws.
 * - `return()` aborts the step still streaming, so nothing hangs on the request. A step the loop is still waiting on
 *   (a tool running) finishes first; the caller aborts the signal on a cut-off, so no request is left open.
 * - The step limit (decision #13): with `stepsLeft`, the runner asks the turn's Step ledger before each step, since
 *   steps may be saved outside the loop (a fold, a tool). The last step left is sent with tool choice "none", so it writes
 *   the reply; with none left, no request is sent, the loop ends and `stepLimitReached` is true.
 * Compaction is not the runner's: the Tutor Turn folds the Session once its reply has passed the checks (turn.ts).
 */

export type RunnerParams = Omit<StepRequest, "tools"> & { tools: RunnableTool[] };

export type ToolRunner = AsyncIterable<StepStream> & { params: RunnerParams; stepLimitReached: boolean };

export type RunnerOptions = {
  signal?: AbortSignal;
  /** How many more steps the turn may take (its Step ledger), asked before each step. Left out, there is no limit. */
  stepsLeft?: () => Promise<number>;
};

export function runTools(client: ModelClient, params: RunnerParams, options?: RunnerOptions): ToolRunner {
  const outer = options?.signal;
  const runner: ToolRunner = {
    params,
    stepLimitReached: false,
    async *[Symbol.asyncIterator]() {
      const model = client.forRun?.() ?? client;
      // The runner's own signal: aborted with the caller's, and when the loop is closed early (a cut-off).
      const own = new AbortController();
      const onAbort = () => own.abort();
      if (outer?.aborted) own.abort();
      else outer?.addEventListener("abort", onAbort, { once: true });
      const checkAbort = () => {
        if (own.signal.aborted) throw new StepAborted();
      };
      try {
        for (;;) {
          // An aborted runner sends no new request.
          checkAbort();
          const left = options?.stepsLeft ? await options.stepsLeft() : Infinity;
          if (left <= 0) {
            runner.stepLimitReached = true;
            return;
          }
          const stream = once(model.step(stepRequest(params, left === 1), { signal: own.signal }));
          yield stream;
          const final = await stream.final();
          if (final.stopReason !== "tool_use") return;
          const uses = final.content.filter((b): b is ToolUseBlock => b.type === "tool_use");
          const results: ToolResultBlock[] = [];
          for (const use of uses) results.push(await runTool(params.tools, use));
          params.messages.push({ role: "assistant", content: final.content });
          params.messages.push({ role: "user", content: results });
        }
      } finally {
        outer?.removeEventListener("abort", onAbort);
        own.abort();
      }
    },
  };
  return runner;
}

/** What one step sends: the runner's history as it stands, and the tools without their code; the last step may call none. */
function stepRequest(params: RunnerParams, last: boolean): StepRequest {
  return {
    model: params.model,
    effort: params.effort,
    instructions: params.instructions,
    tools: params.tools.map(({ type, name, description, parameters, strict }) => ({ type, name, description, parameters, strict })),
    messages: [...params.messages],
    maxOutputTokens: params.maxOutputTokens,
    ...(last && { toolChoice: "none" as const }),
  };
}

/** Runs one tool call; a throw, or a tool not in the list, becomes an error result the model reads. */
export async function runTool(tools: RunnableTool[], use: ToolUseBlock): Promise<ToolResultBlock> {
  try {
    const tool = tools.find((t) => t.name === use.name);
    if (!tool) throw new Error(`Unknown tool ${use.name}`);
    const content = await tool.run(tool.parse(use.input), { toolUse: use });
    return { type: "tool_result", tool_use_id: use.id, content };
  } catch (e) {
    return { type: "tool_result", tool_use_id: use.id, content: `Error: ${e instanceof Error ? e.message : String(e)}`, is_error: true };
  }
}

/** A stream whose `final()` is worked out once, however many callers ask. */
function once(stream: StepStream): StepStream {
  let final: Promise<StepResult> | undefined;
  return {
    [Symbol.asyncIterator]: () => stream[Symbol.asyncIterator](),
    final: () => (final ??= stream.final()),
  };
}
