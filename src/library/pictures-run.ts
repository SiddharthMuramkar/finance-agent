import {
  actualCost,
  CHECKER_MODEL,
  checkReading,
  NOTHING,
  pictureId,
  pickSamples,
  READER_MODEL,
  readParams,
  unreadPictures,
  type PictureReading,
  type PictureReadings,
} from "./pictures.ts";

// The paid half of reading pictures, with the OpenAI client passed in so a test can script it.
// scripts/library-pictures.mjs hands it the real client; nothing here reads a key or the network.
// Every step writes into the reading cache (`PictureReadings`), so a run that stops can simply be
// started again: whatever is already read is never read, or paid for, twice.

type Usage = { input_tokens: number; output_tokens: number; input_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number } | null };
/**
 * A Responses API response, as the SDK returns it (with its `output_text` getter) or as a batch's output line holds
 * it (the plain JSON body, where the text is in `output`).
 */
export type PictureResponse = {
  status?: string | null;
  incomplete_details?: { reason?: string } | null;
  output_text?: string;
  output?: { type: string; content?: { type: string; text?: string }[] }[];
  usage: Usage;
};
type BatchStatus = { id: string; status: string; output_file_id?: string | null; error_file_id?: string | null; request_counts?: Record<string, number> | null };

/** The part of the OpenAI client these steps use. */
export type PictureClient = {
  responses: { create(params: ReturnType<typeof readParams>): PromiseLike<PictureResponse> };
  files: {
    create(params: { file: File; purpose: "batch" }): PromiseLike<{ id: string }>;
    content(id: string): PromiseLike<{ text(): Promise<string> }>;
  };
  batches: {
    create(params: { input_file_id: string; endpoint: "/v1/responses"; completion_window: "24h" }): PromiseLike<{ id: string }>;
    retrieve(id: string): PromiseLike<BatchStatus>;
  };
};

/** The words of a reply: the SDK's `output_text`, or the text parts of the output when only the JSON body is at hand. */
const textOf = (m: PictureResponse): string =>
  (m.output_text ?? (m.output ?? []).flatMap((item) => (item.type === "message" ? (item.content ?? []) : [])).map((part) => (part.type === "output_text" ? (part.text ?? "") : "")).join("")).trim();

/**
 * Why the reply ended, in the words the cache keeps: `max_tokens` for a reading cut off at its limit, `refusal` for a
 * refusal part or output cut by the content filter (as for the Tutor and compose_widget), else `end_turn`.
 */
function stopReasonOf(m: PictureResponse): string {
  if ((m.output ?? []).some((item) => item.content?.some((part) => part.type === "refusal"))) return "refusal";
  if (m.status === "incomplete" && m.incomplete_details?.reason === "content_filter") return "refusal";
  return m.status === "incomplete" && m.incomplete_details?.reason === "max_output_tokens" ? "max_tokens" : "end_turn";
}

/** A model's reply as a stored reading: NONE becomes no text, anything else gets the code checks. */
export function toReading(message: PictureResponse, model: string): PictureReading {
  const text = textOf(message);
  const stopReason = stopReasonOf(message);
  if (text.toUpperCase().replace(/\W/g, "") === NOTHING) return { text: null, model, stopReason, problems: [] };
  return { text, model, stopReason, problems: checkReading(text, stopReason) };
}

/** Reads the first `count` unread pictures one at a time (the dry run on real pictures), caching each. Returns what was read and what it cost. */
export async function dryRun(client: PictureClient, urls: string[], readings: PictureReadings, count: number) {
  let cost = 0;
  const read: string[] = [];
  for (const url of unreadPictures(urls, readings).slice(0, count)) {
    const message = await client.responses.create(readParams(url));
    readings[url] = toReading(message, READER_MODEL);
    cost += actualCost(READER_MODEL, message.usage, false);
    read.push(url);
  }
  return { read, cost };
}

/** Sends every unread picture as one batch of /v1/responses requests (a JSONL file). Returns the batch and which request is which picture, to be saved so a stopped run can resume. */
export async function submitBatch(client: PictureClient, urls: string[], readings: PictureReadings, { limit }: { limit?: number } = {}) {
  const todo = unreadPictures(urls, readings).slice(0, limit);
  if (!todo.length) return null;
  const lines = todo.map((url) => JSON.stringify({ custom_id: pictureId(url), method: "POST", url: "/v1/responses", body: readParams(url) }));
  const file = await client.files.create({ file: new File([lines.join("\n")], "pictures.jsonl", { type: "application/jsonl" }), purpose: "batch" });
  const batch = await client.batches.create({ input_file_id: file.id, endpoint: "/v1/responses", completion_window: "24h" });
  return { id: batch.id, pictures: Object.fromEntries(todo.map((u) => [pictureId(u), u])) as Record<string, string> };
}

/** The lines of a batch's JSONL output or error file, parsed. */
const jsonLines = (text: string): { custom_id: string; response?: { status_code: number; body: PictureResponse } | null; error?: unknown }[] =>
  text.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));

/** The states a batch does not leave. An expired or cancelled one may still hold the requests that finished before it stopped. */
const FINISHED = new Set(["completed", "failed", "expired", "cancelled"]);

/**
 * Picks up a batch: while it is still processing, says so; once it has finished, caches every
 * reading that succeeded (a failed or expired one stays unread, to go in the next batch). Safe to run again.
 */
export async function collectBatch(client: PictureClient, batch: { id: string; pictures: Record<string, string> }, readings: PictureReadings) {
  const status = await client.batches.retrieve(batch.id);
  if (!FINISHED.has(status.status)) return { done: false as const, counts: status.request_counts, added: 0, failed: 0, cost: 0 };
  let added = 0;
  let cost = 0;
  const succeeded = new Set<string>();
  if (status.output_file_id) {
    for (const line of jsonLines(await (await client.files.content(status.output_file_id)).text())) {
      const url = batch.pictures[line.custom_id];
      if (!url) continue;
      // A line with an error or a non-200 status is a failed request, even if it sits in the output file.
      if (line.error || !line.response || line.response.status_code !== 200) continue;
      readings[url] = toReading(line.response.body, READER_MODEL);
      cost += actualCost(READER_MODEL, line.response.body.usage, true);
      succeeded.add(line.custom_id);
      added++;
    }
  }
  return { done: true as const, counts: status.request_counts, added, failed: Object.keys(batch.pictures).length - succeeded.size, cost };
}

/** The checker reads a sample of the pictures again, one at a time, keeping its text for comparison. `rereads` is the cache, so a run that stops resumes. */
export async function recheck(client: PictureClient, readings: PictureReadings, rereads: Record<string, string>, n?: number) {
  const done = Object.keys(readings).filter((u) => readings[u].text !== null);
  let cost = 0;
  for (const url of pickSamples(done, n)) {
    if (rereads[url]) continue;
    const message = await client.responses.create(readParams(url, CHECKER_MODEL));
    rereads[url] = textOf(message);
    cost += actualCost(CHECKER_MODEL, message.usage, false);
  }
  return { cost };
}
