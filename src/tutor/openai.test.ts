import { OpenAIError } from "openai";
import type {
  CompactedResponse,
  Response,
  ResponseCompactParams,
  ResponseCreateParamsStreaming,
  ResponseOutputItem,
  ResponseOutputMessage,
  ResponseStreamEvent,
  ResponseUsage,
} from "openai/resources/responses/responses";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StepAborted, TUTOR_MODEL, type Message, type RunnableTool, type StepEvent, type StepRequest, type StepStream, type TextBlock } from "./model";
import { openaiModelClient, type ResponsesApi } from "./openai";
import { ResponseFailed, toInputItems } from "./openai-items";
import { runTools } from "./runner";

/**
 * The real model client against a fake Responses API: `create` answers with the scripted stream events (as objects
 * shaped like OpenAI's), `compact` with the scripted window. Nothing touches the network.
 */
type Script = ResponseStreamEvent[] | ((signal: AbortSignal | undefined) => AsyncIterable<ResponseStreamEvent>);

function fakeApi(scripts: Script[], compacted?: CompactedResponse) {
  const requests: { body: ResponseCreateParamsStreaming; signal?: AbortSignal }[] = [];
  const compactions: ResponseCompactParams[] = [];
  const api: ResponsesApi = {
    responses: {
      async create(body, options) {
        requests.push({ body: structuredClone(body), signal: options?.signal });
        const script = scripts.shift();
        if (!script) throw new Error("fake API ran out of streams");
        return typeof script === "function" ? script(options?.signal) : streamOf(script);
      },
      async compact(body) {
        compactions.push(structuredClone(body));
        if (!compacted) throw new Error("no compaction scripted");
        return compacted;
      },
    },
  };
  return { api, requests, compactions };
}

async function* streamOf(events: ResponseStreamEvent[]): AsyncGenerator<ResponseStreamEvent> {
  for (const e of events) yield e;
}

let seq = 0;
const delta = (outputIndex: number, text: string): ResponseStreamEvent => ({
  type: "response.output_text.delta",
  item_id: `msg_${outputIndex}`,
  output_index: outputIndex,
  content_index: 0,
  delta: text,
  logprobs: [],
  sequence_number: seq++,
});
const itemDone = (outputIndex: number, item: ResponseOutputItem): ResponseStreamEvent => ({ type: "response.output_item.done", output_index: outputIndex, item, sequence_number: seq++ });
const usage: ResponseUsage = {
  input_tokens: 1200,
  input_tokens_details: { cached_tokens: 1000, cache_write_tokens: 100 },
  output_tokens: 80,
  output_tokens_details: { reasoning_tokens: 30 },
  total_tokens: 1280,
};
function response(output: ResponseOutputItem[], status: Response["status"] = "completed", extra: Partial<Response> = {}): Response {
  return { id: "resp_1", object: "response", status, output, usage, error: null, incomplete_details: null, ...extra } as Response;
}
const completed = (output: ResponseOutputItem[]): ResponseStreamEvent => ({ type: "response.completed", response: response(output), sequence_number: seq++ });

const reasoning: ResponseOutputItem = { id: "rs_1", type: "reasoning", summary: [], encrypted_content: "encrypted" };
const message = (id: string, text: string): ResponseOutputMessage => ({ id, type: "message", role: "assistant", status: "completed", phase: "final_answer", content: [{ type: "output_text", text, annotations: [] }] });
const call = (callId: string, name: string, args: string): ResponseOutputItem => ({ id: `fc_${callId}`, type: "function_call", call_id: callId, name, arguments: args, status: "completed" });

/** A finished message streamed in small pieces, then its item's end. */
function streamed(outputIndex: number, item: ResponseOutputMessage, size = 3): ResponseStreamEvent[] {
  const text = item.content.map((p) => (p.type === "output_text" ? p.text : "")).join("");
  const out: ResponseStreamEvent[] = [];
  for (let at = 0; at < text.length; at += size) out.push(delta(outputIndex, text.slice(at, at + size)));
  return [...out, itemDone(outputIndex, item)];
}

const pv = {
  type: "search_result" as const,
  source: "/passages/12",
  title: "Present value",
  content: [{ type: "text" as const, text: "Source: a textbook.\n\n" }, { type: "text" as const, text: "Money today is worth more. " }, { type: "text" as const, text: "So we discount." }],
};
const searched: Message[] = [
  { role: "user", content: "Why discount?" },
  { role: "assistant", content: [{ type: "tool_use", id: "call_0", name: "search_library", input: { query: "discount" } }] },
  { role: "user", content: [{ type: "tool_result", tool_use_id: "call_0", content: [pv] }] },
];

function request(messages: Message[] = [{ role: "user", content: "Hi" }], model = TUTOR_MODEL): StepRequest {
  return { model, effort: "medium", instructions: "Be brief.", tools: [], messages, maxOutputTokens: 16000 };
}

async function events(stream: StepStream): Promise<StepEvent[]> {
  const out: StepEvent[] = [];
  for await (const e of stream) out.push(e);
  return out;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the OpenAI model client", () => {
  it("streams each finished block, numbered as in the final content, with citations before its end", async () => {
    const first = message("msg_1", "Money today is worth more ⟦12:1⟧, so we discount.\n\nLet me check rates.");
    const second = message("msg_3", "Higher rates lower it.⟦12:2⟧ Done.");
    const output = [reasoning, first, call("call_1", "search_library", '{"query":"rates"}'), second];
    const { api, requests } = fakeApi([[itemDone(0, reasoning), ...streamed(1, first), itemDone(2, output[2]), ...streamed(3, second, 1), completed(output)]]);
    const stream = openaiModelClient({ client: api }).step(request(searched));

    const seen = await events(stream);
    const final = await stream.final();
    expect(final.stopReason).toBe("tool_use");
    expect(final.usage).toEqual(usage);
    expect(final.content.map((b) => b.type)).toEqual(["text", "text", "text", "tool_use", "text", "text", "replay"]);

    // Every text block streams its whole text, its citations and its end, at its own index; nothing else does.
    const textBlocks = final.content.flatMap((b, i) => (b.type === "text" ? [i] : []));
    expect(seen.filter((e) => e.type === "block_stop").map((e) => e.block)).toEqual(textBlocks);
    for (const i of textBlocks) {
      const block = final.content[i] as TextBlock;
      expect(
        seen
          .filter((e) => e.type === "text" && e.block === i)
          .map((e) => (e as { text: string }).text)
          .join(""),
      ).toBe(block.text);
      expect(seen.filter((e) => e.type === "citation" && e.block === i).map((e) => (e as { citation: unknown }).citation)).toEqual(block.citations ?? []);
      const stop = seen.findIndex((e) => e.type === "block_stop" && e.block === i);
      seen.forEach((e, at) => {
        if (e.type !== "block_stop" && e.block === i) expect(at).toBeLessThan(stop);
      });
    }
    expect(final.content[0]).toEqual({
      type: "text",
      text: "Money today is worth more",
      citations: [{ type: "search_result_location", source: "/passages/12", title: "Present value", start_block_index: 1, end_block_index: 2 }],
    });
    // The second message item starts on a new paragraph, live and stored alike.
    expect(final.content[4]).toMatchObject({ text: "\n\nHigher rates lower it.", citations: [{ start_block_index: 2, end_block_index: 3 }] });

    // One request, streamed and stateless, with the step's signal.
    expect(requests).toHaveLength(1);
    expect(requests[0].body).toMatchObject({ model: "gpt-6.1-sol", stream: true, store: false, reasoning: { effort: "medium", context: "current_turn" } });
    expect(requests[0].signal).toBeUndefined();
  });

  it("starts nothing until the step is read, and works the result out without anyone iterating", async () => {
    const { api, requests } = fakeApi([[...streamed(0, message("msg_1", "Hello there.")), completed([message("msg_1", "Hello there.")])]]);
    const stream = openaiModelClient({ client: api }).step(request());
    expect(requests).toHaveLength(0);
    const final = await stream.final();
    expect(final).toMatchObject({ content: [{ type: "text", text: "Hello there." }, { type: "replay" }], stopReason: "end_turn" });
    // `final()` is worked out once; iterating afterwards replays the step's events without a second request.
    expect(await stream.final()).toBe(final);
    expect(await events(stream)).toEqual([
      { type: "text", block: 0, text: "Hello there." },
      { type: "block_stop", block: 0 },
    ]);
    expect(requests).toHaveLength(1);
  });

  it("never needs OPENAI_API_KEY to be made: the SDK client is built on the first request, which then fails", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_ADMIN_KEY", "");
    const client = openaiModelClient();
    const stream = client.step(request());
    await expect(stream.final()).rejects.toBeInstanceOf(OpenAIError);
    await expect(client.compact({ model: TUTOR_MODEL, messages: [] })).rejects.toThrow(/OPENAI_API_KEY/);
  });

  it("stops for max_tokens on an incomplete response, and keeps its cut-off text", async () => {
    const cut = message("msg_1", "A rupee today is worth");
    const { api } = fakeApi([[...streamed(0, cut), { type: "response.incomplete", response: response([cut], "incomplete", { incomplete_details: { reason: "max_output_tokens" } }), sequence_number: seq++ }]]);
    const final = await openaiModelClient({ client: api }).step(request()).final();
    expect(final.stopReason).toBe("max_tokens");
    expect(final.content[0]).toEqual({ type: "text", text: "A rupee today is worth" });
  });

  // The `error` event here is the defensive path for a client that yields raw events; the real SDK raises it as an
  // APIError before the adapter sees it (openai-wire.test.ts checks that path over HTTP).
  it("fails the step on a failed response or an error event, after what streamed before it", async () => {
    const failed: ResponseStreamEvent = {
      type: "response.failed",
      response: response([], "failed", { error: { code: "server_error", message: "The server had an error." } }),
      sequence_number: seq++,
    };
    const { api } = fakeApi([
      [...streamed(0, message("msg_1", "Half a reply.")), failed],
      [delta(0, "Hi"), { type: "error", code: "misalignment_policy_violation", message: "Stopped.", param: null, sequence_number: seq++ }],
      [delta(0, "Hi")],
    ]);
    const client = openaiModelClient({ client: api });

    const one = client.step(request());
    const seen: StepEvent[] = [];
    await expect(
      (async () => {
        for await (const e of one) seen.push(e);
      })(),
    ).rejects.toMatchObject({ name: "ResponseFailed", code: "server_error", message: "The server had an error." });
    expect(seen).toEqual([
      { type: "text", block: 0, text: "Half a reply." },
      { type: "block_stop", block: 0 },
    ]);
    await expect(one.final()).rejects.toBeInstanceOf(ResponseFailed);

    await expect(client.step(request()).final()).rejects.toMatchObject({ code: "misalignment_policy_violation" });
    // A stream that ends without finishing the response fails too.
    await expect(client.step(request()).final()).rejects.toThrow(/ended before the response finished/);
  });

  it("fails the open step at once with StepAborted when its signal aborts, and sends nothing once aborted", async () => {
    let release = () => {};
    const hang = new Promise<void>((resolve) => (release = resolve));
    const { api, requests } = fakeApi([
      async function* () {
        yield delta(0, "Money today. ");
        yield delta(0, "\n\nMore");
        await hang; // the model goes quiet
        yield completed([message("msg_1", "never")]);
      },
    ]);
    const client = openaiModelClient({ client: api });
    const controller = new AbortController();
    const stream = client.step(request(), { signal: controller.signal });
    const seen: StepEvent[] = [];
    const reading = (async () => {
      for await (const e of stream) {
        seen.push(e);
        controller.abort();
      }
    })();
    await expect(reading).rejects.toBeInstanceOf(StepAborted);
    await expect(stream.final()).rejects.toBeInstanceOf(StepAborted);
    expect(seen).toEqual([{ type: "text", block: 0, text: "Money today." }]);
    expect(requests[0].signal).toBe(controller.signal);
    release();

    // Aborted before it starts: no request.
    const aborted = new AbortController();
    aborted.abort();
    await expect(client.step(request(), { signal: aborted.signal }).final()).rejects.toBeInstanceOf(StepAborted);
    await expect(client.compact({ model: TUTOR_MODEL, messages: [] }, { signal: aborted.signal })).rejects.toBeInstanceOf(StepAborted);
    expect(requests).toHaveLength(1);
  });

  it("runs gpt-6.1-sol only", async () => {
    const { api, requests } = fakeApi([]);
    const client = openaiModelClient({ client: api });
    expect(() => client.step(request(undefined, "claude-opus-5-5"))).toThrow(/gpt-6\.1-sol only/);
    await expect(client.compact({ model: "gpt-5.5", messages: [] })).rejects.toThrow(/gpt-6\.1-sol only/);
    expect(requests).toHaveLength(0);
  });

  it("compacts the history without the instructions into one compaction block holding the window as returned", async () => {
    const window = [{ id: "msg_u", type: "message", role: "user", status: "completed", content: [{ type: "input_text", text: "Why discount?" }] }, { id: "cmp_1", type: "compaction", encrypted_content: "summary" }];
    const { api, compactions } = fakeApi([], { id: "cmp_resp", object: "response.compaction", created_at: 0, output: window as unknown as ResponseOutputItem[], usage });
    const summary = await openaiModelClient({ client: api }).compact({ model: TUTOR_MODEL, messages: searched });
    expect(summary).toEqual({ content: [{ type: "compaction", items: window }], stopReason: "compaction", usage });
    expect(compactions).toEqual([{ model: "gpt-6.1-sol", input: toInputItems(searched) }]);
    expect(JSON.stringify(compactions)).not.toContain("developer");
  });

  it("replays a step exactly as it came when the Tool Runner sends the next one", async () => {
    const looking = message("msg_1", "Let me look.");
    const found = message("msg_2", "Found it.");
    const step1 = [reasoning, looking, call("call_1", "search_library", '{"query": "pv"}')];
    const { api, requests } = fakeApi([
      [itemDone(0, reasoning), ...streamed(1, looking), itemDone(2, step1[2]), completed(step1)],
      [...streamed(0, found), completed([found])],
    ]);
    const search: RunnableTool = { type: "function", name: "search_library", description: "Search.", parameters: {}, strict: false, parse: (i) => i, run: () => "No passage matched." };
    const runner = runTools(openaiModelClient({ client: api }), { ...request([{ role: "user", content: "Why?" }]), tools: [search] });
    for await (const step of runner) {
      for await (const e of step) void e;
      await step.final();
    }
    expect(requests[1].body.input).toEqual([
      { type: "message", role: "developer", content: [{ type: "input_text", text: "Be brief.", prompt_cache_breakpoint: { mode: "explicit" } }] },
      { type: "message", role: "user", content: "Why?" },
      ...step1,
      { type: "function_call_output", call_id: "call_1", output: "No passage matched." },
    ]);
    expect(runner.params.messages.at(-1)).toEqual({ role: "user", content: [{ type: "tool_result", tool_use_id: "call_1", content: "No passage matched." }] });
  });
});
