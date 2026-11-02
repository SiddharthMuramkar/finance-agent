import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { settings } from "@/db/schema";
import { TUTOR_INSTRUCTIONS } from "./instructions";
import { loadCurrentSession, runTutorTurn, type TurnEvent } from "./turn";

async function collect(events: AsyncIterable<TurnEvent>) {
  const out: TurnEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

describe("Tutor Turn", () => {
  it("streams the Tutor's reply and the Session is still there after a reload", async () => {
    const db = await testDb();
    const { client } = scriptedClient([
      { content: [{ type: "text", text: "Present value " }, { type: "text", text: "starts with a story." }] },
    ]);

    const events = await collect(runTutorTurn({ db, client }, "What is present value?"));

    expect(events).toEqual([
      { type: "text", text: "Present value " },
      { type: "text", text: "starts with a story." },
      { type: "done", stopReason: "end_turn" },
    ]);
    expect(await loadCurrentSession(db)).toEqual([
      { role: "user", text: "What is present value?" },
      { role: "assistant", text: "Present value starts with a story." },
    ]);
  });

  it("uses claude-sonnet-5-5 at medium effort from stored settings, frozen at Session start and replayed every request", async () => {
    const db = await testDb();
    const { client, requests } = scriptedClient([
      { content: [{ type: "text", text: "First." }] },
      { content: [{ type: "text", text: "Second." }] },
    ]);

    await collect(runTutorTurn({ db, client }, "Hello"));
    await db.update(settings).set({ value: "claude-haiku-5-5" }).where(eq(settings.key, "model"));
    await db.update(settings).set({ value: "high" }).where(eq(settings.key, "effort"));
    await collect(runTutorTurn({ db, client }, "And again"));

    for (const request of requests) {
      expect(request.model).toBe("claude-sonnet-5-5");
      expect(request.output_config).toEqual({ effort: "medium" });
      expect(request.system).toEqual([{ type: "text", text: TUTOR_INSTRUCTIONS }]);
      expect(request.tools).toEqual([]);
      expect(request.thinking).toEqual({ type: "adaptive" });
      expect(request.cache_control).toEqual({ type: "ephemeral" });
    }
  });

  it("stores assistant content unchanged, thinking blocks included, and replays history add-only", async () => {
    const db = await testDb();
    const firstReply = [
      { type: "thinking", thinking: "The Learner wants the idea first.", signature: "sig-abc123==" },
      { type: "text", text: "A rupee today is worth more than a rupee next year.", citations: null },
    ];
    const { client, requests } = scriptedClient([
      { content: firstReply },
      { content: [{ type: "redacted_thinking", data: "opaque==" }, { type: "text", text: "Because of interest." }] },
      { content: [{ type: "text", text: "Exactly." }] },
    ]);

    await collect(runTutorTurn({ db, client }, "Why discount?"));
    await collect(runTutorTurn({ db, client }, "Why is that?"));
    await collect(runTutorTurn({ db, client }, "Got it"));

    expect(requests[1].messages).toEqual([
      { role: "user", content: "Why discount?" },
      { role: "assistant", content: firstReply },
      { role: "user", content: "Why is that?" },
    ]);
    // Each request starts with exactly what the previous one sent and received.
    expect(requests[2].messages.slice(0, 3)).toEqual(requests[1].messages);
    expect(requests[2].messages[3]).toEqual({
      role: "assistant",
      content: [{ type: "redacted_thinking", data: "opaque==" }, { type: "text", text: "Because of interest." }],
    });
  });
});
