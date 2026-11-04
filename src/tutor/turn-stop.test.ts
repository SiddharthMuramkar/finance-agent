import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { messages, turns, OWNER_LEARNER_ID } from "@/db/schema";
import { scriptedClient } from "@/test/scripted-client";
import { testDb } from "@/test/pglite";
import { loadCurrentSession } from "./transcript";
import { loadSessionItems } from "./session-items";
import { STOPPED } from "./session-item-kinds";
import { runTutorTurn, STOP_POLL_MS, withoutOpenWidget, type TurnEvent } from "./turn";
import { requestStop } from "./turn-status";
import type { ProgressEvent } from "./tools";

/** Stop, keep-alive and progress (UX audit 4.2e, 5.11, 10.1a, 10.1c): every turn can be stopped and is never silent. */

const FENCE = "`".repeat(3);
const never = new Promise<never>(() => {});
const emi = { type: "tool_use", id: "toolu_stop_emi", name: "calculate", input: { calculator: "emi", inputs: { principal: 5_000_000, ratePercent: 8.5, years: 20 } } };

/** Resolves once the scripted client has been asked `n` times. */
async function asked(requests: unknown[], n: number) {
  while (requests.length < n) await new Promise((r) => setTimeout(r, 5));
}

async function collect(events: AsyncIterator<TurnEvent>) {
  const out: TurnEvent[] = [];
  for (let e = await events.next(); !e.done; e = await events.next()) out.push(e.value);
  return out;
}

describe("Stop", () => {
  it("ends a reply mid-stream within the poll window and drops the held reply: no text is shown or saved", async () => {
    const db = await testDb();
    const { client, requests } = scriptedClient([
      { content: [{ type: "text", text: `Here is the idea in a picture.\n\n${FENCE}openui-lang\nroot = Stack([` }], holdAfterFirstText: never },
    ]);
    const turn = collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "Show me present value"));
    await asked(requests, 1);

    expect(await requestStop(db, OWNER_LEARNER_ID)).toBe(true);
    const at = performance.now();
    const rest = await turn;
    expect(performance.now() - at).toBeLessThan(STOP_POLL_MS * 3);

    // "stopped", then the normal "done": the browser never resumes the turn. The held reply is dropped (ADR 0008).
    expect(rest.map((e) => e.type)).toEqual(["stopped", "done"]);
    expect(rest.at(-1)).toMatchObject({ type: "done", stopReason: "stopped" });
    const [row] = await db.select().from(turns).where(eq(turns.learnerId, OWNER_LEARNER_ID));
    expect(row).toMatchObject({ status: "finished", stopReason: "stopped" });
    expect(requests).toHaveLength(1);

    // The Learner's message stays; no reply was saved as the Tutor's.
    const lines = await loadCurrentSession(db, undefined, OWNER_LEARNER_ID);
    expect(lines.map((l) => l.role)).toEqual(["user"]);
    const stored = await db.select().from(messages);
    expect(JSON.stringify(stored)).not.toContain("Here is the idea");
    const sessionId = stored[0].sessionId;
    expect((await loadSessionItems(db, sessionId, OWNER_LEARNER_ID)).map((i) => i.kind)).toEqual([STOPPED]);
  });

  it("lets a running tool finish, answers every stored tool call, starts no new API call, and the next turn runs", async () => {
    const db = await testDb();
    let release: () => void = () => {};
    const toolDone = new Promise<void>((r) => (release = r));
    const { client, requests } = scriptedClient([
      { content: [{ type: "text", text: "Let me work that out." }, emi], stop_reason: "tool_use" },
      // The second call waits: by then the tool has run and its result is in the history.
      { content: [{ type: "text", text: "Never sent." }], hold: toolDone },
      { content: [{ type: "text", text: "Next turn." }] },
    ]);
    const turn = collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "What is the EMI?"));
    await asked(requests, 2);
    await requestStop(db, OWNER_LEARNER_ID);
    const rest = await turn;
    release();
    expect(rest.map((e) => e.type)).toEqual(["stopped", "done"]);
    // The text written before the tool call was held, and is never shown.
    expect((await loadCurrentSession(db, undefined, OWNER_LEARNER_ID)).map((l) => l.role)).toEqual(["user"]);
    // Only the first request was answered; the second never got a reply.
    expect(requests).toHaveLength(2);
    const stored = (await db.select().from(messages)).map((m) => m.role);
    expect(stored).toEqual(["user", "assistant", "user"]);

    // The history stays valid: the scripted client refuses a tool call with no result, as the API does.
    const next = await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "Go on"));
    expect(next.at(-1)).toMatchObject({ type: "done", stopReason: "end_turn" });
  });

  it("answers false when no turn is running, and a finished turn is not flagged", async () => {
    const db = await testDb();
    expect(await requestStop(db, OWNER_LEARNER_ID)).toBe(false);
    const { client } = scriptedClient([{ content: [{ type: "text", text: "Done." }] }]);
    await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "Hello"));
    expect(await requestStop(db, OWNER_LEARNER_ID)).toBe(false);
    const [row] = await db.select().from(turns);
    expect(row.stopReason).toBe("end_turn");
  });
});

describe("progress", () => {
  it("goes through notify in plain words: Case Data, thinking, then each tool by name", async () => {
    const db = await testDb();
    const { client } = scriptedClient([
      { content: [emi], stop_reason: "tool_use" },
      { content: [{ type: "text", text: "About ₹43,391 a month." }] },
    ]);
    const progress: ProgressEvent[] = [];
    const events = await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID, notify: (e) => progress.push(e) }, "What is the EMI?"));
    expect(events.at(-1)).toMatchObject({ type: "done" });
    expect(progress.map((p) => p.label)).toEqual(["Looking up Case Data…", "Thinking…", "Working out the numbers…", "Thinking…", "Checking the reply…"]);
  });
});

describe("withoutOpenWidget", () => {
  it("cuts an unclosed Widget fence and keeps finished ones", () => {
    const done = `${FENCE}openui-lang\nroot = Card([])\n${FENCE}`;
    expect(withoutOpenWidget(`Before.\n\n${done}\n\nAfter.\n\n${FENCE}openui-lang\nroot = St`)).toBe(`Before.\n\n${done}\n\nAfter.`);
    expect(withoutOpenWidget(`Just words.\n\n${FENCE}open`)).toBe("Just words.");
    expect(withoutOpenWidget(`${FENCE}openui-lang\nroot =`)).toBe("");
    expect(withoutOpenWidget(`Plain. ${done}`)).toBe(`Plain. ${done}`);
  });
});
