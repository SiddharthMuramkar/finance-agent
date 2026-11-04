import { afterEach, describe, expect, it, vi } from "vitest";
import { OWNER_LEARNER_ID } from "@/db/schema";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import type { StreamEvent, TutorClient } from "@/tutor/turn";

/** The /api/turn route: Stop answered at once, pings while a turn runs, progress in the stream. */

const as = vi.hoisted(() => ({ db: undefined as unknown as Db, client: undefined as TutorClient | undefined }));
vi.mock("@/db/client", () => ({ getDb: () => as.db }));
vi.mock("@/auth/session", () => ({ currentLearnerId: async () => OWNER_LEARNER_ID }));
vi.mock("@/tutor/anthropic", () => ({ anthropicTutorClient: () => as.client }));

const { POST, PING_MS } = await import("./route");

const post = (body: unknown) => POST(new Request("https://app.example/api/turn", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

/** Reads the NDJSON stream one event at a time. */
function reader(response: Response) {
  const lines = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  return async function next(): Promise<StreamEvent | undefined> {
    for (;;) {
      const at = buffer.indexOf("\n");
      if (at !== -1) {
        const line = buffer.slice(0, at);
        buffer = buffer.slice(at + 1);
        return JSON.parse(line) as StreamEvent;
      }
      const { value, done } = await lines.read();
      if (done) return undefined;
      buffer += value;
    }
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/turn", () => {
  it("answers a Stop with nothing running as { stopping: false }, never a 409", async () => {
    as.db = await testDb();
    const response = await post({ stop: true });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ stopping: false });
  });

  it("opens the stream on the first progress, pings while the model is silent, and a Stop ends the turn", async () => {
    as.db = await testDb();
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { client } = scriptedClient([{ content: [{ type: "text", text: "Never sent." }], hold: new Promise(() => {}) }]);
    as.client = client;

    const response = await post({ message: "What is present value?" });
    expect(response.status).toBe(200);
    const next = reader(response);
    // The stream opened before any text: the turn said what it was doing.
    expect(await next()).toEqual({ type: "progress", label: "Looking up Case Data…" });

    // The model says nothing for a while: the route pings.
    vi.advanceTimersByTime(PING_MS);
    expect(await next()).toEqual({ type: "ping" });

    // Stop, from another request: the running turn sees it at its next poll.
    expect(await (await post({ stop: true })).json()).toEqual({ stopping: true });
    const rest: StreamEvent[] = [];
    for (let i = 0; i < 20 && rest.at(-1)?.type !== "done"; i++) {
      vi.advanceTimersByTime(500);
      const event = await next();
      if (event && event.type !== "ping") rest.push(event);
    }
    expect(rest.map((e) => e.type)).toEqual(["stopped", "done"]);
    expect(rest.at(-1)).toMatchObject({ stopReason: "stopped" });
    expect(await next()).toBeUndefined();
  });
});
