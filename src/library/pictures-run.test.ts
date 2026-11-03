import { describe, expect, it } from "vitest";
import { pictureId, type PictureReadings } from "./pictures";
import { collectBatch, dryRun, recheck, submitBatch, toReading, type PictureClient } from "./pictures-run";

const reply = (text: string, stop = "end_turn") => ({ content: [{ type: "text", text }], stop_reason: stop, usage: { input_tokens: 1000, output_tokens: 400 } });

/** A scripted client: no network. It answers each picture from `texts` and keeps what it was asked. */
function scripted(texts: Record<string, string>, { ended = true, failing = [] as string[] } = {}) {
  const calls = { create: [] as { model: string; url: string }[], batches: [] as string[][] };
  const urlOf = (params: { messages: { content: { source?: { url: string } }[] }[] }) => params.messages[0].content[0].source!.url;
  const client: PictureClient = {
    messages: {
      create: async (params) => {
        calls.create.push({ model: params.model, url: urlOf(params as never) });
        return reply(texts[urlOf(params as never)] ?? "NONE");
      },
      batches: {
        create: async ({ requests }) => {
          calls.batches.push(requests.map((r) => urlOf(r.params as never)));
          return { id: "batch_1" };
        },
        retrieve: async () => ({ id: "batch_1", processing_status: ended ? "ended" : "in_progress", request_counts: { processing: ended ? 0 : 2 } }),
        results: async () =>
          (async function* () {
            for (const url of Object.keys(texts)) {
              yield failing.includes(url)
                ? { custom_id: pictureId(url), result: { type: "errored", error: {} } }
                : { custom_id: pictureId(url), result: { type: "succeeded", message: reply(texts[url]) } };
            }
          })(),
      },
    },
  };
  return { client, calls };
}

const texts = { "https://x/a": "Table\nA | 1\nB | 2\nTotal | 3", "https://x/b": "NONE", "https://x/c": "Chart\nGrowth | 5%" };

describe("the dry run", () => {
  it("reads only the first N unread pictures with Haiku, one at a time, and reports the cost", async () => {
    const { client, calls } = scripted(texts);
    const readings: PictureReadings = {};

    const { read, cost } = await dryRun(client, Object.keys(texts), readings, 2);

    expect(read).toEqual(["https://x/a", "https://x/b"]);
    expect(calls.create.map((c) => c.model)).toEqual(["claude-haiku-5-5", "claude-haiku-5-5"]);
    expect(readings["https://x/a"].text).toContain("Total | 3");
    expect(readings["https://x/b"].text).toBeNull();
    expect(cost).toBeCloseTo((2 * (1000 * 0.1 + 400 * 0.5)) / 1e6, 8);
  });

  it("does not read a cached picture again", async () => {
    const { client, calls } = scripted(texts);
    const readings: PictureReadings = { "https://x/a": toReading(reply("done"), "m") };

    await dryRun(client, Object.keys(texts), readings, 5);

    expect(calls.create.map((c) => c.url)).toEqual(["https://x/b", "https://x/c"]);
  });
});

describe("the Batches run and its resume", () => {
  it("sends the unread pictures in one batch, then caches the results when the batch ends", async () => {
    const { client, calls } = scripted(texts);
    const readings: PictureReadings = { "https://x/c": toReading(reply("kept"), "m") };

    const batch = await submitBatch(client, Object.keys(texts), readings);
    expect(calls.batches).toEqual([["https://x/a", "https://x/b"]]);
    expect(batch!.pictures[pictureId("https://x/a")]).toBe("https://x/a");

    const result = await collectBatch(client, batch!, readings);
    expect(result).toMatchObject({ done: true, added: 2, failed: 0 });
    expect(result.cost).toBeCloseTo((2 * (1000 * 0.1 + 400 * 0.5) * 0.5) / 1e6, 8);
    expect(readings["https://x/c"].text).toBe("kept");
    expect(readings["https://x/a"].problems).toEqual([]);
  });

  it("says so while the batch is still processing, and adds nothing", async () => {
    const { client } = scripted(texts, { ended: false });
    const readings: PictureReadings = {};

    const result = await collectBatch(client, { id: "batch_1", pictures: { [pictureId("https://x/a")]: "https://x/a" } }, readings);

    expect(result).toMatchObject({ done: false, added: 0 });
    expect(readings).toEqual({});
  });

  it("leaves a failed request unread, so a resumed run sends only that one again", async () => {
    const { client, calls } = scripted(texts, { failing: ["https://x/a"] });
    const readings: PictureReadings = {};
    const urls = Object.keys(texts);

    const first = await submitBatch(client, urls, readings);
    expect(await collectBatch(client, first!, readings)).toMatchObject({ added: 2, failed: 1 });
    await submitBatch(client, urls, readings);

    expect(calls.batches[1]).toEqual(["https://x/a"]);
  });

  it("submits nothing when every picture is cached, and honours a limit", async () => {
    const { client, calls } = scripted(texts);
    const all: PictureReadings = Object.fromEntries(Object.keys(texts).map((u) => [u, toReading(reply("x"), "m")]));

    expect(await submitBatch(client, Object.keys(texts), all)).toBeNull();
    await submitBatch(client, Object.keys(texts), {}, { limit: 1 });
    expect(calls.batches).toEqual([["https://x/a"]]);
  });

  it("sends only the cut-off readings again, and a complete reading replaces the cut-off one", async () => {
    const { client, calls } = scripted({ "https://x/a": "Rev | 100", "https://x/b": "Rev | 7" });
    const readings: PictureReadings = {
      "https://x/a": toReading(reply("Rev | 1", "max_tokens"), "m"),
      "https://x/b": toReading(reply("Rev | 7"), "m"),
    };
    const batch = await submitBatch(client, Object.keys(readings), readings);
    expect(calls.batches).toEqual([["https://x/a"]]);
    await collectBatch(client, batch!, readings);
    expect(readings["https://x/a"]).toMatchObject({ text: "Rev | 100", stopReason: "end_turn" });
    expect(await submitBatch(client, Object.keys(readings), readings)).toBeNull();
  });

  it("runs the code checks on every reading it caches", async () => {
    const { client } = scripted({ "https://x/a": "A | B\n1 | 2 | 9\n3 | 4\n5 | 6\n7 | 8" });
    const readings: PictureReadings = {};
    const batch = await submitBatch(client, ["https://x/a"], readings);
    await collectBatch(client, batch!, readings);

    expect(readings["https://x/a"].problems[0]).toMatch(/table row/);
  });
});

describe("the stronger model's re-read", () => {
  it("re-reads a sample with Opus, only the ones not yet re-read", async () => {
    const { client, calls } = scripted({ "https://x/a": "Rev | 100", "https://x/c": "Rev | 7" });
    const readings: PictureReadings = {
      "https://x/a": toReading(reply("Rev | 100"), "m"),
      "https://x/b": toReading(reply("NONE"), "m"),
      "https://x/c": toReading(reply("Rev | 7"), "m"),
    };
    const rereads: Record<string, string> = { "https://x/a": "Rev | 100" };

    const { cost } = await recheck(client, readings, rereads, 40);

    expect(calls.create).toEqual([{ model: "claude-opus-5-5", url: "https://x/c" }]);
    expect(rereads["https://x/c"]).toBe("Rev | 7");
    expect(cost).toBeCloseTo((1000 * 4 + 400 * 20) / 1e6, 8);
  });
});
