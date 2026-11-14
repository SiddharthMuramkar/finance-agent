import { createHash, randomBytes } from "node:crypto";
import { APIError } from "openai";
import { renderMarkers } from "@/tutor/cite-markers";
import { StepAborted, type Block, type CompactRequest, type Message, type ModelClient, type StepEvent, type StepRequest, type StepResult, type StepStream, type StopReason } from "@/tutor/model";
import { toInputItems } from "@/tutor/openai-items";
import type { ApiUsage } from "@/tutor/usage";

/** A content block as a test writes it: any block of the transcript format (model.ts), loosely typed. */
export type ScriptedBlock = Record<string, unknown> & { type: string };

export type ScriptedReply =
  | {
      content: ScriptedBlock[];
      stop_reason?: string;
      /** The step's usage, as OpenAI reports it. */
      usage?: ApiUsage;
      /** Waits this long before the reply starts, like a slow model call. */
      delayMs?: number;
      /** Waits for this promise before the reply starts. */
      hold?: Promise<unknown>;
      /** Streams the reply's first text, then waits for this promise (or an abort) before the rest: a reply still being written. */
      holdAfterFirstText?: Promise<unknown>;
    }
  /** The model call fails with this error. */
  | { error: Error };

/** A recorded request: a model step, or (`compaction: true`) a compaction. Tools are reduced to their names. */
export type ScriptedRequest = Omit<StepRequest, "tools"> & { tools: { name: string }[]; compaction?: boolean };

type Reply = Exclude<ScriptedReply, { error: Error }>;

export type ScriptedOptions = {
  /**
   * Plays OpenAI's replay check (spec 2026-11-12, "One new test double"; ADR 0016); on unless a test turns it off. Every
   * reasoning item a step returns is stamped with a fingerprint of its own step and of its turn up to it, and a request
   * is refused with the API's 400 when it replays a reasoning item from an edited step, a reasoning item in the current
   * turn whose turn no longer reads as it did (an edit before it, or an item from another turn: `current_turn`), a step
   * whose replay ends in a reasoning item, or an item id twice. Turn it off only in a test that deliberately sends
   * reasoning the double never stamped.
   */
  replayCheck?: boolean;
  /**
   * Gives every completed step a `replay` block, as the real client stores one (openai-items.ts): a reasoning item first,
   * then the step's message and function calls, so the replay check has something to check. On unless a test turns it
   * off: a test that compares stored content with exactly what it scripted (not with `responses`) would find a block it
   * never wrote. A scripted reply that brings its own `replay` block keeps it, its reasoning stamped.
   */
  reasoning?: boolean;
  /**
   * Streams each text block in pieces of this many characters, as the API streams a reply a few words at a time, so a
   * test can watch an own-question reply show sentence by sentence (A5). Left out, each block is one text event.
   */
  deltaChars?: number;
};

/**
 * Stands in for the model client at the Tutor Turn seam (model.ts): each model step takes the next scripted reply,
 * streams its text blocks (citations, then text, then the block's end, as the real client does) and records the
 * request. The real Tool Runner (runner.ts) runs the tools and loops, so tests exercise it. A reply's stop reason
 * defaults to `tool_use` when it holds a tool call and `end_turn` otherwise; `compact()` takes the next reply as
 * the summary. Like the real client, an aborted signal fails the open step. With the replay check on (the default), a
 * request the API would refuse for its replayed items fails on first read with the API's 400, and takes no scripted
 * reply (`replayRefusal`). `responses` holds what each step and compaction returned, in order (reasoning stamped), for a
 * test that compares stored history with it.
 */
export function scriptedClient(replies: ScriptedReply[], opts: ScriptedOptions = {}) {
  const replayCheck = opts.replayCheck ?? true;
  const requests: ScriptedRequest[] = [];
  const responses: { content: Block[] }[] = [];
  const record = (request: StepRequest | CompactRequest, extra: object = {}) =>
    requests.push(structuredClone({ ...request, tools: "tools" in request ? request.tools.map(({ name }) => ({ name })) : [], ...extra }) as ScriptedRequest);

  /** The next reply, waited for as scripted; an aborted signal or a scripted error fails it. */
  const take = () => {
    const reply = replies.shift();
    if (!reply) throw new Error("scripted client ran out of replies");
    return reply;
  };
  const start = async (reply: ScriptedReply, signal: AbortSignal | undefined, sent: Message[] | null): Promise<Reply> => {
    if (signal?.aborted) throw new StepAborted();
    if ("error" in reply) throw reply.error;
    if (reply.delayMs) await orAbort(new Promise((r) => setTimeout(r, reply.delayMs)), signal);
    if (reply.hold) await orAbort(reply.hold, signal);
    // What the model returns: a step's reasoning stamped against what was sent (a compaction summary is returned as is).
    const returned = sent ? { ...reply, content: withReasoning(reply, sent, opts.reasoning ?? true) } : reply;
    responses.push({ content: returned.content as Block[] });
    return returned;
  };

  const client: ModelClient = {
    step(request, options) {
      assertToolCallsAnswered(request.messages);
      const signal = options?.signal;
      record(request);
      // A refused request takes no scripted reply: the API answered it with an error.
      const refused = replayCheck ? replayRefusal(request.messages) : null;
      const reply: ScriptedReply = refused ? { error: refused } : take();
      let started: Promise<Reply> | undefined;
      const begin = () => (started ??= start(reply, signal, request.messages));
      let final: Promise<StepResult> | undefined;
      return {
        async *[Symbol.asyncIterator](): AsyncGenerator<StepEvent> {
          const r = await begin();
          let held = false;
          for (const [index, block] of (r.content as Block[]).entries()) {
            if (block.type !== "text") continue;
            checkAbort(signal);
            for (const citation of block.citations ?? []) yield { type: "citation", block: index, citation };
            const size = opts.deltaChars && opts.deltaChars > 0 ? opts.deltaChars : Math.max(1, block.text.length);
            for (let at = 0; at < block.text.length || at === 0; at += size) {
              checkAbort(signal);
              yield { type: "text", block: index, text: block.text.slice(at, at + size) };
              // A pause between pieces lets the turn pass each one on before the next arrives, as a live stream does.
              if (opts.deltaChars) await new Promise((r) => setTimeout(r, 0));
            }
            if (r.holdAfterFirstText && !held) {
              held = true;
              await orAbort(r.holdAfterFirstText, signal);
            }
            checkAbort(signal);
            yield { type: "block_stop", block: index };
          }
        },
        final: () =>
          (final ??= begin().then((r) => {
            checkAbort(signal);
            const content = r.content as Block[];
            const stopReason = (r.stop_reason ?? (content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn")) as StopReason;
            return { content, stopReason, usage: r.usage };
          })),
      } satisfies StepStream;
    },
    async compact(request, options) {
      record(request, { compaction: true });
      // A compaction reads the history it folds, replayed reasoning included: the same check.
      const refused = replayCheck ? replayRefusal(request.messages) : null;
      if (refused) throw refused;
      const r = await start(take(), options?.signal, null);
      return { content: r.content as Block[], stopReason: (r.stop_reason ?? "compaction") as StopReason, usage: r.usage };
    },
  };
  return { client, requests, responses };
}

function checkAbort(signal: AbortSignal | undefined) {
  if (signal?.aborted) throw new StepAborted();
}

/** Resolves like the promise, or fails once the signal aborts. */
function orAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) return reject(new StepAborted());
    signal?.addEventListener("abort", () => reject(new StepAborted()), { once: true });
    promise.then(resolve, reject);
  });
}

/** Mirrors the API's 400 for a function call with no output: every tool_use needs a tool_result in the next message. */
function assertToolCallsAnswered(messages: StepRequest["messages"]) {
  messages.forEach((m, i) => {
    if (m.role !== "assistant" || !Array.isArray(m.content)) return;
    const next = messages[i + 1];
    const answered = new Set(Array.isArray(next?.content) ? next.content.flatMap((b) => (b.type === "tool_result" ? [b.tool_use_id] : [])) : []);
    for (const b of m.content) {
      if (b.type === "tool_use" && !answered.has(b.id)) {
        throw new Error(`400 invalid_request_error: messages.${i}: function call ${b.id} has no output right after it`);
      }
    }
  });
}

// ---------------------------------------------------------------------------------------------------------------
// The replay check: how OpenAI treats the raw output a stateless request sends back (ADR 0015, ADR 0016)
// ---------------------------------------------------------------------------------------------------------------

/**
 * The model the double holds of the API (what a request with `store: false`, encrypted reasoning and
 * `reasoning.context: "current_turn"` may send back):
 * - A turn runs from a user message (the Learner's, or a correction code sent as the user; tool results are function call
 *   outputs, not user messages) or a compaction, to the next one. The current turn is the last one in the request.
 * - A reasoning item is bound to the step that wrote it and to its turn as it was sent up to that step. Its encrypted
 *   content here is the stamp `scripted-reasoning:<turn>:<step>`, two fingerprints of the readable history.
 * - Every replayed reasoning item is decrypted: one the double never stamped, or whose step no longer reads as it did
 *   (code edited its text or calls but kept its replay), is refused as not verified.
 * - A reasoning item in the current turn is read, so its turn must read as it did when it was written: a row left out,
 *   added or edited before it in that turn, or an item from another turn moved into it, is refused as not verified.
 *   Reasoning from an earlier turn is not read (`current_turn`), so an edit in its turn goes unseen.
 * - A reasoning item needs the item it led to after it in the same replay, and an item id may appear once.
 * The error is a 400 `invalid_request_error`, built as the SDK builds it, with a request id.
 */
export function replayRefusal(messages: Message[]): APIError | null {
  const seen = new Set<string>();
  const current = turnStart(messages);
  for (const [i, m] of messages.entries()) {
    if (m.role !== "assistant" || !Array.isArray(m.content)) continue;
    for (const block of m.content) {
      if (block?.type !== "replay") continue;
      const items = (Array.isArray(block.items) ? block.items : []) as { type?: string; id?: string; encrypted_content?: unknown }[];
      for (const item of items) {
        if (!item.id) continue;
        if (seen.has(item.id)) return refusal(messages, item.id, `Duplicate item found with id ${item.id}. Remove duplicate items from your input and try again.`, null);
        seen.add(item.id);
      }
      const last = items.at(-1);
      if (last?.type === "reasoning") {
        return refusal(messages, last.id ?? null, `Item '${last.id}' of type 'reasoning' was provided without its required following item.`, null);
      }
      for (const item of items) {
        if (item.type !== "reasoning") continue;
        const stamp = parseStamp(item.encrypted_content);
        const edited = !stamp || stamp.step !== fingerprint(readable(m.content));
        const moved = !edited && i >= current && stamp.turn !== fingerprint(messages.slice(turnStartBefore(messages, i), i).map(readableMessage));
        if (edited || moved) return refusal(messages, item.id ?? null, `The encrypted content for item ${item.id} could not be verified.`, "invalid_encrypted_content");
      }
    }
  }
  return null;
}

/** The API's 400 for a refused input item, with the item's place in the input (`input[n]`) as the parameter it blames. */
function refusal(messages: Message[], itemId: string | null, message: string, code: string | null): APIError {
  const requestId = `req_scripted_${randomBytes(6).toString("hex")}`;
  return APIError.generate(400, { error: { message, type: "invalid_request_error", param: inputParam(messages, itemId), code } }, message, new Headers({ "x-request-id": requestId }));
}

/** Where the item sits in what the adapter sends (the instructions are `input[0]`), as the API names it. */
function inputParam(messages: Message[], itemId: string | null): string {
  try {
    const at = toInputItems(messages).findIndex((item) => (item as { id?: string }).id === itemId);
    return at < 0 ? "input" : `input[${at + 1}]`;
  } catch {
    return "input";
  }
}

const STAMP = /^scripted-reasoning:([0-9a-f]{16}):([0-9a-f]{16})$/;

function parseStamp(content: unknown): { turn: string; step: string } | null {
  const m = typeof content === "string" ? STAMP.exec(content) : null;
  return m ? { turn: m[1], step: m[2] } : null;
}

/** Whether a message opens a turn: a user message with words (not only tool results), or a compaction. */
function opensTurn(m: Message): boolean {
  if (m.role === "user") return typeof m.content === "string" || m.content.some((b) => b?.type === "text");
  return Array.isArray(m.content) && m.content.some((b) => b?.type === "compaction");
}

/** The index of the message that opens the turn holding message `i` (0 when none does). */
function turnStartBefore(messages: Message[], i: number): number {
  for (let j = i - 1; j >= 0; j--) if (opensTurn(messages[j])) return j;
  return 0;
}

/** Where the current turn (the request's last) begins. */
function turnStart(messages: Message[]): number {
  return turnStartBefore(messages, messages.length);
}

/**
 * A step's content as the double returns it: with `reasoning`, a completed step that wrote a message or a call gets one
 * replay block, a reasoning item first; any reasoning item in the step's replay is stamped against what was sent.
 */
function withReasoning(reply: Reply, sent: Message[], reasoning: boolean): Block[] {
  const content = reply.content as Block[];
  const stopReason = reply.stop_reason ?? (content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn");
  const own = content.find((b) => b.type === "replay");
  // A step cut off at its length limit keeps no replay block, as the real client stores it (openai-items.ts).
  if (!own && (!reasoning || stopReason === "max_tokens" || stopReason === "compaction")) return content;
  const items = own ? (own.items as Record<string, unknown>[]) : [{ type: "reasoning", id: nextId("rs"), summary: [] }, ...outputItems(content)];
  if (!own && items.length === 1) return content;
  const stamp = `scripted-reasoning:${fingerprint(sent.slice(turnStart(sent)).map(readableMessage))}:${fingerprint(readable(content))}`;
  const replay = { type: "replay" as const, items: items.map((item) => (item.type === "reasoning" ? { ...item, encrypted_content: stamp } : item)) };
  return own ? content.map((b) => (b === own ? replay : b)) : [...content, replay];
}

/** A step's message and function call items, as OpenAI returns them after its reasoning. */
function outputItems(content: Block[]): Record<string, unknown>[] {
  const items: Record<string, unknown>[] = [];
  let text = "";
  const flush = (phase: "commentary" | "final_answer") => {
    if (text) items.push({ type: "message", id: nextId("msg"), role: "assistant", status: "completed", phase, content: [{ type: "output_text", text, annotations: [] }] });
    text = "";
  };
  for (const b of content) {
    if (b.type === "text") text += renderMarkers(b.text, b.citations);
    else if (b.type === "tool_use") {
      flush("commentary");
      items.push({ type: "function_call", id: nextId("fc"), call_id: b.id, name: b.name, arguments: b.arguments ?? JSON.stringify(b.input ?? {}), status: "completed" });
    }
  }
  flush("final_answer");
  return items;
}

/** Item ids unique across every client a test makes (each turn of a test has its own). */
let made = 0;
const RUN = randomBytes(3).toString("hex");
const nextId = (kind: string) => `${kind}_scripted${RUN}${(++made).toString(36)}`;

/** A message as it reads, without its raw output: what a fingerprint of history covers. */
function readableMessage(m: Message): unknown {
  return { role: m.role, content: readable(m.content) };
}

/** Content as it reads: text as one text block, and no `replay` block (leaving one out never changes what a step says). */
function readable(content: Message["content"]): unknown[] {
  if (typeof content === "string") return [{ type: "text", text: content }];
  return content.filter((b) => b?.type !== "replay");
}

/** A short fingerprint of a value, the same whatever order its keys come back in from the database. */
function fingerprint(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex").slice(0, 16);
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    return `{${entries
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
