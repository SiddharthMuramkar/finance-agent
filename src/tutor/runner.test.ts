import { describe, expect, it } from "vitest";
import { scriptedClient } from "@/test/scripted-client";
import { TUTOR_MODEL, type Message, type ModelClient, type RunnableTool, type StepResult, type StepStream } from "./model";
import { runTools, type RunnerParams } from "./runner";

/** A function tool whose code records each call and answers with `answer`. */
function tool(name: string, calls: string[], answer: (input: unknown) => string | Promise<string> = () => `${name} done`): RunnableTool {
  return {
    type: "function",
    name,
    description: name,
    parameters: { type: "object", properties: {} },
    strict: false,
    parse: (input) => input,
    run: async (input) => {
      calls.push(name);
      return answer(input);
    },
  };
}

function params(tools: RunnableTool[], messages: Message[] = [{ role: "user", content: "Hi" }]): RunnerParams {
  return { model: TUTOR_MODEL, effort: "medium", instructions: "Be brief.", tools, messages, maxOutputTokens: 16000 };
}

async function drain(runner: AsyncIterable<StepStream>) {
  const finals: StepResult[] = [];
  for await (const step of runner) {
    for await (const e of step) void e;
    finals.push(await step.final());
  }
  return finals;
}

const text = (t: string) => ({ type: "text", text: t });
const use = (id: string, name: string, input: unknown = {}) => ({ type: "tool_use", id, name, input });

describe("the Tool Runner", () => {
  it("runs a step's tool calls one after another in call order, appends the call and its results, and loops", async () => {
    const calls: string[] = [];
    const slow = tool("slow", calls, () => new Promise((r) => setTimeout(() => r("slow done"), 20)));
    const fast = tool("fast", calls);
    const { client, requests } = scriptedClient([{ content: [text("Looking."), use("call_1", "slow"), use("call_2", "fast")] }, { content: [text("Done.")] }], { reasoning: false });
    const runner = runTools(client, params([slow, fast]));
    const finals = await drain(runner);

    expect(calls).toEqual(["slow", "fast"]);
    expect(finals.map((f) => f.stopReason)).toEqual(["tool_use", "end_turn"]);
    expect(runner.params.messages).toEqual([
      { role: "user", content: "Hi" },
      { role: "assistant", content: [text("Looking."), use("call_1", "slow"), use("call_2", "fast")] },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "call_1", content: "slow done" },
          { type: "tool_result", tool_use_id: "call_2", content: "fast done" },
        ],
      },
    ]);
    // The second step was sent with the call and its results; tools go without their code.
    expect(requests).toHaveLength(2);
    expect(requests[1].messages).toHaveLength(3);
    expect(requests[1]).toMatchObject({ model: TUTOR_MODEL, effort: "medium", instructions: "Be brief.", maxOutputTokens: 16000 });
  });

  it("turns a thrown tool error, a bad input or an unknown tool into an error result the model reads", async () => {
    const calls: string[] = [];
    const failing = tool("failing", calls, () => {
      throw new Error("Not saved: wrong step.");
    });
    const picky: RunnableTool = {
      ...tool("picky", calls),
      parse: () => {
        throw new Error("picky needs an amount");
      },
    };
    const { client } = scriptedClient([{ content: [use("a", "failing"), use("b", "picky"), use("c", "missing")] }, { content: [text("Sorry.")] }]);
    const runner = runTools(client, params([failing, picky]));
    await drain(runner);
    expect(runner.params.messages[2].content).toEqual([
      { type: "tool_result", tool_use_id: "a", content: "Error: Not saved: wrong step.", is_error: true },
      { type: "tool_result", tool_use_id: "b", content: "Error: picky needs an amount", is_error: true },
      { type: "tool_result", tool_use_id: "c", content: "Error: Unknown tool missing", is_error: true },
    ]);
  });

  it("runs no tools after a refusal or a reply cut off at its length limit, and appends nothing", async () => {
    for (const stop of ["refusal", "max_tokens"]) {
      const calls: string[] = [];
      const { client, requests } = scriptedClient([{ content: [text("Partly"), use("x", "noted")], stop_reason: stop }]);
      const runner = runTools(client, params([tool("noted", calls)]));
      const finals = await drain(runner);
      expect(finals.map((f) => f.stopReason)).toEqual([stop]);
      expect(calls).toEqual([]);
      expect(runner.params.messages).toHaveLength(1);
      expect(requests).toHaveLength(1);
    }
  });

  it("on Stop, lets a running tool finish and keeps its result, then sends nothing more", async () => {
    const stop = new AbortController();
    const calls: string[] = [];
    const working = tool("working", calls, async () => {
      stop.abort();
      await new Promise((r) => setTimeout(r, 10));
      return "saved";
    });
    const { client, requests } = scriptedClient([{ content: [use("w", "working")] }, { content: [text("Never sent.")] }]);
    const runner = runTools(client, params([working]), { signal: stop.signal });
    await expect(drain(runner)).rejects.toThrow();
    expect(calls).toEqual(["working"]);
    expect(runner.params.messages.at(-1)).toEqual({ role: "user", content: [{ type: "tool_result", tool_use_id: "w", content: "saved" }] });
    expect(requests).toHaveLength(1);
  });

  it("takes one client for the whole run (the test bed starts a fresh script per run)", async () => {
    const first = scriptedClient([{ content: [use("t", "noted")] }, { content: [text("Two.")] }]);
    let runs = 0;
    const client: ModelClient = {
      step: () => {
        throw new Error("the run's own client is used");
      },
      compact: () => {
        throw new Error("unused");
      },
      forRun: () => {
        runs++;
        return first.client;
      },
    };
    await drain(runTools(client, params([tool("noted", [])])));
    expect(runs).toBe(1);
    expect(first.requests).toHaveLength(2);
  });

  it("aborts the step still streaming when the loop is closed early (a cut-off)", async () => {
    let signal: AbortSignal | undefined;
    const client: ModelClient = {
      step: (_request, options) => {
        signal = options?.signal;
        return {
          async *[Symbol.asyncIterator]() {},
          final: () => new Promise<StepResult>(() => {}),
        };
      },
      compact: () => Promise.reject(new Error("unused")),
    };
    const steps = runTools(client, params([]))[Symbol.asyncIterator]();
    await steps.next();
    expect(signal?.aborted).toBe(false);
    await steps.return?.(undefined);
    expect(signal?.aborted).toBe(true);
  });
});

describe("the step limit", () => {
  it("asks how many steps are left before each step, so a step a tool saved counts at once, and sends the last one with no tool choice", async () => {
    const calls: string[] = [];
    // The turn may take 3 steps; the tool saves one of its own (as compose_widget does), so the second step is the last.
    let used = 0;
    const saving = tool("compose", calls, () => {
      used += 1;
      return "composed";
    });
    const asked: number[] = [];
    const stepsLeft = async () => {
      asked.push(3 - used);
      return 3 - used;
    };
    const { client, requests } = scriptedClient([{ content: [use("call_1", "compose")] }, { content: [text("Here it is.")] }], { reasoning: false });
    const counting: ModelClient = { ...client, step: (request, options) => (used++, client.step(request, options)) };
    const runner = runTools(counting, params([saving]), { stepsLeft });
    const finals = await drain(runner);

    expect(finals.map((f) => f.stopReason)).toEqual(["tool_use", "end_turn"]);
    expect(asked).toEqual([3, 1]);
    expect(requests[0].toolChoice).toBeUndefined();
    expect(requests[1].toolChoice).toBe("none");
    // The tools stay listed on the last step: only the choice changes.
    expect(requests[1].tools.map((t) => t.name)).toEqual(["compose"]);
    expect(runner.stepLimitReached).toBe(false);
  });

  it("sends nothing once no step is left, keeping the last tool results, and says the limit was reached", async () => {
    const calls: string[] = [];
    let left = 1;
    const { client, requests } = scriptedClient([{ content: [use("call_1", "look")] }], { reasoning: false });
    // A model that calls a tool on its last step anyway: the runner still sends no further request.
    const runner = runTools(client, params([tool("look", calls)]), { stepsLeft: async () => left-- });
    const finals = await drain(runner);

    expect(finals.map((f) => f.stopReason)).toEqual(["tool_use"]);
    expect(requests).toHaveLength(1);
    expect(calls).toEqual(["look"]);
    expect(runner.params.messages.at(-1)).toEqual({ role: "user", content: [{ type: "tool_result", tool_use_id: "call_1", content: "look done" }] });
    expect(runner.stepLimitReached).toBe(true);
  });

  it("with no stepsLeft, never limits and never sets a tool choice", async () => {
    const { client, requests } = scriptedClient([{ content: [use("call_1", "look")] }, { content: [text("Done.")] }], { reasoning: false });
    const runner = runTools(client, params([tool("look", [])]));
    await drain(runner);
    expect(requests.map((r) => r.toolChoice)).toEqual([undefined, undefined]);
    expect(runner.stepLimitReached).toBe(false);
  });
});
