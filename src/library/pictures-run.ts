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

// The paid half of reading pictures, with the Anthropic client passed in so a test can script it.
// scripts/library-pictures.mjs hands it the real client; nothing here reads a key or the network.
// Every step writes into the reading cache (`PictureReadings`), so a run that stops can simply be
// started again: whatever is already read is never read, or paid for, twice.

type Usage = { input_tokens: number; output_tokens: number };
type Message = { content: { type: string; text?: string }[]; stop_reason: string | null; usage: Usage };
type BatchEntry = { custom_id: string; result: { type: string; message?: Message; error?: unknown } };

/** The part of the Anthropic client these steps use. */
export type PictureClient = {
  messages: {
    create(params: ReturnType<typeof readParams>): PromiseLike<Message>;
    batches: {
      create(params: { requests: { custom_id: string; params: ReturnType<typeof readParams> }[] }): PromiseLike<{ id: string }>;
      retrieve(id: string): PromiseLike<{ id: string; processing_status: string; request_counts: Record<string, number> }>;
      results(id: string): PromiseLike<AsyncIterable<BatchEntry>>;
    };
  };
};

const textOf = (m: Message) => m.content.map((b) => (b.type === "text" ? (b.text ?? "") : "")).join("").trim();

/** A model's reply as a stored reading: NONE becomes no text, anything else gets the code checks. */
export function toReading(message: Message, model: string): PictureReading {
  const text = textOf(message);
  if (text.toUpperCase().replace(/\W/g, "") === NOTHING) return { text: null, model, stopReason: message.stop_reason, problems: [] };
  return { text, model, stopReason: message.stop_reason, problems: checkReading(text, message.stop_reason) };
}

/** Reads the first `count` unread pictures one at a time (the dry run on real pictures), caching each. Returns what was read and what it cost. */
export async function dryRun(client: PictureClient, urls: string[], readings: PictureReadings, count: number) {
  let cost = 0;
  const read: string[] = [];
  for (const url of unreadPictures(urls, readings).slice(0, count)) {
    const message = await client.messages.create(readParams(url));
    readings[url] = toReading(message, READER_MODEL);
    cost += actualCost(READER_MODEL, message.usage, false);
    read.push(url);
  }
  return { read, cost };
}

/** Sends every unread picture as one Message Batch. Returns the batch and which request is which picture, to be saved so a stopped run can resume. */
export async function submitBatch(client: PictureClient, urls: string[], readings: PictureReadings, { limit }: { limit?: number } = {}) {
  const todo = unreadPictures(urls, readings).slice(0, limit);
  if (!todo.length) return null;
  const batch = await client.messages.batches.create({ requests: todo.map((url) => ({ custom_id: pictureId(url), params: readParams(url) })) });
  return { id: batch.id, pictures: Object.fromEntries(todo.map((u) => [pictureId(u), u])) as Record<string, string> };
}

/**
 * Picks up a batch: while it is still processing, says so; once it has ended, caches every
 * reading that succeeded (a failed or expired one stays unread, to go in the next batch). Safe to run again.
 */
export async function collectBatch(client: PictureClient, batch: { id: string; pictures: Record<string, string> }, readings: PictureReadings) {
  const status = await client.messages.batches.retrieve(batch.id);
  if (status.processing_status !== "ended") return { done: false as const, counts: status.request_counts, added: 0, failed: 0, cost: 0 };
  let added = 0;
  let failed = 0;
  let cost = 0;
  for await (const entry of await client.messages.batches.results(batch.id)) {
    const url = batch.pictures[entry.custom_id];
    if (!url) continue;
    if (entry.result.type !== "succeeded" || !entry.result.message) {
      failed++;
      continue;
    }
    readings[url] = toReading(entry.result.message, READER_MODEL);
    cost += actualCost(READER_MODEL, entry.result.message.usage, true);
    added++;
  }
  return { done: true as const, counts: status.request_counts, added, failed, cost };
}

/** The stronger model reads a sample of the pictures again, one at a time, keeping its text for comparison. `rereads` is the cache, so a run that stops resumes. */
export async function recheck(client: PictureClient, readings: PictureReadings, rereads: Record<string, string>, n?: number) {
  const done = Object.keys(readings).filter((u) => readings[u].text !== null);
  let cost = 0;
  for (const url of pickSamples(done, n)) {
    if (rereads[url]) continue;
    const message = await client.messages.create(readParams(url, CHECKER_MODEL));
    rereads[url] = textOf(message);
    cost += actualCost(CHECKER_MODEL, message.usage, false);
  }
  return { cost };
}
