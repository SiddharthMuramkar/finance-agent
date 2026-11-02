import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { parse, stringify } from "yaml";
import { describe, expect, it } from "vitest";
import { testDb } from "@/test/pglite";
import { importCaseData } from "@/case-data/import";
import { scriptedClient } from "@/test/scripted-client";
import { messages, settings } from "@/db/schema";
import { TUTOR_INSTRUCTIONS } from "./instructions";
import { OPENING_PREFIX, type Line, listSessions, loadCurrentSession, loadSession, runTutorTurn, type TurnEvent } from "./turn";
import { loadCourseMap, parseCourseMap, type CourseMap } from "@/course/map";
import { openQuiz, submitQuiz } from "@/learner/quiz";
import { loadCheckResults, saveCheckResult, workspaceSummary } from "@/learner/memory";
import frozenWidgets from "@/widgets/frozen.generated.json";

async function collect(events: AsyncIterable<TurnEvent>) {
  const out: TurnEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

/** The real Course Map with the quiz Checks removed from every Topic. */
function withoutQuizChecks(real: CourseMap): CourseMap {
  const files = real.topics.map((t) => ({
    name: `${t.id}.yaml`,
    text: stringify({ ...t, checks: t.checks.filter((c) => c.kind !== "quiz"), questions: undefined }),
  }));
  const { map, errors } = parseCourseMap(files);
  if (!map) throw new Error(errors.join("\n"));
  return map;
}

/** Lines without the usage panel data, which has its own tests. */
const noUsage = (lines: Line[]) => lines.map((l) => ({ role: l.role, text: l.text }));

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
      { type: "done", stopReason: "end_turn", usage: expect.any(Object) },
    ]);
    expect(noUsage(await loadCurrentSession(db))).toEqual([
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
      expect(request.tools).toEqual([{ name: "finish_teaching_step" }, { name: "record_check_verdict" }, { name: "record_misconception" }]);
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
    // These tests follow the conversation Check alone; the quiz Check has its own tests below.
    const map = withoutQuizChecks(loadCourseMap());
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
      // A Check result saved outside a turn (as a quiz will be).
      expect(await saveCheckResult(db, map, { checkId: pv.checks[0].id, passed: true })).toEqual({ ok: true, repeated: false });
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

    it("appends changed context mid-Session right after the Learner's message, where the API accepts it", async () => {
      const db = await testDb();
      const steps = ["story", "concept", "your_turn"];
      const { client, requests } = scriptedClient([
        ...steps.map((s) => ({ content: [finish(s)] })),
        { content: [{ type: "text", text: "Your Check." }] },
        { content: [{ type: "text", text: "Here is what happened." }] },
      ]);
      await collect(runTutorTurn({ db, client, map }, { continue: true }));
      await saveCheckResult(db, map, { checkId: pv.checks[0].id, passed: true });

      await collect(runTutorTurn({ db, client, map }, "What happened next?"));
      const sent = requests.at(-1)!.messages;
      expect(sent.at(-1)).toMatchObject({ role: "system" });
      expect(String(sent.at(-1)!.content)).toContain("Teaching Step: reveal");
      expect(sent.at(-2)).toMatchObject({ role: "user", content: "What happened next?" });
    });

    describe("Case Data", () => {
      const caseId = pv.cases[0].id;
      const dataset = (id: string, points: [string, number][], unit = "USD") => ({
        caseId,
        id,
        label: `Label ${id}`,
        unit,
        source: `Source of ${id}`,
        sourceUrl: "https://example.org/source",
        checkedOn: "2026-11-02",
        checkNote: "Compared with the source.",
        points: points.map(([date, value]) => ({ date, value })),
      });
      const seed = (db: Awaited<ReturnType<typeof testDb>>) =>
        importCaseData(db, [
          dataset("cash-option", [["2018-10-23", 877_800_000]]),
          dataset("long-yield", [["2018-07-02", 2.99], ["2018-10-24", 3.33], ["2019-03-04", 3.05]], "percent"),
          dataset("winner-choice", [["2019-03-04", 877_784_124]]),
        ]);

      it("tells the Tutor which Case Data it can show by reference, with sources, and nothing dated after the as-of date before the reveal", async () => {
        const db = await testDb();
        await seed(db);
        const { client, requests } = scriptedClient([{ content: [{ type: "text", text: "Picture October 2018." }] }]);
        await collect(runTutorTurn({ db, client, map }, { continue: true }));
        const [context] = systemTexts(requests[0]);
        expect(context).toContain(`"${caseId}/cash-option"`);
        expect(context).toContain("Source of cash-option");
        expect(context).toContain("877800000");
        expect(context).toContain(`"${caseId}/long-yield"`);
        expect(context).toContain("2018-10-24");
        expect(context).not.toContain("2019-03-04");
        expect(context).not.toContain("winner-choice");
        expect(context).toMatch(/if the Learner asks for data that is not listed, say plainly that it is not available/i);
      });

      it("from the reveal on, the Tutor's context lists the full datasets", async () => {
        const db = await testDb();
        await seed(db);
        const steps = ["story", "concept", "your_turn"];
        const { client, requests } = scriptedClient([
          ...steps.map((s) => ({ content: [finish(s)] })),
          { content: [{ type: "text", text: "Your Check." }] },
          { content: [{ type: "text", text: "Here is what happened." }] },
        ]);
        await collect(runTutorTurn({ db, client, map }, { continue: true }));
        await saveCheckResult(db, map, { checkId: pv.checks[0].id, passed: true });
        await collect(runTutorTurn({ db, client, map }, "What happened next?"));
        const context = String(requests.at(-1)!.messages.at(-1)!.content);
        expect(context).toContain("Teaching Step: reveal");
        expect(context).toContain(`"${caseId}/winner-choice"`);
        expect(context).toContain("2019-03-04");
      });

      it("when a Case has no Case Data, the context says so and tells the Tutor to say data is missing", async () => {
        const db = await testDb();
        const { client, requests } = scriptedClient([{ content: [{ type: "text", text: "Picture October 2018." }] }]);
        await collect(runTutorTurn({ db, client, map }, { continue: true }));
        const [context] = systemTexts(requests[0]);
        expect(context).toMatch(/Case Data: none is available for this Case/);
        expect(context).toMatch(/say plainly that it is not available/i);
      });
    });

    describe("conversation Check", () => {
      const checkId = pv.checks[0].id;
      const toCheck = () => ["story", "concept", "your_turn"].map((s) => ({ content: [finish(s)] }));
      const verdict = (input: Record<string, unknown>, id = "toolu_verdict") => ({
        type: "tool_use",
        id,
        name: "record_check_verdict",
        input,
      });
      const toolResults = (request: { messages: { content?: unknown }[] }) =>
        request.messages.flatMap((m) =>
          Array.isArray(m.content)
            ? (m.content as { type: string; content?: unknown; is_error?: boolean }[]).filter((b) => b.type === "tool_result")
            : [],
        );

      it("a conversation Check's prompt and pass criteria go to the Tutor only when that Check is current", async () => {
        const second = { id: "pv-second", kind: "conversation", prompt: "SECOND PROMPT", passCriteria: "SECOND CRITERIA" };
        const yaml = readFileSync(join(process.cwd(), "course/topics/present-value.yaml"), "utf8");
        const twoChecks = parseCourseMap([
          {
            name: "pv.yaml",
            text: stringify({ ...parse(yaml), questions: undefined, checks: [...parse(yaml).checks.filter((c: { kind: string }) => c.kind === "conversation"), second] }),
          },
        ]).map!;
        const first = twoChecks.topic("present-value")!.checks[0];
        if (first.kind !== "conversation") throw new Error("expected a conversation Check");
        const db = await testDb();
        const { client, requests } = scriptedClient([
          ...toCheck(),
          { content: [verdict({ check_id: first.id, verdict: "pass", reasons: "Discounted the payments." })] },
          { content: [{ type: "text", text: "On to the next part." }] },
        ]);
        await collect(runTutorTurn({ db, client, map: twoChecks }, { continue: true }));

        // What the Tutor had seen at each request: context messages and tool results.
        const seen = requests.map((r) => [...systemTexts(r), ...toolResults(r).map((b) => String(b.content))].join("\n"));
        const atCheck = 3; // after story, concept and your turn were finished
        for (const [i, text] of seen.entries()) {
          expect(text.includes(first.prompt.trim()), `request ${i}`).toBe(i >= atCheck);
          expect(text.includes(first.passCriteria.trim()), `request ${i}`).toBe(i >= atCheck);
          expect(text).not.toContain("SECOND PROMPT");
          expect(text).not.toContain("SECOND CRITERIA");
        }
      });

      it("a pass verdict with reasons moves the Learner past the Check", async () => {
        const db = await testDb();
        const { client, requests } = scriptedClient([
          ...toCheck(),
          { content: [{ type: "text", text: "Why can both figures describe one prize?" }] },
          { content: [verdict({ check_id: checkId, verdict: "pass", reasons: "Discounted each payment and named the rate." })] },
          { content: [{ type: "text", text: "Well reasoned." }] },
        ]);
        await collect(runTutorTurn({ db, client, map }, { continue: true }));
        await collect(runTutorTurn({ db, client, map }, "Later payments are worth less today."));

        expect(requests[0].tools).toContainEqual({ name: "record_check_verdict" });
        expect(String(toolResults(requests.at(-1)!).at(-1)!.content)).toContain("Teaching Step: reveal");
        expect(await workspaceSummary(db, map)).toContain("Teaching Step: reveal");
      });

      it("code rejects a verdict for any other Check with a tool error, and saves nothing", async () => {
        const db = await testDb();
        const { client, requests } = scriptedClient([
          verdict({ check_id: checkId, verdict: "pass", reasons: "Too early." }, "toolu_early"),
          ...toCheck(),
          { content: [verdict({ check_id: "some-other-check", verdict: "pass", reasons: "Wrong Check." }, "toolu_other")] },
          { content: [{ type: "text", text: "Let us take the Check." }] },
        ].map((r) => ("content" in r ? r : { content: [r] })));
        await collect(runTutorTurn({ db, client, map }, { continue: true }));

        const results = toolResults(requests.at(-1)!);
        expect(results[0]).toMatchObject({ is_error: true, content: 'Error: No Check is being taken; the current Teaching Step is "story".' });
        expect(results.at(-1)).toMatchObject({
          is_error: true,
          content: `Error: Check "some-other-check" is not the current Check; the current Check is "${checkId}".`,
        });
        expect(await loadCheckResults(db)).toEqual([]);
        expect(await workspaceSummary(db, map)).toContain("Teaching Step: check");
      });

      it("a Learner who doesn't pass stays at the Check, and evidence and the teaching model are saved", async () => {
        const db = await testDb();
        const { client, requests } = scriptedClient([
          ...toCheck(),
          { content: [verdict({ check_id: checkId, verdict: "not_yet", reasons: "Added the payments without discounting." })] },
          { content: [{ type: "text", text: "Not yet. Try again." }] },
        ]);
        await collect(runTutorTurn({ db, client, map }, { continue: true }));

        expect(String(toolResults(requests.at(-1)!).at(-1)!.content)).toContain("not yet");
        expect(await workspaceSummary(db, map)).toContain("Teaching Step: check");
        expect(await loadCheckResults(db)).toEqual([
          expect.objectContaining({
            checkId,
            topicId: "present-value",
            passed: false,
            evidence: "Added the payments without discounting.",
            model: "claude-sonnet-5-5",
          }),
        ]);
      });

      it("if a turn ends at a Check with no verdict, the Learner stays there and the next context message says none was recorded", async () => {
        const db = await testDb();
        const { client, requests } = scriptedClient([
          ...toCheck(),
          { content: [{ type: "text", text: "Why can both figures describe one prize?" }] },
          { content: [{ type: "text", text: "Say more about the rate." }] },
          { content: [verdict({ check_id: checkId, verdict: "not_yet", reasons: "No rate named." })] },
          { content: [{ type: "text", text: "Not yet." }] },
          { content: [{ type: "text", text: "Go on." }] },
        ]);
        await collect(runTutorTurn({ db, client, map }, { continue: true }));
        await collect(runTutorTurn({ db, client, map }, "Because of interest."));

        const second = requests[4].messages;
        expect(second.at(-2)).toMatchObject({ role: "user", content: "Because of interest." });
        expect(second.at(-1)).toMatchObject({ role: "system" });
        expect(String(second.at(-1)!.content)).toMatch(/No verdict was recorded for Check pv-jackpot-choice/);
        expect(String(second.at(-1)!.content)).toContain("Teaching Step: check");
        expect(await workspaceSummary(db, map)).toContain("Teaching Step: check");

        // The next turn recorded a verdict (not yet), so the turn after gets no such note.
        await collect(runTutorTurn({ db, client, map }, "Interest compounds."));
        await collect(runTutorTurn({ db, client, map }, "Let me try again."));
        const fourth = requests.at(-1)!.messages;
        expect(fourth.at(-1)).toMatchObject({ role: "user", content: "Let me try again." });
      });

      it("a new Session after a turn that ended at a Check with no verdict opens by saying none was recorded", async () => {
        const db = await testDb();
        const time = clock();
        const { client, requests } = scriptedClient([
          ...toCheck(),
          { content: [{ type: "text", text: "Why can both figures describe one prize?" }] },
          { content: [{ type: "text", text: "Welcome back." }] },
        ]);
        await collect(runTutorTurn({ db, client, map, now: time.now }, { continue: true }));
        time.advance(7 * HOUR);
        await collect(runTutorTurn({ db, client, map, now: time.now }, { continue: true }));
        expect(await listSessions(db)).toHaveLength(2);
        expect(systemTexts(requests.at(-1)!)[0]).toMatch(/No verdict was recorded for Check pv-jackpot-choice/);
      });

      it("the Tutor records a misconception through a tool, and a new Session's first message brings it up in code's summary", async () => {
        const db = await testDb();
        const time = clock();
        const note = (id: string) => ({
          type: "tool_use",
          id,
          name: "record_misconception",
          input: { description: "Treats the advertised total as the prize's value today." },
        });
        const { client, requests } = scriptedClient([
          ...toCheck(),
          { content: [note("toolu_m1"), verdict({ check_id: checkId, verdict: "not_yet", reasons: "Compared undiscounted totals." })] },
          { content: [note("toolu_m1")] },
          { content: [{ type: "text", text: "Not yet." }] },
          { content: [{ type: "text", text: "Welcome back." }] },
        ]);
        await collect(runTutorTurn({ db, client, map, now: time.now }, { continue: true }));
        expect(String(toolResults(requests[4]).at(-2)!.content)).toContain("Recorded by code: misconception noted");

        time.advance(7 * HOUR);
        await collect(runTutorTurn({ db, client, map, now: time.now }, { continue: true }));
        const opening = systemTexts(requests.at(-1)!)[0];
        expect(opening.startsWith(OPENING_PREFIX)).toBe(true);
        // Saved once despite the repeated tool call ID.
        expect(opening.match(/Treats the advertised total as the prize's value today\./g)).toHaveLength(1);
        expect(opening).toContain("Misconceptions noted:\n- Present value: Treats the advertised total");
        expect(opening).toContain("Last verdict at this Check: not yet. Compared undiscounted totals.");
      });

      it("a repeated verdict under the same tool call ID has no second effect", async () => {
        const db = await testDb();
        const same = verdict({ check_id: checkId, verdict: "not_yet", reasons: "Not discounted." }, "toolu_same");
        const { client } = scriptedClient([
          ...toCheck(),
          { content: [same] },
          { content: [same] },
          { content: [{ type: "text", text: "Try again." }] },
        ]);
        await collect(runTutorTurn({ db, client, map }, { continue: true }));
        expect(await loadCheckResults(db)).toHaveLength(1);
      });
    });

    it("rejects a Check result for a Check that is not current", async () => {
      const db = await testDb();
      expect(await saveCheckResult(db, map, { checkId: pv.checks[0].id, passed: true })).toEqual({
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
      expect(noUsage(await loadSession(db, oldest.id))).toEqual([
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
      expect(noUsage(await loadCurrentSession(db))).toEqual([
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
  describe("quiz Check", () => {
    const real = loadCourseMap();
    const quizId = "pv-quiz-discounting";
    const finish = (step: string) => ({ content: [{ type: "tool_use", id: `toolu_${step}`, name: "finish_teaching_step", input: { step } }] });
    const toQuiz = () => ["story", "concept", "your_turn"].map(finish);
    const text = (t: string) => ({ content: [{ type: "text", text: t }] });
    const contextTexts = (request: { messages: { role: string; content?: unknown }[] }) =>
      request.messages.flatMap((m) => {
        if (m.role === "system") return [String(m.content)];
        if (m.role === "user" && Array.isArray(m.content))
          return m.content.filter((b) => b.type === "text" && b.text.startsWith(OPENING_PREFIX)).map((b) => b.text as string);
        return [];
      });

    it("tells the Tutor the quiz is shown and marked by code, without any question text or key", async () => {
      const db = await testDb();
      const { client, requests } = scriptedClient([...toQuiz(), text("Your quiz is below.")]);
      await collect(runTutorTurn({ db, client, map: real }, { continue: true }));
      const context = requests.at(-1)!.messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).map((b) => JSON.stringify(b)).join("\n");
      expect(context).toContain(`Check: quiz ${quizId}`);
      expect(context).toContain("Do not write quiz questions");
      for (const q of real.topic("present-value")!.questions) {
        expect(context).not.toContain(q.prompt.trim());
        expect(context).not.toContain(q.explanation.trim());
      }
    });

    it("marking makes no model call, and the result reaches the Tutor right after the Learner's next message", async () => {
      const db = await testDb();
      const { client, requests } = scriptedClient([...toQuiz(), text("Your quiz is below."), text("Good. Now the next idea.")]);
      await collect(runTutorTurn({ db, client, map: real }, { continue: true }));
      const callsBefore = requests.length;

      const quiz = (await openQuiz(db, real))!;
      const answers = Object.fromEntries(quiz.questions.map((q) => [q.id, real.question(q.id)!.answer]));
      const result = await submitQuiz(db, real, quiz.attemptId, answers);
      expect(result).toMatchObject({ ok: true, passed: true });
      expect(requests).toHaveLength(callsBefore);

      await collect(runTutorTurn({ db, client, map: real }, "Done."));
      const sent = requests.at(-1)!.messages;
      expect(sent.at(-2)).toMatchObject({ role: "user", content: "Done." });
      expect(sent.at(-1)).toMatchObject({ role: "system" });
      const note = String(sent.at(-1)!.content);
      expect(note).toContain(`Quiz result by code, Check ${quizId}, attempt 1: 3 of 3 correct (needs 2).`);
      expect(note).toContain("Passed: code recorded the pass.");
      expect(note).toContain("Course Navigator:");
      expect(note).toContain("Teaching Step: concept");
    });

    it("tells the Tutor about a miss, even though the Learner's place did not change, and only once", async () => {
      const db = await testDb();
      const { client, requests } = scriptedClient([...toQuiz(), text("Quiz below."), text("Let us look at it."), text("Fine.")]);
      await collect(runTutorTurn({ db, client, map: real }, { continue: true }));
      const quiz = (await openQuiz(db, real))!;
      const first = quiz.questions[0];
      const wrong = first.choices.find((c) => c.id !== real.question(first.id)!.answer)!;
      await submitQuiz(db, real, quiz.attemptId, { [first.id]: wrong.id });

      await collect(runTutorTurn({ db, client, map: real }, "I missed some."));
      const note = String(requests.at(-1)!.messages.at(-1)!.content);
      expect(note).toContain("0 of 3 correct (needs 2).");
      expect(note).toContain("Not passed");
      expect(note).toContain(`The Learner chose "${wrong.text}"`);
      expect(note).not.toContain("No verdict was recorded");

      await collect(runTutorTurn({ db, client, map: real }, "And now?"));
      expect(requests.at(-1)!.messages.filter((m) => m.role === "system")).toHaveLength(1);
      expect(contextTexts(requests.at(-1)!).filter((t) => t.includes("Quiz result by code"))).toHaveLength(1);
    });

    it("carries a result into the opening message of a new Session", async () => {
      const db = await testDb();
      let t = Date.parse("2026-11-02T09:00:00Z");
      const now = () => new Date(t);
      const { client, requests } = scriptedClient([...toQuiz(), text("Quiz below."), text("Welcome back.")]);
      await collect(runTutorTurn({ db, client, map: real, now }, { continue: true }));
      const quiz = (await openQuiz(db, real, now()))!;
      await submitQuiz(db, real, quiz.attemptId, {}, now());
      t += 7 * 3600_000;
      await collect(runTutorTurn({ db, client, map: real, now }, { continue: true }));
      expect(requests.at(-1)!.messages[0].role).toBe("user");
      expect(contextTexts(requests.at(-1)!)[0]).toContain("Quiz result by code");
    });
  });
});
