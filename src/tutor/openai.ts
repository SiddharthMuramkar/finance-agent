import OpenAI from "openai";
import type { CompactedResponse, ResponseCompactParams, ResponseCreateParamsStreaming, ResponseStreamEvent } from "openai/resources/responses/responses";
import { CitationSplitter, type CitedSegment, type PassageResolver } from "./cite-markers";
import { StepAborted, TUTOR_MODEL, type ModelClient, type StepEvent, type StepRequest, type StepResult, type StepStream } from "./model";
import { fromResponseOutput, MESSAGE_BREAK, passagesIn, ResponseFailed, toInputItems, toResponseCreateParams } from "./openai-items";

/**
 * The real model client: gpt-6.1-sol through OpenAI's Responses API, one streamed request per model step
 * (openai-items.ts translates the transcript both ways). Nothing reaches OpenAI until a step is read: the SDK client
 * is made on the first step or compaction, because it throws when `OPENAI_API_KEY` is missing, and importing this
 * module must never need the key. Tests pass a fake `client`.
 *
 * Streaming: the reply's text is cut into cited blocks as it arrives (cite-markers.ts), and each finished block is
 * streamed as its text, its citations and its end, numbered as it is in the step's final content, so the reply shows
 * citation links at exactly the blocks it stores. The final content is built from the finished response's output, the
 * same text cut the same way. A failed response, an `error` event (which the SDK raises as an `APIError` before it
 * reaches here), or a stream that ends without finishing fails the step; an aborted signal fails it at once with
 * `StepAborted`, and the SDK drops the request.
 */

/** The part of the OpenAI client this uses. */
export type ResponsesApi = {
  responses: {
    create(body: ResponseCreateParamsStreaming, options?: { signal?: AbortSignal }): PromiseLike<AsyncIterable<ResponseStreamEvent>>;
    compact(body: ResponseCompactParams, options?: { signal?: AbortSignal }): PromiseLike<CompactedResponse>;
  };
};

export function openaiModelClient(options: { client?: ResponsesApi } = {}): ModelClient {
  let client = options.client;
  const responses = () => (client ??= new OpenAI()).responses;
  return {
    step(request, opts) {
      assertModel(request.model);
      return openaiStep(responses, request, opts?.signal);
    },
    async compact(request, opts) {
      assertModel(request.model);
      const signal = opts?.signal;
      checkAbort(signal);
      try {
        // The history only: old instructions never survive into the summary a refreeze folds the Session into.
        const input = toInputItems(request.messages);
        const compacted = await orAbort(Promise.resolve(responses().compact({ model: request.model, input }, { signal })), signal);
        return { content: [{ type: "compaction", items: compacted.output }], stopReason: "compaction", usage: compacted.usage };
      } catch (error) {
        throw signal?.aborted ? new StepAborted() : error;
      }
    },
  };
}

function assertModel(model: string) {
  if (model !== TUTOR_MODEL) throw new Error(`The OpenAI client runs ${TUTOR_MODEL} only; this request asked for "${model}".`);
}

/**
 * One step: the request starts on the first read (iterating, or `final()`), and its events are read to the end once,
 * whoever reads; iterating replays them as they arrive, and `final()` waits for the result.
 */
function openaiStep(responses: () => ResponsesApi["responses"], request: StepRequest, signal: AbortSignal | undefined): StepStream {
  // A block that cannot be sent fails the step now, before anything is sent.
  const params = toResponseCreateParams(request);
  const passages = passagesIn(request.messages);
  const events: StepEvent[] = [];
  let finished = false;
  let wake = () => {};
  let changed = new Promise<void>((resolve) => (wake = resolve));
  const notify = () => {
    const done = wake;
    changed = new Promise<void>((resolve) => (wake = resolve));
    done();
  };

  const run = async (): Promise<StepResult> => {
    checkAbort(signal);
    let it: AsyncIterator<ResponseStreamEvent> | undefined;
    try {
      const stream = await responses().create(params, { signal });
      it = stream[Symbol.asyncIterator]();
      const step = new StepEvents(passages, (event) => {
        events.push(event);
        notify();
      });
      for (;;) {
        const next = await orAbort(it.next(), signal);
        if (next.done) break;
        const result = step.take(next.value);
        if (result) return result;
      }
      checkAbort(signal);
      throw new Error("The OpenAI response stream ended before the response finished.");
    } catch (error) {
      throw signal?.aborted ? new StepAborted() : error;
    } finally {
      // Closes the request once its result is in (or it failed); the SDK aborts what is still open.
      void Promise.resolve(it?.return?.()).catch(() => {});
    }
  };

  let result: Promise<StepResult> | undefined;
  const start = () => {
    if (!result) {
      result = run().finally(() => {
        finished = true;
        notify();
      });
      // Read by `final()` or the iterator; a step nobody waits on must not raise an unhandled rejection.
      result.catch(() => {});
    }
    return result;
  };

  return {
    async *[Symbol.asyncIterator](): AsyncGenerator<StepEvent> {
      const done = start();
      for (let i = 0; ; ) {
        if (i < events.length) {
          checkAbort(signal);
          yield events[i++];
        } else if (finished) {
          await done;
          return;
        } else await changed;
      }
    },
    final: start,
  };
}

/**
 * Turns a response's stream events into the step's events. Output items stream one after another; a message item's
 * text goes through its own splitter, and its blocks are numbered after the blocks of the items before it (a function
 * call is one block), as `fromResponseOutput` lays out the final content.
 */
class StepEvents {
  /** Blocks of the output items already finished. */
  private base = 0;
  /** Text blocks streamed so far: a message item after one with text starts on a new paragraph, as in `fromResponseOutput`. */
  private texts = 0;
  private open = new Map<number, { splitter: CitationSplitter; first: number; count: number }>();

  constructor(
    private readonly passages: PassageResolver,
    private readonly emit: (event: StepEvent) => void,
  ) {}

  /** Takes one stream event; returns the step's result once the response has finished. */
  take(event: ResponseStreamEvent): StepResult | undefined {
    switch (event.type) {
      case "response.output_text.delta":
        this.segments(event.output_index, (s) => s.push(event.delta));
        return undefined;
      case "response.output_item.done":
        if (event.item.type === "message") this.endMessage(event.output_index);
        else if (event.item.type === "function_call") this.base += 1;
        return undefined;
      case "response.completed":
      case "response.incomplete": {
        for (const index of [...this.open.keys()]) this.endMessage(index);
        const r = event.response;
        return { ...fromResponseOutput(r.output, r.status, r.incomplete_details, this.passages, r.error), usage: r.usage };
      }
      case "response.failed":
        throw new ResponseFailed(event.response.error?.code ?? null, event.response.error?.message || "The response failed.");
      case "error":
        // Defensive: the SDK throws a stream's `error` event as an APIError before yielding it, so only a client that
        // yields raw events (a fake) gets here.
        throw new ResponseFailed(event.code, event.message || "The response stream reported an error.");
      default:
        return undefined;
    }
  }

  private segments(index: number, take: (splitter: CitationSplitter) => CitedSegment[]) {
    let item = this.open.get(index);
    if (!item) {
      const splitter = new CitationSplitter(this.passages);
      // Pushed before the item's own text, so its first block is cut exactly as the final content's.
      const lead = this.texts > 0 ? splitter.push(MESSAGE_BREAK) : [];
      this.open.set(index, (item = { splitter, first: this.base, count: 0 }));
      this.emitSegments(item, lead);
    }
    this.emitSegments(item, take(item.splitter));
  }

  private emitSegments(item: { first: number; count: number }, segments: CitedSegment[]) {
    for (const segment of segments) {
      this.texts++;
      const block = item.first + item.count++;
      this.emit({ type: "text", block, text: segment.text });
      for (const citation of segment.citations) this.emit({ type: "citation", block, citation });
      this.emit({ type: "block_stop", block });
    }
  }

  private endMessage(index: number) {
    const item = this.open.get(index);
    if (!item) return;
    this.segments(index, (s) => s.end());
    this.open.delete(index);
    this.base += item.count;
  }
}

function checkAbort(signal: AbortSignal | undefined) {
  if (signal?.aborted) throw new StepAborted();
}

/** Resolves like the promise, or fails once the signal aborts. */
function orAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) return reject(new StepAborted());
    const onAbort = () => reject(new StepAborted());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}
