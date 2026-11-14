import { describe, expect, it } from "vitest";
import { pictureId, type PictureReadings } from "./pictures";
import { collectBatch, dryRun, recheck, submitBatch, toReading, type PictureClient } from "./pictures-run";

const reply = (text: string, stop = "end_turn") => ({
  output_text: text,
  status: stop === "max_tokens" ? "incomplete" : "completed",
  incomplete_details: stop === "max_tokens" ? { reason: "max_output_tokens" } : null,
  usage: { input_tokens: 1000, output_tokens: 400 },
});

type Params = { model: string; input: { content: { type: string; image_url?: string }[] }[] };
const urlOf = (params: Params) => params.input[0].content.find((c) => c.type === "input_image")!.image_url!;

/** A scripted client: no network. It answers each picture from `texts` and keeps what it was asked. */
function scripted(texts: Record<string, string>, { finished = true, failing = [] as string[], status = "completed" } = {}) {
  const calls = { create: [] as { model: string; url: string }[], batches: [] as string[][], lines: [] as { custom_id: string; method: string; url: string; body: Params }[] };
  let uploaded: File | undefined;
  const client: PictureClient = {
    responses: {
      create: async (params) => {
        calls.create.push({ model: (params as Params).model, url: urlOf(params as Params) });
        return reply(texts[urlOf(params as Params)] ?? "NONE");
      },
    },
    files: {
      create: async ({ file, purpose }) => {
        expect(purpose).toBe("batch");
        uploaded = file;
        const lines = (await file.text()).split("\n").map((l) => JSON.parse(l));
        calls.lines.push(...lines);
        calls.batches.push(lines.map((l) => urlOf(l.body)));
        return { id: "file_in" };
      },
      content: async (id) => {
        expect(id).toBe("file_out");
        // The output file holds the plain JSON body of each response, with no `output_text` getter.
        const out = Object.keys(texts)
          .filter((url) => !failing.includes(url))
          .map((url) => ({ custom_id: pictureId(url), response: { status_code: 200, body: { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: texts[url] }] }], usage: reply("").usage } } }));
        return { text: async () => out.map((l) => JSON.stringify(l)).join("\n") };
      },
    },
    batches: {
      create: async (params) => {
        expect(params).toEqual({ input_file_id: "file_in", endpoint: "/v1/responses", completion_window: "24h" });
        expect(uploaded).toBeDefined();
        return { id: "batch_1" };
      },
      retrieve: async () => ({ id: "batch_1", status: finished ? status : "in_progress", output_file_id: finished ? "file_out" : null, request_counts: { total: 3, completed: finished ? 3 : 0 } }),
    },
  };
  return { client, calls };
}

const texts = { "https://x/a": "Table\nA | 1\nB | 2\nTotal | 3", "https://x/b": "NONE", "https://x/c": "Chart\nGrowth | 5%" };

describe("the dry run", () => {
  it("reads only the first N unread pictures one at a time, and reports the cost", async () => {
    const { client, calls } = scripted(texts);
    const readings: PictureReadings = {};

    const { read, cost } = await dryRun(client, Object.keys(texts), readings, 2);

    expect(read).toEqual(["https://x/a", "https://x/b"]);
    expect(calls.create.map((c) => c.model)).toEqual(["gpt-6.1-sol", "gpt-6.1-sol"]);
    expect(readings["https://x/a"].text).toContain("Total | 3");
    expect(readings["https://x/b"].text).toBeNull();
    expect(cost).toBeCloseTo((2 * (1000 * 2 + 400 * 10)) / 1e6, 8);
  });

  it("does not read a cached picture again", async () => {
    const { client, calls } = scripted(texts);
    const readings: PictureReadings = { "https://x/a": toReading(reply("done"), "m") };

    await dryRun(client, Object.keys(texts), readings, 5);

    expect(calls.create.map((c) => c.url)).toEqual(["https://x/b", "https://x/c"]);
  });
});

describe("the batch run and its resume", () => {
  it("sends the unread pictures in one JSONL batch, then caches the results when the batch is finished", async () => {
    const { client, calls } = scripted(texts);
    const readings: PictureReadings = { "https://x/c": toReading(reply("kept"), "m") };

    const batch = await submitBatch(client, Object.keys(texts), readings);
    expect(calls.batches).toEqual([["https://x/a", "https://x/b"]]);
    expect(batch!.pictures[pictureId("https://x/a")]).toBe("https://x/a");
    // Each line is a /v1/responses request with the picture by address, nothing stored.
    expect(calls.lines[0]).toMatchObject({ custom_id: pictureId("https://x/a"), method: "POST", url: "/v1/responses", body: { model: "gpt-6.1-sol", store: false, reasoning: { effort: "medium" }, max_output_tokens: 16_000 } });
    expect(calls.lines[0].body.input[0].content[0]).toEqual({ type: "input_image", image_url: "https://x/a" });

    const result = await collectBatch(client, batch!, readings);
    expect(result).toMatchObject({ done: true, added: 2, failed: 0 });
    expect(result.cost).toBeCloseTo((2 * (1000 * 2 + 400 * 10) * 0.5) / 1e6, 8);
    expect(readings["https://x/c"].text).toBe("kept");
    expect(readings["https://x/a"].problems).toEqual([]);
  });

  it("says so while the batch is still processing, and adds nothing", async () => {
    const { client } = scripted(texts, { finished: false });
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

describe("a reading cut off by the length limit", () => {
  it("is stored with the stop word max_tokens, and a refusal with refusal", () => {
    expect(toReading(reply("Rev | 1", "max_tokens"), "m").stopReason).toBe("max_tokens");
    expect(toReading({ ...reply("No."), output: [{ type: "message", content: [{ type: "refusal" }] }] }, "m").stopReason).toBe("refusal");
    // Output cut by the content filter is not a whole reading either.
    expect(toReading({ ...reply("Rev | 1"), status: "incomplete", incomplete_details: { reason: "content_filter" } }, "m").stopReason).toBe("refusal");
  });

  it("an expired batch still yields the readings that finished, and counts the rest as failed", async () => {
    const { client } = scripted(texts, { failing: ["https://x/a"], status: "expired" });
    const readings: PictureReadings = {};
    const batch = await submitBatch(client, Object.keys(texts), readings);
    expect(await collectBatch(client, batch!, readings)).toMatchObject({ done: true, added: 2, failed: 1 });
  });
});

describe("the checker's re-read", () => {
  it("re-reads a sample with the checker model, only the ones not yet re-read", async () => {
    const { client, calls } = scripted({ "https://x/a": "Rev | 100", "https://x/c": "Rev | 7" });
    const readings: PictureReadings = {
      "https://x/a": toReading(reply("Rev | 100"), "m"),
      "https://x/b": toReading(reply("NONE"), "m"),
      "https://x/c": toReading(reply("Rev | 7"), "m"),
    };
    const rereads: Record<string, string> = { "https://x/a": "Rev | 100" };

    const { cost } = await recheck(client, readings, rereads, 40);

    expect(calls.create).toEqual([{ model: "gpt-6.1-sol", url: "https://x/c" }]);
    expect(rereads["https://x/c"]).toBe("Rev | 7");
    expect(cost).toBeCloseTo((1000 * 2 + 400 * 10) / 1e6, 8);
  });
});
