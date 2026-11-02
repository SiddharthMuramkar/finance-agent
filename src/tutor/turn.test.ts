import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { messages, settings } from "@/db/schema";
import { TUTOR_INSTRUCTIONS } from "./instructions";
import { OPENING_PREFIX, listSessions, loadCurrentSession, loadSession, runTutorTurn, type TurnEvent } from "./turn";
import { loadCourseMap } from "@/course/map";
import { recordCheckResultForTest, workspaceSummary } from "@/learner/memory";
import frozenWidgets from "@/widgets/frozen.generated.json";

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
      expect(request.tools).toEqual([{ name: "finish_teaching_step" }]);
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

    // The first message opens with code's context (where the Learner stands and the Teaching Step), then the Learner's words.
    const [first, ...rest] = requests[1].messages;
    expect(first.role).toBe("user");
    expect(first.content).toEqual([
      { type: "text", text: expect.stringContaining(OPENING_PREFIX) },
      { type: "text", text: "Why discount?" },
    ]);
    expect(rest).toEqual([
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

  it("starts a new Session when the current one opens with a system message, which the API rejects", async () => {
    const db = await testDb();
    const { client, requests } = scriptedClient([{ content: [{ type: "text", text: "One." }] }, { content: [{ type: "text", text: "Two." }] }]);
    await collect(runTutorTurn({ db, client }, "Hello"));
    // An earlier build stored the opening context as a system message.
    await db.update(messages).set({ role: "system", content: "Where the Learner stands: old" }).where(eq(messages.seq, 0));
    await collect(runTutorTurn({ db, client }, "Again"));
    expect(await listSessions(db)).toHaveLength(2);
    expect(requests[1].messages[0].role).toBe("user");
  });

  describe("led by the Course Navigator", () => {
    const map = loadCourseMap();
    const pv = map.topic("present-value")!;
    const finish = (step: string, id = `toolu_${step}`) => ({
      type: "tool_use",
      id,
      name: "finish_teaching_step",
      input: { step },
    });
    const HOUR = 3600_000;
    const clock = (start = Date.parse("2026-11-02T09:00:00Z")) => {
      let t = start;
      return { now: () => new Date(t), advance: (ms: number) => (t += ms) };
    };
    // Context code sent the Tutor: appended system messages, and the opening block of a Session's first user message.
    const systemTexts = (request: { messages: { role: string; content?: unknown }[] }) =>
      request.messages.flatMap((m) => {
        if (m.role === "system") return [String(m.content)];
        if (m.role === "user" && Array.isArray(m.content))
          return m.content.filter((b) => b.type === "text" && b.text.startsWith(OPENING_PREFIX)).map((b) => b.text as string);
        return [];
      });

    it("opening the workspace makes no model call and shows a plain-text summary", async () => {
      const db = await testDb();
      const { client, requests } = scriptedClient([]);
      const summary = await workspaceSummary(db, map);
      expect(summary).toContain("Present value");
      expect(summary).toContain("Teaching Step: story");
      expect(requests).toHaveLength(0);
      void client;
    });

    it("tells the Tutor the Topic and Teaching Step in an appended message, withholding the reveal", async () => {
      const db = await testDb();
      const { client, requests } = scriptedClient([{ content: [{ type: "text", text: "Picture October 2018." }] }]);
      await collect(runTutorTurn({ db, client, map }, { continue: true }));
      const [context] = systemTexts(requests[0]);
      expect(context).toContain("Present value");
      expect(context).toContain("Teaching Step: story");
      expect(context).toContain(pv.cases[0].story.trim());
      expect(context).not.toContain(pv.cases[0].reveal.trim());
    });

    it("the Tutor reports a finished Teaching Step through a tool, and code accepts only the next legal one", async () => {
      const db = await testDb();
      const { client, requests } = scriptedClient([
        { content: [finish("reveal")] },
        { content: [finish("story")] },
        { content: [{ type: "text", text: "Now the concept." }] },
      ]);
      await collect(runTutorTurn({ db, client, map }, "Go on"));

      const results = requests[2].messages.flatMap((m) =>
        Array.isArray(m.content) ? (m.content as { type: string }[]).filter((b) => b.type === "tool_result") : [],
      );
      expect(results[0]).toMatchObject({
        is_error: true,
        content: 'Error: Cannot finish "reveal": the current Teaching Step is "story".',
      });
      expect(results[1]).not.toHaveProperty("is_error");
      expect(String((results[1] as unknown as { content: unknown }).content)).toContain("Teaching Step: concept");
      expect(await workspaceSummary(db, map)).toContain("Teaching Step: concept");
    });

    it("saves the current Topic, Teaching Step and reveal, and they survive a new Session", async () => {
      const db = await testDb();
      const time = clock();
      const steps = ["story", "concept", "your_turn"];
      const { client, requests } = scriptedClient([
        ...steps.map((s) => ({ content: [finish(s)] })),
        { content: [{ type: "text", text: "Your Check." }] },
        { content: [{ type: "text", text: "Here is what happened." }] },
      ]);
      await collect(runTutorTurn({ db, client, map, now: time.now }, { continue: true }));
      // Until the Check tickets land, a test-only path records the Check result.
      expect(await recordCheckResultForTest(db, map, pv.checks[0].id, true)).toEqual({ ok: true });
      const summary = await workspaceSummary(db, map);
      expect(summary).toContain("Teaching Step: reveal");
      expect(summary).toContain("The reveal has been shown.");

      time.advance(7 * HOUR);
      await collect(runTutorTurn({ db, client, map, now: time.now }, { continue: true }));
      const sessions = await listSessions(db);
      expect(sessions).toHaveLength(2);
      const fresh = requests.at(-1)!;
      // The API rejects a system message as the first message (live 400), so the opening context rides in the first user message.
      expect(fresh.messages[0].role).toBe("user");
      expect(systemTexts(fresh)[0]).toContain("Teaching Step: reveal");
      expect(systemTexts(fresh)[0]).toContain(pv.cases[0].reveal.trim());
    });

    it("rejects a test Check result for a Check that is not current", async () => {
      const db = await testDb();
      expect(await recordCheckResultForTest(db, map, pv.checks[0].id, true)).toEqual({
        ok: false,
        reason: 'No Check is being taken; the current Teaching Step is "story".',
      });
    });

    it("starts a new Session after six idle hours, as a changeable default, and old Sessions stay readable", async () => {
      const db = await testDb();
      const time = clock();
      const { client } = scriptedClient(
        Array.from({ length: 4 }, (_, i) => ({ content: [{ type: "text", text: `Reply ${i}` }] })),
      );
      await collect(runTutorTurn({ db, client, map, now: time.now }, "First"));
      time.advance(5 * HOUR);
      await collect(runTutorTurn({ db, client, map, now: time.now }, "Second"));
      expect(await listSessions(db)).toHaveLength(1);

      time.advance(6 * HOUR + 1000);
      await collect(runTutorTurn({ db, client, map, now: time.now }, "Third"));
      expect(await listSessions(db)).toHaveLength(2);

      await db.insert(settings).values({ key: "session_idle_hours", value: "1" }).onConflictDoUpdate({
        target: settings.key,
        set: { value: "1" },
      });
      time.advance(2 * HOUR);
      await collect(runTutorTurn({ db, client, map, now: time.now }, "Fourth"));
      const all = await listSessions(db);
      expect(all).toHaveLength(3);

      const oldest = all.at(-1)!;
      expect(await loadSession(db, oldest.id)).toEqual([
        { role: "user", text: "First" },
        { role: "assistant", text: "Reply 0" },
        { role: "user", text: "Second" },
        { role: "assistant", text: "Reply 1" },
      ]);
    });
  });

  describe("widgets", () => {
    const good = '```openui-lang\nroot = Widget("PV", [rate, chart])\n$rate = 3\nrate = Slider("rate", "Rate", 0, 10, 0.25, $rate, "percent")\nchart = AnnuityChart(1537000000, 30, 5, $rate)\n```';
    const bad = '```openui-lang\nroot = Widget("PV", [chart])\nchart = LineChart([1, 2, 3])\n```';

    it("freezes the generated widget instructions into the Session with the Tutor's instructions", async () => {
      const db = await testDb();
      const { client, requests } = scriptedClient([{ content: [{ type: "text", text: "Hi." }] }]);
      await collect(runTutorTurn({ db, client }, "Hello"));
      expect(requests[0].system[0].text).toContain(frozenWidgets.instructions);
    });

    it("a valid widget needs no correction turn", async () => {
      const db = await testDb();
      const { client, requests } = scriptedClient([{ content: [{ type: "text", text: `Try it.\n${good}\nDrag the rate.` }] }]);
      const events = await collect(runTutorTurn({ db, client }, "Show me"));
      expect(requests).toHaveLength(1);
      expect(events.some((e) => e.type === "correction")).toBe(false);
    });

    it("detects an invalid widget on the server, allows one correction turn, and the corrected widget replaces the broken one on reload", async () => {
      const db = await testDb();
      const { client, requests } = scriptedClient([
        { content: [{ type: "text", text: `Try it.\n${bad}\nDrag the rate.` }] },
        { content: [{ type: "text", text: good }] },
      ]);
      const events = await collect(runTutorTurn({ db, client }, "Show me"));

      expect(requests).toHaveLength(2);
      const correction = requests[1].messages.at(-1)!;
      expect(correction.role).toBe("user");
      expect(String(correction.content)).toMatch(/LineChart/);
      expect(events.map((e) => e.type)).toEqual(["text", "correction", "text", "done"]);

      // History stays add-only: both replies and the correction request are stored.
      expect(await loadCurrentSession(db)).toEqual([
        { role: "user", text: "Show me" },
        { role: "assistant", text: `Try it.\n${good}\nDrag the rate.` },
      ]);
    });

    it("gives up after one correction turn, leaving the browser to show a plain fallback", async () => {
      const db = await testDb();
      const { client, requests } = scriptedClient([
        { content: [{ type: "text", text: bad }] },
        { content: [{ type: "text", text: bad }] },
      ]);
      const events = await collect(runTutorTurn({ db, client }, "Show me"));
      expect(requests).toHaveLength(2);
      expect(events.filter((e) => e.type === "correction")).toHaveLength(1);
    });
  });
});
