import { toResponseInputItems, type ResponseInputItemLike } from "openai/lib/responses/ResponseInputItems";
import type {
  EasyInputMessage,
  Response,
  ResponseCreateParamsStreaming,
  ResponseError,
  ResponseFunctionToolCall,
  ResponseInputItem,
  ResponseInputText,
  ResponseOutputItem,
  ResponseStatus,
} from "openai/resources/responses/responses";
import { passageIdOf } from "@/library/passage";
import { renderMarkers, splitCited, type CitedPassage, type CitedSegment, type PassageResolver } from "./cite-markers";
import type { Block, Message, ReplayBlock, SearchResultBlock, StepRequest, StepResult, StopReason, TextBlock, ToolResultBlock, ToolUseBlock } from "./model";

/**
 * The one translation between the app's transcript (model.ts, stored in `messages.content`) and OpenAI's Responses
 * items. Requests are stateless (`store: false`): every step sends the whole history from the latest compaction on,
 * and a step the model wrote goes back exactly as it came (its `replay` block: encrypted reasoning, the message's
 * `phase`, ids and the function calls' exact arguments). A step code wrote or a filter edited has no replay block and
 * is sent rebuilt from its readable blocks, without reasoning. A block this adapter has no OpenAI item for (from an
 * older model, such as thinking, Anthropic's server tools or a readable compaction, or any other unknown type) cannot be
 * sent at all: a Session frozen for an older model is retired before any request, so one reaching here is a bug, and
 * the request fails loudly rather than quietly dropping part of the history.
 */

/**
 * A response the API reported as failed (a `response.failed` event, or a `failed` or `cancelled` status), with OpenAI's
 * error code. A stream's `error` event never gets here: the SDK raises it itself, as an `APIError` with the event's
 * code and no HTTP status (failures.ts reads it by its code; openai-wire.test.ts pins this).
 */
export class ResponseFailed extends Error {
  constructor(
    readonly code: string | null,
    message: string,
  ) {
    super(message);
    this.name = "ResponseFailed";
  }
}

/**
 * One model step's request. The instructions go first as a developer message whose text ends in an explicit prompt
 * cache breakpoint: the tools and instructions are the prefix every step and every turn of the Session share, so it
 * is cached on its own, and the API's implicit breakpoint caches the growing conversation after it. Reasoning comes
 * back encrypted so a stateless request can replay it, and the model reads it only within its own turn
 * (`context: "current_turn"`, the API's default for this kind of model): an earlier turn's reasoning items are sent
 * but not read, so the Tutor keeps its words between the Learner's messages, not its private reasoning.
 */
export function toResponseCreateParams(request: StepRequest): ResponseCreateParamsStreaming {
  return {
    model: request.model,
    input: [instructionsItem(request.instructions), ...toInputItems(request.messages)],
    tools: request.tools.map(({ name, description, parameters, strict }) => ({ type: "function", name, description, parameters, strict })),
    // The tools stay listed on a last step (the cached prefix is unchanged); "none" only stops the model calling them.
    ...(request.toolChoice && { tool_choice: request.toolChoice }),
    reasoning: { effort: request.effort, context: "current_turn" },
    max_output_tokens: request.maxOutputTokens,
    store: false,
    include: ["reasoning.encrypted_content"],
    stream: true,
  };
}

function instructionsItem(text: string): ResponseInputItem.Message {
  return { type: "message", role: "developer", content: [{ type: "input_text", text, prompt_cache_breakpoint: { mode: "explicit" } }] };
}

const hasCompaction = (m: Message) => Array.isArray(m.content) && m.content.some((b) => b?.type === "compaction");

/** The history from its latest compaction on: the compacted window stands in for everything before it. */
export function fromLastCompaction(messages: Message[]): Message[] {
  const at = messages.findLastIndex(hasCompaction);
  return at > 0 ? messages.slice(at) : messages;
}

/** The stored history as Responses input items (no instructions): what a step sends after them, and what a compaction folds. */
export function toInputItems(messages: Message[]): ResponseInputItem[] {
  const items: ResponseInputItem[] = [];
  for (const [i, m] of fromLastCompaction(messages).entries()) {
    if (m.role === "system") items.push(developerItem(m, i));
    else if (m.role === "user") items.push(...userItems(m, i));
    else items.push(...assistantItems(m, i));
  }
  return items;
}

/**
 * A block the adapter cannot send: a type it has no OpenAI item for. The fallback of every block switch below; most
 * likely an older model's Session that was not retired.
 */
function cannotSend(block: { type?: unknown } | null | undefined, row: number): Error {
  return new Error(
    `Message ${row} holds a "${String(block?.type)}" block, which cannot be sent to OpenAI: this adapter has no item for it. It may be from a model the Session used before (a Session frozen for an older model must be retired before its next turn).`,
  );
}

/** Code's changed context mid-conversation: a developer message, which may sit anywhere in the input. */
function developerItem(m: Message, row: number): EasyInputMessage {
  if (typeof m.content === "string") return { type: "message", role: "developer", content: m.content };
  const text = m.content.map((b) => (b.type === "text" ? b.text : throwError(cannotSend(b, row)))).join("\n\n");
  return { type: "message", role: "developer", content: text };
}

/** The Learner's message (each run of text blocks one user message) and tool results (each a function call output). */
function userItems(m: Message, row: number): ResponseInputItem[] {
  if (typeof m.content === "string") return [{ type: "message", role: "user", content: m.content }];
  const items: ResponseInputItem[] = [];
  let parts: ResponseInputText[] = [];
  const flush = () => {
    if (parts.length) items.push({ type: "message", role: "user", content: parts });
    parts = [];
  };
  for (const b of m.content) {
    if (b?.type === "text") {
      if (b.text) parts.push({ type: "input_text", text: b.text });
    } else if (b?.type === "tool_result") {
      flush();
      items.push({ type: "function_call_output", call_id: b.tool_use_id, output: toolOutputText(b, row) });
    } else throw cannotSend(b, row);
  }
  flush();
  return items;
}

/**
 * A model step: exactly as it came when it kept its replay block; otherwise rebuilt from its blocks (each run of text
 * one assistant message with its citations written back as markers, `commentary` before a tool call and `final_answer`
 * at the end; each tool call one function call), or a compaction's window as returned.
 */
function assistantItems(m: Message, row: number): ResponseInputItem[] {
  if (typeof m.content === "string") return m.content ? [{ type: "message", role: "assistant", phase: "final_answer", content: m.content }] : [];
  const replay = m.content.find((b): b is ReplayBlock => b?.type === "replay");
  if (replay) return toResponseInputItems(replay.items as ResponseInputItemLike[]);
  const items: ResponseInputItem[] = [];
  let text = "";
  // Text before a tool call in the same step was the model's commentary; the step's last text is its answer.
  const flush = (phase: "commentary" | "final_answer") => {
    if (text) items.push({ type: "message", role: "assistant", phase, content: text });
    text = "";
  };
  for (const b of m.content) {
    if (b?.type === "text") text += renderMarkers(b.text, b.citations);
    else if (b?.type === "tool_use") {
      flush("commentary");
      items.push({ type: "function_call", call_id: b.id, name: b.name, arguments: b.arguments ?? JSON.stringify(b.input ?? {}) });
    } else if (b?.type === "compaction" && Array.isArray(b.items)) {
      flush("final_answer");
      items.push(...toResponseInputItems(b.items as ResponseInputItemLike[]));
    } else throw cannotSend(b, row);
  }
  flush("final_answer");
  return items;
}

/** What a tool returned, as the function call's output: its text, or (search_library) each passage rendered for citing. */
export function toolOutputText(result: ToolResultBlock, row = 0): string {
  const text =
    typeof result.content === "string"
      ? result.content
      : result.content.map((b) => (b.type === "search_result" ? renderSearchResult(b) : b.type === "text" ? b.text : throwError(cannotSend(b, row)))).join("\n\n");
  return result.is_error && !text.startsWith("Error:") ? `Error: ${text}` : text;
}

/**
 * A Library passage as the model reads it: `Passage <id>: <heading>`, the credit header (the search result's block 0),
 * then one numbered sentence per line, `§n` being the result's block n, which is what a citation marker names
 * (cite-markers.ts). A sentence's own line breaks become spaces, so each sentence stays on its line.
 */
export function renderSearchResult(result: SearchResultBlock): string {
  const [header, ...sentences] = result.content.map((c) => c.text);
  const lines = [`Passage ${passageIdOf(result.source) ?? result.source}: ${result.title}`];
  if (header?.trim()) lines.push(header.trim());
  sentences.forEach((s, i) => lines.push(`§${i + 1} ${s.replace(/\s+/g, " ").trim()}`));
  return lines.join("\n");
}

/** The passages a request's (sliced) history returned from search_library, by id: what a reply's markers may cite. */
export function passagesIn(messages: Message[]): PassageResolver {
  const known = new Map<number, CitedPassage>();
  for (const m of fromLastCompaction(messages)) {
    if (!Array.isArray(m.content)) continue;
    for (const b of m.content) {
      if (b?.type !== "tool_result" || !Array.isArray(b.content)) continue;
      for (const r of b.content) {
        const id = r.type === "search_result" ? passageIdOf(r.source) : null;
        if (id !== null && r.type === "search_result") known.set(id, { title: r.title, sentences: Math.max(r.content.length - 1, 0) });
      }
    }
  }
  return (id) => known.get(id);
}

/** A text block of the transcript: citations only on a block that has some. */
export function textBlock(segment: CitedSegment): TextBlock {
  return segment.citations.length ? { type: "text", text: segment.text, citations: segment.citations } : { type: "text", text: segment.text };
}

/** A function call as a tool call; arguments that do not parse (a call cut off at the length limit) are kept raw. */
export function toolUseOf(call: Pick<ResponseFunctionToolCall, "call_id" | "name" | "arguments">): ToolUseBlock {
  try {
    return { type: "tool_use", id: call.call_id, name: call.name, input: JSON.parse(call.arguments) };
  } catch {
    return { type: "tool_use", id: call.call_id, name: call.name, input: {}, arguments: call.arguments };
  }
}

/** What separates two message items of one response in the reply: a paragraph break, so their sentences never run together. */
export const MESSAGE_BREAK = "\n\n";

/** A message item's text: its output text parts in order (a refusal part is not text). */
export function messageText(item: Extract<ResponseOutputItem, { type: "message" }>): string {
  return item.content.map((p) => (p.type === "output_text" ? p.text : "")).join("");
}

/**
 * A finished response as one step of the transcript: each message item's text cut into cited blocks (a message after
 * an earlier one with text starts on a new paragraph), each function call a tool call, then, for a completed response
 * only, one replay block holding the raw output. A response cut off at its length limit can end in a reasoning item
 * with nothing after it, which the API refuses when it is sent back, so such a step is always sent rebuilt from its
 * readable blocks. Why it stopped: a refusal (a refusal part, or output cut by the content filter) wins over
 * everything; a response cut at its length limit is `max_tokens`, even with a function call (its arguments may be cut
 * off, so it never runs); then `tool_use` for any call, else `end_turn`. A failed response throws.
 */
export function fromResponseOutput(
  output: ResponseOutputItem[],
  status: ResponseStatus | undefined,
  incompleteDetails: Response.IncompleteDetails | null | undefined,
  passages: PassageResolver,
  error?: ResponseError | null,
): Omit<StepResult, "usage"> {
  if (status === "failed" || status === "cancelled") {
    throw new ResponseFailed(error?.code ?? null, error?.message || `The response ended with status ${status}.`);
  }
  const content: Block[] = [];
  let refused = status === "incomplete" && incompleteDetails?.reason === "content_filter";
  let called = false;
  for (const item of output) {
    if (item.type === "message") {
      if (item.content.some((p) => p.type === "refusal")) refused = true;
      const text = messageText(item);
      const earlierText = content.some((b) => b.type === "text");
      if (text) content.push(...splitCited((earlierText ? MESSAGE_BREAK : "") + text, passages).map(textBlock));
    } else if (item.type === "function_call") {
      called = true;
      content.push(toolUseOf(item));
    }
  }
  if (status === "completed") content.push({ type: "replay", items: output });
  const stopReason: StopReason = refused ? "refusal" : status === "incomplete" ? "max_tokens" : called ? "tool_use" : "end_turn";
  return { content, stopReason };
}

function throwError(error: Error): never {
  throw error;
}
