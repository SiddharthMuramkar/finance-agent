import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { openaiComposeClient } from "./compose";
import { describeFailure } from "./failures";
import { StepAborted, TUTOR_MODEL, type Message, type RunnableTool, type StepEvent, type StepRequest, type StepResult } from "./model";
import { openaiModelClient } from "./openai";
import { runTools } from "./runner";

/**
 * The model client through the real `openai` SDK, over HTTP, against a local server that answers the way OpenAI's API
 * reference shows (server-sent events named by their type, a JSON body for a non-streamed or failed request). Nothing
 * here reaches OpenAI and no real key is used: the SDK is pointed at 127.0.0.1 with a dummy key, the way the
 * production client is made (`new OpenAI()` from `OPENAI_API_KEY` and `OPENAI_BASE_URL`).
 *
 * The other adapter tests feed already-parsed events to the adapter; this one checks what only the SDK decides: the
 * exact request body and path it sends, how it parses the event stream, which error class an HTTP failure or a stream
 * `error` event becomes (and so what failures.ts tells the Learner), and that aborting closes the connection.
 */

type Seen = { method: string; path: string; auth: string | undefined; body: Record<string, unknown> };
type Reply =
  | { sse: object[]; hold?: boolean }
  | { status: number; json: object; headers?: Record<string, string> };

let server: Server;
let baseURL = "";
const seen: Seen[] = [];
const replies: Reply[] = [];
let closed: Promise<void> = Promise.resolve();

beforeAll(async () => {
  server = createServer((req, res) => void answer(req, res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
beforeEach(() => {
  seen.length = 0;
  replies.length = 0;
  vi.stubEnv("OPENAI_API_KEY", "sk-offline-wire-test");
  vi.stubEnv("OPENAI_BASE_URL", baseURL);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

async function answer(req: IncomingMessage, res: ServerResponse) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  seen.push({ method: req.method ?? "", path: req.url ?? "", auth: req.headers.authorization, body: raw ? JSON.parse(raw) : {} });
  const reply = replies.shift();
  if (!reply) {
    res.writeHead(500, { "content-type": "application/json", "x-should-retry": "false" });
    res.end(JSON.stringify({ error: { message: "The test server has no reply scripted.", type: "server_error", code: null, param: null } }));
    return;
  }
  if ("status" in reply) {
    res.writeHead(reply.status, { "content-type": "application/json", ...reply.headers });
    res.end(JSON.stringify(reply.json));
    return;
  }
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  for (const event of reply.sse) res.write(`event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`);
  if (reply.hold) {
    // The model goes quiet mid-reply; the test sees the client close the connection.
    closed = new Promise<void>((resolve) => res.on("close", () => resolve()));
    return;
  }
  res.end();
}

// --- OpenAI-shaped events, as in the Responses API reference -------------------------------------------------------

let n = 0;
const usage = { input_tokens: 1200, input_tokens_details: { cached_tokens: 1000, cache_write_tokens: 100 }, output_tokens: 80, output_tokens_details: { reasoning_tokens: 30 }, total_tokens: 1280 };
const responseObject = (status: string, output: object[], extra: object = {}) => ({
  id: "resp_wire",
  object: "response",
  created_at: 1762819200,
  status,
  error: null,
  incomplete_details: null,
  model: TUTOR_MODEL,
  output,
  parallel_tool_calls: true,
  reasoning: { effort: "medium", context: "current_turn" },
  store: false,
  tools: [],
  usage: status === "in_progress" ? null : usage,
  ...extra,
});
const reasoningItem = { id: "rs_1", type: "reasoning", summary: [], encrypted_content: "gAAAA-encrypted-reasoning" };
const messageItem = (id: string, text: string) => ({ id, type: "message", role: "assistant", status: "completed", phase: "final_answer", content: [{ type: "output_text", text, annotations: [], logprobs: [] }] });
const callItem = (callId: string, name: string, args: string) => ({ id: `fc_${callId}`, type: "function_call", call_id: callId, name, arguments: args, status: "completed" });

const created = () => [
  { type: "response.created", response: responseObject("in_progress", []), sequence_number: n++ },
  { type: "response.in_progress", response: responseObject("in_progress", []), sequence_number: n++ },
];
const reasoned = (index: number) => [
  { type: "response.output_item.added", output_index: index, item: { ...reasoningItem, encrypted_content: null }, sequence_number: n++ },
  { type: "response.output_item.done", output_index: index, item: reasoningItem, sequence_number: n++ },
];
function spoken(index: number, item: ReturnType<typeof messageItem>, size = 4) {
  const text = item.content[0].text;
  const out: object[] = [
    { type: "response.output_item.added", output_index: index, item: { ...item, status: "in_progress", content: [] }, sequence_number: n++ },
    { type: "response.content_part.added", item_id: item.id, output_index: index, content_index: 0, part: { type: "output_text", text: "", annotations: [], logprobs: [] }, sequence_number: n++ },
  ];
  for (let at = 0; at < text.length; at += size) {
    out.push({ type: "response.output_text.delta", item_id: item.id, output_index: index, content_index: 0, delta: text.slice(at, at + size), logprobs: [], sequence_number: n++ });
  }
  out.push(
    { type: "response.output_text.done", item_id: item.id, output_index: index, content_index: 0, text, logprobs: [], sequence_number: n++ },
    { type: "response.content_part.done", item_id: item.id, output_index: index, content_index: 0, part: item.content[0], sequence_number: n++ },
    { type: "response.output_item.done", output_index: index, item, sequence_number: n++ },
  );
  return out;
}
function called(index: number, item: ReturnType<typeof callItem>) {
  return [
    { type: "response.output_item.added", output_index: index, item: { ...item, arguments: "", status: "in_progress" }, sequence_number: n++ },
    { type: "response.function_call_arguments.delta", item_id: item.id, output_index: index, delta: item.arguments, sequence_number: n++ },
    { type: "response.function_call_arguments.done", item_id: item.id, output_index: index, name: item.name, arguments: item.arguments, sequence_number: n++ },
    { type: "response.output_item.done", output_index: index, item, sequence_number: n++ },
  ];
}
const done = (output: object[]) => ({ type: "response.completed", response: responseObject("completed", output), sequence_number: n++ });

// --- The app's side ---------------------------------------------------------------------------------------------

const pv = {
  type: "search_result" as const,
  source: "/passages/12",
  title: "Present value",
  content: [{ type: "text" as const, text: "Source: a textbook." }, { type: "text" as const, text: "Money today is worth more." }, { type: "text" as const, text: "So we discount." }],
};
const searched: Message[] = [
  { role: "user", content: "Why discount?" },
  { role: "assistant", content: [{ type: "tool_use", id: "call_0", name: "search_library", input: { query: "discount" } }] },
  { role: "user", content: [{ type: "tool_result", tool_use_id: "call_0", content: [pv] }] },
];
const lookUp: RunnableTool = {
  type: "function",
  name: "look_up",
  description: "Looks a term up.",
  parameters: { type: "object", properties: { term: { type: "string" } }, required: ["term"] },
  strict: false,
  parse: (input) => input as { term: string },
  run: (input: { term: string }) => `${input.term}: the value today of money paid later.`,
};

function request(messages: Message[] = [{ role: "user", content: "Hi" }]): StepRequest {
  return { model: TUTOR_MODEL, effort: "medium", instructions: "Teach present value.", tools: [lookUp], messages, maxOutputTokens: 16000 };
}

async function read(step: AsyncIterable<StepEvent> & { final(): Promise<StepResult> }) {
  const events: StepEvent[] = [];
  for await (const e of step) events.push(e);
  return { events, final: await step.final() };
}

async function failureOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => {
      throw new Error("expected the call to fail");
    },
    (e: unknown) => e,
  );
  return { error, ...describeFailure(error) };
}

describe("the model client through the real openai SDK, over HTTP (no real key)", () => {
  it("makes no client and reads no key until a step is read", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(() => openaiModelClient().step(request())).not.toThrow();
    expect(seen).toHaveLength(0);
  });

  it("streams a cited reply: the request the SDK sends, the events it parses, the step it stores", async () => {
    const reply = messageItem("msg_1", "Money now beats money later.⟦12:1⟧\n\nSo we discount.⟦12:2⟧");
    replies.push({ sse: [...created(), ...reasoned(0), ...spoken(1, reply), done([reasoningItem, reply])] });

    const { events, final } = await read(openaiModelClient().step(request(searched)));

    expect(seen).toHaveLength(1);
    const [sent] = seen;
    expect(sent).toMatchObject({ method: "POST", path: "/v1/responses", auth: "Bearer sk-offline-wire-test" });
    expect(sent.body).toEqual({
      model: "gpt-6.1-sol",
      input: [
        { type: "message", role: "developer", content: [{ type: "input_text", text: "Teach present value.", prompt_cache_breakpoint: { mode: "explicit" } }] },
        { type: "message", role: "user", content: "Why discount?" },
        { type: "function_call", call_id: "call_0", name: "search_library", arguments: '{"query":"discount"}' },
        { type: "function_call_output", call_id: "call_0", output: "Passage 12: Present value\nSource: a textbook.\n§1 Money today is worth more.\n§2 So we discount." },
      ],
      tools: [{ type: "function", name: "look_up", description: "Looks a term up.", parameters: lookUp.parameters, strict: false }],
      reasoning: { effort: "medium", context: "current_turn" },
      max_output_tokens: 16000,
      store: false,
      include: ["reasoning.encrypted_content"],
      stream: true,
    });

    // The live events: each cited block's text, its citation, its end, in order.
    expect(events.filter((e) => e.type === "citation")).toHaveLength(2);
    expect(events.filter((e) => e.type === "text").map((e) => (e as { text: string }).text).join("")).toBe("Money now beats money later.\n\nSo we discount.");
    // The stored step: the same blocks, then the raw output for exact replay.
    expect(final.stopReason).toBe("end_turn");
    expect(final.usage).toEqual(usage);
    expect(final.content.slice(0, 2)).toEqual([
      { type: "text", text: "Money now beats money later.", citations: [{ type: "search_result_location", source: "/passages/12", title: "Present value", start_block_index: 1, end_block_index: 2 }] },
      { type: "text", text: "\n\nSo we discount.", citations: [{ type: "search_result_location", source: "/passages/12", title: "Present value", start_block_index: 2, end_block_index: 3 }] },
    ]);
    expect(final.content.at(-1)).toEqual({ type: "replay", items: [reasoningItem, reply] });
  });

  it("runs a function call, then replays the step exactly (reasoning included) with the call's output", async () => {
    const call = callItem("call_9", "look_up", '{"term":"present value"}');
    const answer = messageItem("msg_2", "Present value is today's worth of later money.");
    replies.push({ sse: [...created(), ...reasoned(0), ...called(1, call), done([reasoningItem, call])] });
    replies.push({ sse: [...created(), ...spoken(0, answer), done([answer])] });

    const runner = runTools(openaiModelClient(), { ...request(), tools: [lookUp] });
    const stops: string[] = [];
    for await (const step of runner) stops.push((await step.final()).stopReason);

    expect(stops).toEqual(["tool_use", "end_turn"]);
    expect(seen).toHaveLength(2);
    // The second request carries the first step's output items as they came, then the tool's output.
    expect((seen[1].body.input as object[]).slice(2)).toEqual([
      reasoningItem,
      call,
      { type: "function_call_output", call_id: "call_9", output: "present value: the value today of money paid later." },
    ]);
    expect(runner.params.messages.at(-2)).toMatchObject({ role: "assistant", content: [{ type: "tool_use", id: "call_9", name: "look_up", input: { term: "present value" } }, { type: "replay" }] });
  });

  it("stops for max_tokens on an incomplete response and for a refusal on content_filter", async () => {
    const cut = messageItem("msg_3", "A rupee today is worth");
    replies.push({ sse: [...created(), ...spoken(0, cut), { type: "response.incomplete", response: responseObject("incomplete", [cut], { incomplete_details: { reason: "max_output_tokens" } }), sequence_number: n++ }] });
    replies.push({ sse: [...created(), { type: "response.incomplete", response: responseObject("incomplete", [], { incomplete_details: { reason: "content_filter" } }), sequence_number: n++ }] });

    const client = openaiModelClient();
    const first = await client.step(request()).final();
    expect(first.stopReason).toBe("max_tokens");
    expect(first.content[0]).toEqual({ type: "text", text: "A rupee today is worth" });
    expect((await client.step(request()).final()).stopReason).toBe("refusal");
  });

  it("fails a step on a failed response, and on a stream error event the SDK turns into an APIError", async () => {
    replies.push({ sse: [...created(), { type: "response.failed", response: responseObject("failed", [], { error: { code: "server_error", message: "The server had an error." } }), sequence_number: n++ }] });
    replies.push({ sse: [...created(), { type: "error", code: "misalignment_policy_violation", message: "This request was stopped.", param: null, sequence_number: n++ }] });
    replies.push({ sse: [...created(), { type: "error", code: "insufficient_quota", message: "You exceeded your current quota.", param: null, sequence_number: n++ }] });

    const client = openaiModelClient();
    expect(await failureOf(client.step(request()).final())).toMatchObject({ error: { name: "ResponseFailed", code: "server_error" }, kind: "overloaded" });
    const stopped = await failureOf(client.step(request()).final());
    expect(stopped.error).toMatchObject({ code: "misalignment_policy_violation", status: undefined });
    expect(stopped.message).toMatch(/safety checks stopped this turn/);
    expect(await failureOf(client.step(request()).final())).toMatchObject({ kind: "credits" });
  });

  it("maps HTTP failures to what the Learner is told", async () => {
    const noRetry = { "x-should-retry": "false" };
    const error = (message: string, type: string, code: string | null) => ({ error: { message, type, code, param: null } });
    replies.push({ status: 429, json: error("You exceeded your current quota.", "insufficient_quota", "insufficient_quota"), headers: noRetry });
    replies.push({ status: 429, json: error("Rate limit reached.", "requests", "rate_limit_exceeded"), headers: noRetry });
    replies.push({ status: 500, json: error("The server had an error.", "server_error", null), headers: noRetry });
    replies.push({ status: 401, json: error("Incorrect API key provided.", "invalid_request_error", "invalid_api_key"), headers: noRetry });
    replies.push({ status: 403, json: error("This request was stopped.", "invalid_request_error", "misalignment_policy_violation"), headers: noRetry });

    const client = openaiModelClient();
    const kinds = [];
    for (let i = 0; i < 5; i++) kinds.push((await failureOf(client.step(request()).final())).kind);
    expect(kinds).toEqual(["credits", "rate_limit", "overloaded", "error", "error"]);
    expect(seen.map((s) => s.path)).toEqual(Array(5).fill("/v1/responses"));
  });

  it("tells the Learner the key is missing when there is none, without sending anything", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const failed = await failureOf(openaiModelClient().step(request()).final());
    expect(failed.message).toMatch(/OPENAI_API_KEY/);
    expect(seen).toHaveLength(0);
  });

  it("aborts mid-stream: the step fails with StepAborted and the SDK closes the connection", async () => {
    replies.push({ sse: [...created(), { type: "response.output_text.delta", item_id: "msg_4", output_index: 0, content_index: 0, delta: "Money today.\n\nMore", logprobs: [], sequence_number: n++ }], hold: true });
    const controller = new AbortController();
    const step = openaiModelClient().step(request(), { signal: controller.signal });
    const events: StepEvent[] = [];
    const reading = (async () => {
      for await (const e of step) {
        events.push(e);
        controller.abort();
      }
    })();
    await expect(reading).rejects.toBeInstanceOf(StepAborted);
    await expect(step.final()).rejects.toBeInstanceOf(StepAborted);
    expect(events[0]).toEqual({ type: "text", block: 0, text: "Money today." });
    await closed;
  });

  it("compacts through /v1/responses/compact, and the next step sends the window back as returned", async () => {
    const window = [
      { id: "msg_u", type: "message", role: "user", status: "completed", content: [{ type: "input_text", text: "Why discount?" }] },
      { id: "cmp_1", type: "compaction", encrypted_content: "gAAAA-compacted" },
    ];
    replies.push({ status: 200, json: { id: "resp_cmp", object: "response.compaction", created_at: 1762819200, output: window, usage } });
    const answer = messageItem("msg_5", "Shall we try one?");
    replies.push({ sse: [...created(), ...spoken(0, answer), done([answer])] });

    const client = openaiModelClient();
    const summary = await client.compact({ model: TUTOR_MODEL, messages: searched });
    expect(seen[0]).toMatchObject({ method: "POST", path: "/v1/responses/compact", body: { model: "gpt-6.1-sol" } });
    expect(Object.keys(seen[0].body).sort()).toEqual(["input", "model"]);
    expect(summary).toEqual({ content: [{ type: "compaction", items: window }], stopReason: "compaction", usage });

    await client.step(request([{ role: "assistant", content: summary.content }, { role: "user", content: "Go on." }])).final();
    expect((seen[1].body.input as object[]).slice(1)).toEqual([...window, { type: "message", role: "user", content: "Go on." }]);
  });

  it("compose_widget: one non-streamed request, its text read through the SDK's output_text", async () => {
    replies.push({ status: 200, json: responseObject("completed", [reasoningItem, messageItem("msg_6", "```js\nwidget()\n```")]) });
    const reply = await openaiComposeClient().create({ model: TUTOR_MODEL, instructions: "Compose a widget.", input: "A slider.", max_output_tokens: 16000 });
    expect(seen[0]).toMatchObject({ method: "POST", path: "/v1/responses" });
    expect(seen[0].body).toEqual({ model: "gpt-6.1-sol", instructions: "Compose a widget.", input: "A slider.", reasoning: { effort: "medium" }, max_output_tokens: 16000, store: false });
    expect(reply).toEqual({ content: [{ type: "text", text: "```js\nwidget()\n```" }], stop_reason: "end_turn", usage });
  });
});
