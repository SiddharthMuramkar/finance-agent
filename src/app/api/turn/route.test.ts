import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OWNER_LEARNER_ID, settings, turns } from "@/db/schema";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { CAP_MESSAGES } from "@/tutor/quota";
import { readSettings } from "@/tutor/session-log";
import type { StreamEvent, TurnDeps, TurnEvent, TurnInput, TutorClient } from "@/tutor/turn";

/** The /api/turn route: Stop answered at once, pings while a turn runs, progress in the stream. */

/** `admin`: the request's sign-in is the admin's (identity.admin, issue #33), whose turns have no daily cap of their own. */
const as = vi.hoisted(() => ({ db: undefined as unknown as Db, client: undefined as TutorClient | undefined, admin: false }));
vi.mock("@/db/client", () => ({ getDb: () => as.db }));
vi.mock("@/auth/session", () => ({ currentLearnerId: async () => OWNER_LEARNER_ID, currentTurnTaker: async () => ({ learnerId: OWNER_LEARNER_ID, admin: as.admin }) }));
vi.mock("@/tutor/tutor-client", () => ({ tutorClient: () => as.client }));
/** A Tutor Turn that stands in for the real one, when a test sets it: one that fails past its own catch. */
const fake = vi.hoisted(() => ({ turn: undefined as undefined | ((deps: TurnDeps, input: TurnInput) => AsyncGenerator<TurnEvent>) }));
vi.mock("@/tutor/turn", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/tutor/turn")>();
  return { ...real, runTutorTurn: (deps: TurnDeps, input: TurnInput) => (fake.turn ?? real.runTutorTurn)(deps, input) };
});

/** BotID's verdict (issue #33): `botid/server` is stubbed, a person by default; a test sets a bot or a check that throws. */
const HUMAN = { isHuman: true, isBot: false, isVerifiedBot: false, bypassed: false };
const BOT = { isHuman: false, isBot: true, isVerifiedBot: false, bypassed: false };
const botid = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock("botid/server", () => ({ checkBotId: botid.check }));

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

beforeEach(() => {
  botid.check.mockReset();
  botid.check.mockResolvedValue(HUMAN);
});
afterEach(() => {
  vi.useRealTimers();
  fake.turn = undefined;
  as.admin = false;
});

/** How many turns the database holds: a refused request must leave it at zero. */
const turnCount = async () => (await as.db.select({ id: turns.id }).from(turns)).length;

describe("POST /api/turn", () => {
  it("answers a Stop with nothing running as { stopping: false }, never a 409", async () => {
    as.db = await testDb();
    const response = await post({ stop: true });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ stopping: false });
  });

  it("answers a turn past a Spend cap with a 429 and the limit words, never a 409 a resume would wait out", async () => {
    as.db = await testDb();
    await readSettings(as.db);
    await as.db.update(settings).set({ value: "0" }).where(eq(settings.key, "usd_global_day"));
    const { client, requests } = scriptedClient([{ content: [{ type: "text", text: "Never sent." }] }]);
    as.client = client;
    const response = await post({ message: "Hello" });
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: CAP_MESSAGES.global_usd, limit: true });
    expect(requests).toHaveLength(0);
  });

  it("passes the admin's sign-in to the caps: their turn runs past a Learner's daily cap, anyone else's gets the 429", async () => {
    as.db = await testDb();
    await readSettings(as.db);
    await as.db.update(settings).set({ value: "0" }).where(eq(settings.key, "turns_per_learner_day"));
    const { client } = scriptedClient([{ content: [{ type: "text", text: "Present value is today's worth." }] }]);
    as.client = client;
    const capped = await post({ message: "Hello" });
    expect(capped.status).toBe(429);
    expect(await capped.json()).toEqual({ error: CAP_MESSAGES.learner_turns, limit: true });

    as.admin = true;
    const response = await post({ message: "Hello" });
    expect(response.status).toBe(200);
    await response.text();
    expect(await turnCount()).toBe(1);
  });

  it("opens the stream on the first progress, pings while the model is silent, and a Stop ends the turn", async () => {
    as.db = await testDb();
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { client } = scriptedClient([{ content: [{ type: "text", text: "Never sent." }], hold: new Promise(() => {}) }]);
    as.client = client;

    const response = await post({ message: "What is present value?" });
    expect(response.status).toBe(200);
    const next = reader(response);
    // The stream opened before any text: it names the turn that holds the lock, then says what the turn is doing.
    const started = await next();
    expect(started).toMatchObject({ type: "turn_started", turnId: expect.any(Number) });
    expect(await next()).toEqual({ type: "progress", label: "Looking up Case Data…" });

    // The model says nothing for a while: the route pings.
    vi.advanceTimersByTime(PING_MS);
    expect(await next()).toEqual({ type: "ping" });

    // Stop, from another request: the running turn sees it at its next poll.
    // A Stop naming another turn stops nothing; one naming this turn does.
    const turnId = (started as { turnId: number }).turnId;
    expect(await (await post({ stop: true, turn: turnId + 1 })).json()).toEqual({ stopping: false });
    expect(await (await post({ stop: true, turn: turnId })).json()).toEqual({ stopping: true });
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

  it("a failure past the turn's own catch reaches the Learner as the plain sentence with a reference, never the error's words (A3)", async () => {
    as.db = await testDb();
    fake.turn = async function* (deps) {
      deps.notify?.({ type: "progress", label: "Thinking…" });
      await new Promise((r) => setTimeout(r, 5));
      throw new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"messages.27.content.0: Invalid `signature`"},"request_id":"req_011"}');
    };
    const response = await post({ message: "What is present value?" });
    const next = reader(response);
    const events: StreamEvent[] = [];
    for (let e = await next(); e; e = await next()) events.push(e);
    expect(events.at(-1)).toEqual({ type: "error", kind: "error", message: expect.stringMatching(/^Something went wrong on our side\. Everything so far is saved\. Press Retry\. Reference: [2-9A-Z]{6}$/) });
    for (const word of ["400", "invalid_request_error", "request_id", "signature"]) expect(JSON.stringify(events)).not.toContain(word);
  });
});

describe("POST /api/turn: BotID Basic on the start of a turn (issue #33)", () => {
  it("a bot gets 403 { error: 'bot' } and no turn starts, for every kind of turn", async () => {
    as.db = await testDb();
    botid.check.mockResolvedValue(BOT);
    const started = vi.fn();
    fake.turn = async function* () {
      started();
    };
    for (const body of [{ message: "What is present value?" }, { opener: true }, { resume: true }, { next: "complete" }, { quizFollowUp: true }]) {
      const response = await post(body);
      expect(response.status, JSON.stringify(body)).toBe(403);
      expect(await response.json()).toEqual({ error: "bot" });
    }
    expect(started).not.toHaveBeenCalled();
    expect(await turnCount()).toBe(0);
  });

  it("a person gets the turn as before: checked once, with BotID's development verdict set to human", async () => {
    as.db = await testDb();
    as.client = scriptedClient([{ content: [{ type: "text", text: "Present value is today's worth of a later sum." }] }]).client;
    const response = await post({ message: "What is present value?" });
    expect(response.status).toBe(200);
    const next = reader(response);
    const events: StreamEvent[] = [];
    for (let e = await next(); e; e = await next()) events.push(e);
    expect(events.map((e) => e.type)).toContain("done");
    expect(await turnCount()).toBe(1);
    expect(botid.check).toHaveBeenCalledTimes(1);
    expect(botid.check).toHaveBeenCalledWith({ developmentOptions: { bypass: "HUMAN" } });
  });

  it("never checks a Stop, so a Stop always reaches the running turn", async () => {
    as.db = await testDb();
    botid.check.mockResolvedValue(BOT);
    const response = await post({ stop: true });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ stopping: false });
    expect(botid.check).not.toHaveBeenCalled();
  });

  it("checks nothing for a request it refuses anyway (no kind, an empty message)", async () => {
    as.db = await testDb();
    expect((await post({})).status).toBe(400);
    expect((await post({ message: "   " })).status).toBe(400);
    expect(botid.check).not.toHaveBeenCalled();
  });

  it("fails closed: a check that throws (Vercel OIDC off) starts no turn", async () => {
    as.db = await testDb();
    botid.check.mockRejectedValue(new Error("The 'x-vercel-oidc-token' header is missing from the request."));
    await expect(post({ message: "What is present value?" })).rejects.toThrow(/x-vercel-oidc-token/);
    expect(await turnCount()).toBe(0);
  });
});
