import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { parse, stringify } from "yaml";
import { describe, expect, it } from "vitest";
import { testDb } from "@/test/pglite";
import { importCaseData } from "@/case-data/import";
import { scriptedClient } from "@/test/scripted-client";
import { messages, sessions as sessionsTable, settings, turns } from "@/db/schema";
import { APIError } from "@anthropic-ai/sdk";
import { sql } from "drizzle-orm";
import { describeFailure } from "./failures";
import { TUTOR_INSTRUCTIONS } from "./instructions";
import { OPENING_PREFIX } from "./context";
import { type Line, listSessions, loadCurrentSession, loadSession } from "./transcript";
import { latestTurn, runTutorTurn, type TurnEvent } from "./turn";
import { loadCourseMap, parseCourseMap, type CourseMap } from "@/course/map";
import { presentValueOnly } from "@/test/present-value-map";
import { openQuiz, submitQuiz } from "@/learner/quiz";
import { ensureTopicStarted, loadCheckResults, saveCheckResult, saveFinishedStep, saveJump, saveReturnToDefaultPath, learnerSummary } from "@/learner/memory";
import frozenWidgets from "@/widgets/frozen.generated.json";

async function collect(events: AsyncIterable<TurnEvent>) {
  const out: TurnEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

/** The real present value Topic alone, with its quiz Check removed (see src/test/present-value-map.ts). */
function withoutQuizChecks(real: CourseMap): CourseMap {
  return presentValueOnly({ real, withoutQuiz: true });
}

/** Moves the Learner to the Check step by saving progress directly, as earlier turns would have (one step per turn). */
async function advanceToCheck(db: Awaited<ReturnType<typeof testDb>>, map: CourseMap) {
  for (const step of ["story", "concept", "your_turn"] as const) await saveFinishedStep(db, map, step);
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
      expect(request.tools).toEqual([
        { name: "finish_teaching_step" },
        { name: "record_check_verdict" },
        { name: "search_library" },
        { name: "record_misconception" },
        { name: "calculate" },
        { name: "code_execution" },
      ]);
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
      const summary = await learnerSummary(db, map);
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

    it("tells the Tutor that made-up numbers before the reveal must not match the real outcome, and sends the Concept to take them from at the your-turn step", async () => {
      expect(TUTOR_INSTRUCTIONS).toContain("a made-up number must never match the Case's real outcome or anything else you know happened after the as-of date");
      expect(TUTOR_INSTRUCTIONS).toContain("Take hypothetical numbers from the Concept or Check prompt in the Course Navigator message");
      // The step where a live run leaked the outcome: code sends the Topic's Concept, never the reveal.
      const db = await testDb();
      for (const step of ["story", "concept"] as const) await saveFinishedStep(db, map, step);
      const { client, requests } = scriptedClient([{ content: [{ type: "text", text: "Suppose a rate went from 4% to 4.5%." }] }]);
      await collect(runTutorTurn({ db, client, map }, "Give me a move to practise on."));
      const [context] = systemTexts(requests[0]);
      expect(context).toContain("Teaching Step: your_turn");
      expect(context).toContain(`Concept: ${pv.concept.trim()}`);
      expect(context).not.toContain(pv.cases[0].reveal.trim());
    });

    it("the Tutor reports a finished Teaching Step through a tool, and code accepts only the next legal one", async () => {
      const db = await testDb();
    await ensureTopicStarted(db, map); // an earlier turn has shown the story
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
      expect(await learnerSummary(db, map)).toContain("Teaching Step: concept");
    });

    it("rejects finishing a Teaching Step that began during the same turn, so each step is taught in a reply the Learner answers", async () => {
      const db = await testDb();
    await ensureTopicStarted(db, map); // an earlier turn has shown the story
      const { client, requests } = scriptedClient([
        { content: [finish("story")] },
        { content: [finish("concept")] },
        { content: [{ type: "text", text: "Here is the concept." }] },
        { content: [finish("concept", "toolu_concept_again")] },
        { content: [{ type: "text", text: "Your turn." }] },
      ]);
      await collect(runTutorTurn({ db, client, map }, { continue: true }));
      const results = requests[2].messages.flatMap((m) =>
        Array.isArray(m.content) ? (m.content as { type: string; is_error?: boolean; content?: unknown }[]).filter((b) => b.type === "tool_result") : [],
      );
      expect(results[0]).not.toHaveProperty("is_error");
      expect(results[1]).toMatchObject({ is_error: true });
      expect(String(results[1].content)).toContain("began during this turn");
      expect(await learnerSummary(db, map)).toContain("Teaching Step: concept");

      // After the Learner replies, a new turn may finish the step.
      await collect(runTutorTurn({ db, client, map }, "Understood."));
      expect(await learnerSummary(db, map)).toContain("Teaching Step: your turn");
    });

    it("starts text written after a tool call on a new paragraph, so the streamed reply does not run two steps' sentences together", async () => {
      const db = await testDb();
      const { client } = scriptedClient([
        { content: [{ type: "text", text: "Story told." }, finish("story")] },
        { content: [{ type: "text", text: "Now the concept." }] },
      ]);
      const events = await collect(runTutorTurn({ db, client, map }, { continue: true }));
      const streamed = events.flatMap((e) => (e.type === "text" ? [e.text] : [])).join("");
      expect(streamed).toBe("Story told.\n\nNow the concept.");
    });

    it("a Topic started by this turn cannot have its first step finished in the same turn", async () => {
      const db = await testDb();
      const { client, requests } = scriptedClient([{ content: [finish("story")] }, { content: [{ type: "text", text: "The story." }] }]);
      await collect(runTutorTurn({ db, client, map }, { continue: true }));
      const [result] = requests[1].messages.flatMap((m) =>
        Array.isArray(m.content) ? (m.content as { type: string; is_error?: boolean; content?: unknown }[]).filter((b) => b.type === "tool_result") : [],
      );
      expect(result).toMatchObject({ is_error: true });
      expect(await learnerSummary(db, map)).toContain("Teaching Step: story");
    });

    it("tells the Tutor the pacing rule in its instructions", () => {
      expect(TUTOR_INSTRUCTIONS).toContain("never finish a step that began in the same turn");
    });

    it("saves the current Topic, Teaching Step and reveal, and they survive a new Session", async () => {
      const db = await testDb();
      const time = clock();
      await advanceToCheck(db, map);
      const { client, requests } = scriptedClient([
        { content: [{ type: "text", text: "Your Check." }] },
        { content: [{ type: "text", text: "Here is what happened." }] },
      ]);
      await collect(runTutorTurn({ db, client, map, now: time.now }, { continue: true }));
      // A Check result saved outside a turn (as a quiz will be).
      expect(await saveCheckResult(db, map, { checkId: pv.checks[0].id, passed: true })).toEqual({ ok: true, repeated: false });
      const summary = await learnerSummary(db, map);
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
      await advanceToCheck(db, map);
      const { client, requests } = scriptedClient([
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

    describe("jumps", () => {
      // The real present value Topic plus a later Topic that requires it.
      const twoTopics = (() => {
        const files = [
          ...map.topics.map((t) => ({ name: `${t.id}.yaml`, text: stringify(t) })),
          {
            name: "bonds.yaml",
            text: stringify({
              ...pv,
              id: "bonds",
              title: "Bond prices",
              path: 30,
              prerequisites: ["present-value"],
              cases: pv.cases.map((c) => ({ ...c, id: "bonds-case" })),
              checks: [{ id: "bonds-check", kind: "conversation", prompt: "Why do prices fall?", passCriteria: "Discounting." }],
              questions: undefined,
            }),
          },
        ];
        const { map: m, errors } = parseCourseMap(files);
        if (!m) throw new Error(errors.join("\n"));
        return m;
      })();
      const toolResults = (request: { messages: { content?: unknown }[] }) =>
        request.messages.flatMap((m) =>
          Array.isArray(m.content) ? (m.content as { type: string; is_error?: boolean; content?: unknown }[]).filter((b) => b.type === "tool_result") : [],
        );

      it("a jump warns of unmet prerequisites, then the next turn teaches the chosen Topic and tells the Tutor the Learner chose it", async () => {
        const db = await testDb();
        await ensureTopicStarted(db, twoTopics);
        expect(await saveJump(db, twoTopics, "bonds")).toMatchObject({ ok: true, unmetPrerequisites: ["present-value"] });
        const { client, requests } = scriptedClient([{ content: [{ type: "text", text: "Bonds, then." }] }]);
        await collect(runTutorTurn({ db, client, map: twoTopics }, { continue: true }));
        const [context] = systemTexts(requests[0]);
        expect(context).toContain("Topic: Bond prices");
        expect(context).toContain("Prerequisites not yet passed: present-value.");
        expect(context).toContain("The Learner chose this Topic on the Course Map");
        expect(await learnerSummary(db, twoTopics)).toContain("Bond prices");
      });

      it("a step entered by a jump into a part-finished Topic cannot be finished in that turn", async () => {
        const db = await testDb();
        await ensureTopicStarted(db, twoTopics);
        await saveFinishedStep(db, twoTopics, "story"); // present value is at its concept step
        await saveJump(db, twoTopics, "bonds");
        await ensureTopicStarted(db, twoTopics); // an earlier turn began bonds
        await saveJump(db, twoTopics, "present-value"); // back into present value, at its concept step
        const { client, requests } = scriptedClient([
          { content: [finish("concept")] },
          { content: [{ type: "text", text: "The concept, again." }] },
          { content: [finish("concept", "toolu_concept_later")] },
          { content: [{ type: "text", text: "Your turn." }] },
        ]);
        await collect(runTutorTurn({ db, client, map: twoTopics }, { continue: true }));
        expect(toolResults(requests[1])[0]).toMatchObject({ is_error: true });
        expect(String(toolResults(requests[1])[0].content)).toContain("began during this turn");
        expect(await learnerSummary(db, twoTopics)).toContain("Teaching Step: concept");

        // The next turn has taught it, so the step can now finish; the jump note is not repeated.
        await collect(runTutorTurn({ db, client, map: twoTopics }, "Understood."));
        expect(await learnerSummary(db, twoTopics)).toContain("Teaching Step: your turn");
        expect(systemTexts(requests[2]).filter((t) => t.includes("chose this Topic"))).toHaveLength(1);
      });

      it("going back to the default path is also a fresh entry, and the Topic left keeps its progress", async () => {
        const db = await testDb();
        await ensureTopicStarted(db, twoTopics);
        await saveFinishedStep(db, twoTopics, "story");
        await saveJump(db, twoTopics, "bonds");
        await ensureTopicStarted(db, twoTopics);
        await saveFinishedStep(db, twoTopics, "story"); // bonds at concept
        await saveReturnToDefaultPath(db, twoTopics);
        const { client, requests } = scriptedClient([{ content: [finish("concept")] }, { content: [{ type: "text", text: "Back to present value." }] }]);
        await collect(runTutorTurn({ db, client, map: twoTopics }, { continue: true }));
        expect(toolResults(requests[1])[0]).toMatchObject({ is_error: true });
        expect(String(systemTexts(requests[0]).at(-1))).toContain("Topic: Present value");
        await saveJump(db, twoTopics, "bonds");
        expect(await learnerSummary(db, twoTopics)).toContain("Teaching Step: concept");
      });

      it("an off-map question changes nothing: no tool call, same place", async () => {
        const db = await testDb();
        await ensureTopicStarted(db, twoTopics);
        await saveFinishedStep(db, twoTopics, "story");
        const before = await learnerSummary(db, twoTopics);
        const { client } = scriptedClient([{ content: [{ type: "text", text: "Inflation is a general rise in prices." }] }]);
        await collect(runTutorTurn({ db, client, map: twoTopics }, "Off topic: what is inflation?"));
        expect(await learnerSummary(db, twoTopics)).toBe(before);
      });
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
        await advanceToCheck(db, map);
        const { client, requests } = scriptedClient([
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
            text: stringify({ ...parse(yaml), stage: "foundation", path: 1, questions: undefined, checks: [...parse(yaml).checks.filter((c: { kind: string }) => c.kind === "conversation"), second] }),
          },
        ]).map!;
        const first = twoChecks.topic("present-value")!.checks[0];
        if (first.kind !== "conversation") throw new Error("expected a conversation Check");
        const db = await testDb();
        await advanceToCheck(db, map);
        const { client, requests } = scriptedClient([
          { content: [verdict({ check_id: first.id, verdict: "pass", reasons: "Discounted the payments." })] },
          { content: [{ type: "text", text: "On to the next part." }] },
        ]);
        await collect(runTutorTurn({ db, client, map: twoChecks }, { continue: true }));

        // What the Tutor had seen at each request: context messages and tool results.
        const seen = requests.map((r) => [...systemTexts(r), ...toolResults(r).map((b) => String(b.content))].join("\n"));
        const atCheck = 0; // the Learner was already at the Check
        for (const [i, text] of seen.entries()) {
          expect(text.includes(first.prompt.trim()), `request ${i}`).toBe(i >= atCheck);
          expect(text.includes(first.passCriteria.trim()), `request ${i}`).toBe(i >= atCheck);
          expect(text).not.toContain("SECOND PROMPT");
          expect(text).not.toContain("SECOND CRITERIA");
        }
      });

      it("a pass verdict with reasons moves the Learner past the Check", async () => {
        const db = await testDb();
        await advanceToCheck(db, map);
        const { client, requests } = scriptedClient([
          { content: [{ type: "text", text: "Why can both figures describe one prize?" }] },
          { content: [verdict({ check_id: checkId, verdict: "pass", reasons: "Discounted each payment and named the rate." })] },
          { content: [{ type: "text", text: "Well reasoned." }] },
        ]);
        await collect(runTutorTurn({ db, client, map }, { continue: true }));
        await collect(runTutorTurn({ db, client, map }, "Later payments are worth less today."));

        expect(requests[0].tools).toContainEqual({ name: "record_check_verdict" });
        expect(String(toolResults(requests.at(-1)!).at(-1)!.content)).toContain("Teaching Step: reveal");
        expect(await learnerSummary(db, map)).toContain("Teaching Step: reveal");
      });

      it("rejects a verdict in the turn that reached the Check step, so the Learner answers the prompt before a pass can be recorded", async () => {
        const db = await testDb();
        for (const step of ["story", "concept"] as const) await saveFinishedStep(db, map, step);
        const { client, requests } = scriptedClient([
          { content: [finish("your_turn")] },
          { content: [verdict({ check_id: checkId, verdict: "pass", reasons: "Too soon." })] },
          { content: [{ type: "text", text: "Here is the Check." }] },
        ]);
        await collect(runTutorTurn({ db, client, map }, "My working is done."));
        const result = toolResults(requests.at(-1)!).at(-1)!;
        expect(result).toMatchObject({ is_error: true });
        expect(String(result.content)).toContain("has not answered the Check prompt");
        expect(await loadCheckResults(db)).toHaveLength(0);
        expect(await learnerSummary(db, map)).toContain("Teaching Step: check");
      });

      it("code rejects a verdict for any other Check with a tool error, and saves nothing", async () => {
        const db = await testDb();
        const early = scriptedClient([
          { content: [verdict({ check_id: checkId, verdict: "pass", reasons: "Too early." }, "toolu_early")] },
          { content: [{ type: "text", text: "Story first." }] },
        ]);
        await collect(runTutorTurn({ db, client: early.client, map }, { continue: true }));
        const earlyResults = toolResults(early.requests.at(-1)!);
        await advanceToCheck(db, map);
        const { client, requests } = scriptedClient([
          { content: [verdict({ check_id: "some-other-check", verdict: "pass", reasons: "Wrong Check." }, "toolu_other")] },
          { content: [{ type: "text", text: "Let us take the Check." }] },
        ]);
        await collect(runTutorTurn({ db, client, map }, "Ready."));

        const results = toolResults(requests.at(-1)!);
        expect(earlyResults[0]).toMatchObject({ is_error: true, content: 'Error: No Check is being taken; the current Teaching Step is "story".' });
        expect(results.at(-1)).toMatchObject({
          is_error: true,
          content: `Error: Check "some-other-check" is not the current Check; the current Check is "${checkId}".`,
        });
        expect(await loadCheckResults(db)).toEqual([]);
        expect(await learnerSummary(db, map)).toContain("Teaching Step: check");
      });

      it("a Learner who doesn't pass stays at the Check, and evidence and the teaching model are saved", async () => {
        const db = await testDb();
        await advanceToCheck(db, map);
        const { client, requests } = scriptedClient([
          { content: [verdict({ check_id: checkId, verdict: "not_yet", reasons: "Added the payments without discounting." })] },
          { content: [{ type: "text", text: "Not yet. Try again." }] },
        ]);
        await collect(runTutorTurn({ db, client, map }, { continue: true }));

        expect(String(toolResults(requests.at(-1)!).at(-1)!.content)).toContain("not yet");
        expect(await learnerSummary(db, map)).toContain("Teaching Step: check");
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
        await advanceToCheck(db, map);
        const { client, requests } = scriptedClient([
          { content: [{ type: "text", text: "Why can both figures describe one prize?" }] },
          { content: [{ type: "text", text: "Say more about the rate." }] },
          { content: [verdict({ check_id: checkId, verdict: "not_yet", reasons: "No rate named." })] },
          { content: [{ type: "text", text: "Not yet." }] },
          { content: [{ type: "text", text: "Go on." }] },
        ]);
        await collect(runTutorTurn({ db, client, map }, { continue: true }));
        await collect(runTutorTurn({ db, client, map }, "Because of interest."));

        const second = requests[1].messages;
        expect(second.at(-2)).toMatchObject({ role: "user", content: "Because of interest." });
        expect(second.at(-1)).toMatchObject({ role: "system" });
        expect(String(second.at(-1)!.content)).toMatch(/No verdict was recorded for Check pv-jackpot-choice/);
        expect(String(second.at(-1)!.content)).toContain("Teaching Step: check");
        expect(await learnerSummary(db, map)).toContain("Teaching Step: check");

        // The next turn recorded a verdict (not yet), so the turn after gets no such note.
        await collect(runTutorTurn({ db, client, map }, "Interest compounds."));
        await collect(runTutorTurn({ db, client, map }, "Let me try again."));
        const fourth = requests.at(-1)!.messages;
        expect(fourth.at(-1)).toMatchObject({ role: "user", content: "Let me try again." });
      });

      it("a new Session after a turn that ended at a Check with no verdict opens by saying none was recorded", async () => {
        const db = await testDb();
        const time = clock();
        await advanceToCheck(db, map);
        const { client, requests } = scriptedClient([
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
        await advanceToCheck(db, map);
        const { client, requests } = scriptedClient([
          { content: [note("toolu_m1"), verdict({ check_id: checkId, verdict: "not_yet", reasons: "Compared undiscounted totals." })] },
          { content: [note("toolu_m1")] },
          { content: [{ type: "text", text: "Not yet." }] },
          { content: [{ type: "text", text: "Welcome back." }] },
        ]);
        await collect(runTutorTurn({ db, client, map, now: time.now }, { continue: true }));
        expect(String(toolResults(requests[1]).at(-2)!.content)).toContain("Recorded by code: misconception noted");

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
        await advanceToCheck(db, map);
        const same = verdict({ check_id: checkId, verdict: "not_yet", reasons: "Not discounted." }, "toolu_same");
        const { client } = scriptedClient([
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

    it("a correction cut off by max_tokens is handled like any cut-off: Continue is offered and a truncated tool call is not run", async () => {
      const db = await testDb();
      const map = withoutQuizChecks(loadCourseMap());
      await ensureTopicStarted(db, map); // an earlier turn has shown the story
      const truncated = { type: "tool_use", id: "toolu_cut_fix", name: "finish_teaching_step", input: { step: "story" } };
      const { client, requests } = scriptedClient([
        { content: [{ type: "text", text: bad }] },
        { content: [{ type: "text", text: "```openui-lang\nroot =" }, truncated], stop_reason: "max_tokens" },
        { content: [{ type: "text", text: "Carrying on." }] },
      ]);
      const events = await collect(runTutorTurn({ db, client, map }, "Show me"));
      expect(events).toContainEqual({ type: "cut_short", message: expect.stringMatching(/cut short/i) });
      expect(events.at(-1)).toMatchObject({ type: "done", stopReason: "max_tokens" });

      await collect(runTutorTurn({ db, client, map }, { continue: true }));
      const results = requests[2].messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((b) => b.type === "tool_result");
      expect(results).toEqual([{ type: "tool_result", tool_use_id: "toolu_cut_fix", is_error: true, content: expect.stringMatching(/Not run/) }]);
      expect(await learnerSummary(db, map)).toContain("Teaching Step: story");
    });

    it("a refused correction tells the Learner, like any refusal", async () => {
      const db = await testDb();
      const { client } = scriptedClient([
        { content: [{ type: "text", text: bad }] },
        { content: [{ type: "text", text: "I can't" }], stop_reason: "refusal" },
      ]);
      const events = await collect(runTutorTurn({ db, client }, "Show me"));
      expect(events).toContainEqual(expect.objectContaining({ type: "refusal" }));
      expect(events.at(-1)).toMatchObject({ type: "done", stopReason: "refusal" });
    });
  });
  describe("quiz Check", () => {
    const real = presentValueOnly();
    const quizId = "pv-quiz-discounting";
    const finish = (step: string) => ({ content: [{ type: "tool_use", id: `toolu_${step}`, name: "finish_teaching_step", input: { step } }] });
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
      await advanceToCheck(db, real);
      const { client, requests } = scriptedClient([text("Your quiz is below.")]);
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
      await advanceToCheck(db, real);
      const { client, requests } = scriptedClient([text("Your quiz is below."), text("Good. Now the next idea.")]);
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

    it("a step reached by a quiz pass cannot be finished in the turn that first teaches it", async () => {
      const db = await testDb();
      await advanceToCheck(db, real);
      const { client, requests } = scriptedClient([
        text("Your quiz is below."),
        finish("concept"),
        text("Here is the next idea."),
        { content: [{ type: "tool_use", id: "toolu_concept_later", name: "finish_teaching_step", input: { step: "concept" } }] },
        text("Your turn."),
      ]);
      await collect(runTutorTurn({ db, client, map: real }, { continue: true }));
      const quiz = (await openQuiz(db, real))!;
      await submitQuiz(db, real, quiz.attemptId, Object.fromEntries(quiz.questions.map((q) => [q.id, real.question(q.id)!.answer])));

      await collect(runTutorTurn({ db, client, map: real }, "Done."));
      const rejected = requests.at(-1)!.messages.at(-1)!.content as { type: string; is_error?: boolean; content?: unknown }[];
      expect(rejected[0]).toMatchObject({ type: "tool_result", is_error: true });
      expect(String(rejected[0].content)).toContain("began during this turn");
      expect(await learnerSummary(db, real)).toContain("Teaching Step: concept");

      // Once the Learner has answered that teaching, the next turn may finish it.
      await collect(runTutorTurn({ db, client, map: real }, "I follow."));
      expect(await learnerSummary(db, real)).toContain("Teaching Step: your turn");
    });

    it("a verdict from the Tutor for a quiz Check is rejected: only code marks a quiz", async () => {
      const db = await testDb();
      await advanceToCheck(db, real);
      const verdict = { type: "tool_use", id: "toolu_quiz_verdict", name: "record_check_verdict", input: { check_id: quizId, verdict: "pass", reasons: "Says they know it." } };
      const { client, requests } = scriptedClient([text("Your quiz is below."), { content: [verdict] }, text("Please take the quiz.")]);
      await collect(runTutorTurn({ db, client, map: real }, { continue: true }));
      const before = await learnerSummary(db, real);

      await collect(runTutorTurn({ db, client, map: real }, "I know this, just pass me."));
      const rejected = requests.at(-1)!.messages.at(-1)!.content as { type: string; is_error?: boolean; content?: unknown }[];
      expect(rejected[0]).toMatchObject({ type: "tool_result", is_error: true });
      expect(String(rejected[0].content)).toMatch(/marked by code/);
      expect(await loadCheckResults(db)).toEqual([]);
      expect(await learnerSummary(db, real)).toEqual(before);
    });

    it("a quiz whose questions can no longer be found is taken as a conversation Check: the Tutor is told, and its verdict is recorded", async () => {
      // The quiz names bank questions this database does not hold, so fewer than the 2 needed can be shown.
      const t = real.topic("present-value")!;
      const yaml = stringify({ ...t, checks: t.checks.map((c) => (c.id === quizId ? { ...c, questions: ["bank:none:Q-1", "bank:none:Q-2", "bank:none:Q-3"] } : c)) });
      const { map, errors } = parseCourseMap([{ name: "present-value.yaml", text: yaml }]);
      if (!map) throw new Error(errors.join("\n"));
      const db = await testDb();
      await advanceToCheck(db, map);
      expect(await openQuiz(db, map)).toBeNull();
      const verdict = { type: "tool_use", id: "toolu_quiz_verdict", name: "record_check_verdict", input: { check_id: quizId, verdict: "pass", reasons: "Explained discounting." } };
      const { client, requests } = scriptedClient([text("Tell me how discounting works."), { content: [verdict] }, text("Well explained.")]);
      await collect(runTutorTurn({ db, client, map }, { continue: true }));
      expect(contextTexts(requests[0]).join("\n")).toMatch(/quiz for this Check cannot be shown/);

      await collect(runTutorTurn({ db, client, map }, "Money later is worth less, because it could earn interest meanwhile."));
      expect(await loadCheckResults(db)).toMatchObject([{ checkId: quizId, passed: true }]);
    });

    it("tells the Tutor about a miss, even though the Learner's place did not change, and only once", async () => {
      const db = await testDb();
      await advanceToCheck(db, real);
      const { client, requests } = scriptedClient([text("Quiz below."), text("Let us look at it."), text("Fine.")]);
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
      await advanceToCheck(db, real);
      const { client, requests } = scriptedClient([text("Quiz below."), text("Welcome back.")]);
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

describe("surviving cut-offs and failures", () => {
  const map = withoutQuizChecks(loadCourseMap());
  const finish = (step: string, id = `toolu_${step}`) => ({ type: "tool_use", id, name: "finish_teaching_step", input: { step } });
  const text = (t: string) => ({ type: "text", text: t });

  it("only one turn runs at a time: a second send, from any device, gets a clear turn-in-progress response and changes nothing", async () => {
    const db = await testDb();
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    const first = scriptedClient([{ content: [text("Slow reply.")], hold }]);
    const running = collect(runTutorTurn({ db, client: first.client, map }, "First message"));
    await new Promise((r) => setTimeout(r, 20));

    const other = scriptedClient([{ content: [text("Should not run.")] }]);
    const events = await collect(runTutorTurn({ db, client: other.client, map }, "From my phone"));
    expect(events).toEqual([{ type: "busy", message: expect.stringMatching(/turn is in progress/i) }]);
    expect(other.requests).toHaveLength(0);

    release();
    await running;
    expect(noUsage(await loadCurrentSession(db))).toEqual([
      { role: "user", text: "First message" },
      { role: "assistant", text: "Slow reply." },
    ]);
    expect(await latestTurn(db)).toMatchObject({ status: "finished", stopReason: "end_turn" });
    // Once the first turn has finished, the next send runs.
    const after = scriptedClient([{ content: [text("Now it runs.")] }]);
    expect((await collect(runTutorTurn({ db, client: after.client, map }, "Again"))).at(-1)).toMatchObject({ type: "done" });
  });

  const types = (events: TurnEvent[]) => events.map((e) => e.type);
  const resultsIn = (request: { messages: { content?: unknown }[] }) =>
    request.messages.flatMap((m) =>
      Array.isArray(m.content) ? (m.content as { type: string; content?: unknown; is_error?: boolean; tool_use_id?: string }[]).filter((b) => b.type === "tool_result") : [],
    );

  it("a turn cut off by its time limit is saved as cut off, and the resume continues from the last saved loop step without repeating a write", async () => {
    const db = await testDb();
    await ensureTopicStarted(db, map); // an earlier turn has shown the story
    const first = scriptedClient([{ content: [finish("story")] }, { content: [text("Never saved.")], delayMs: 400 }]);
    const events = await collect(runTutorTurn({ db, client: first.client, map, timeBudgetMs: 150 }, { continue: true }));
    expect(events.at(-1)).toEqual({ type: "cut_off" });
    expect(await latestTurn(db)).toMatchObject({ status: "cut_off" });
    expect(await learnerSummary(db, map)).toContain("Teaching Step: concept");

    const resume = scriptedClient([{ content: [text("Now the concept.")] }]);
    const resumed = await collect(runTutorTurn({ db, client: resume.client, map }, { resume: true }));
    expect(types(resumed)).toEqual(["replay", "text", "done"]);
    // The finish_teaching_step call ran before the cut-off, but its result was never saved: it is re-run
    // under its tool call ID, returns the saved result, and the Learner moves on only once.
    const results = resultsIn(resume.requests[0]);
    expect(results).toHaveLength(1);
    expect(results[0]).not.toHaveProperty("is_error");
    expect(String(results[0].content)).toContain("Teaching Step: concept");
    expect(await learnerSummary(db, map)).toContain("Teaching Step: concept");
    expect(await latestTurn(db)).toMatchObject({ status: "finished" });
    // The Learner's message is stored once, and the unsaved step's text never was.
    expect(noUsage(await loadCurrentSession(db))).toEqual([
      { role: "user", text: "Continue." },
      { role: "assistant", text: "Now the concept." },
    ]);
  });

  it("a verdict saved before a cut-off is not saved again when the resume re-runs its tool call", async () => {
    const db = await testDb();
    const pv = map.topic("present-value")!;
    const checkId = pv.checks[0].id;
    await advanceToCheck(db, map);
    const verdict = { type: "tool_use", id: "toolu_v", name: "record_check_verdict", input: { check_id: checkId, verdict: "not_yet", reasons: "No discounting." } };
    const first = scriptedClient([{ content: [text("Your Check.")] }, { content: [verdict] }, { content: [text("Lost.")], delayMs: 400 }]);
    await collect(runTutorTurn({ db, client: first.client, map }, { continue: true }));
    await collect(runTutorTurn({ db, client: first.client, map, timeBudgetMs: 150 }, "The bigger number wins."));
    expect(await loadCheckResults(db)).toHaveLength(1);

    const resume = scriptedClient([{ content: [text("Not yet. Think about timing.")] }]);
    await collect(runTutorTurn({ db, client: resume.client, map }, { resume: true }));
    expect(await loadCheckResults(db)).toHaveLength(1);
    expect(String(resultsIn(resume.requests[0]).at(-1)!.content)).toContain("Recorded by code: not yet");
  });

  it("the resume replays the reply text saved so far, so text from the unsaved step is replaced on screen", async () => {
    const db = await testDb();
    const first = scriptedClient([{ content: [text("Saved part. "), finish("story")] }, { content: [text("Unsaved part.")], delayMs: 400 }]);
    const events = await collect(runTutorTurn({ db, client: first.client, map, timeBudgetMs: 150 }, { continue: true }));
    expect(events).toContainEqual({ type: "text", text: "Saved part. " });
    const resume = scriptedClient([{ content: [text("Resumed part.")] }]);
    const resumed = await collect(runTutorTurn({ db, client: resume.client, map }, { resume: true }));
    expect(resumed[0]).toEqual({ type: "replay", text: "Saved part. " });
  });

  it("resuming a turn whose final reply was already saved asks the model nothing and marks it finished", async () => {
    const db = await testDb();
    const first = scriptedClient([{ content: [text("All done.")] }]);
    await collect(runTutorTurn({ db, client: first.client, map }, "Hi"));
    // The function was killed after the final save, before the turn was marked finished.
    await db.update(turns).set({ status: "cut_off" });
    const resume = scriptedClient([]);
    const events = await collect(runTutorTurn({ db, client: resume.client, map }, { resume: true }));
    expect(types(events)).toEqual(["replay", "done"]);
    expect(events[0]).toEqual({ type: "replay", text: "All done." });
    expect(resume.requests).toHaveLength(0);
    expect(await latestTurn(db)).toMatchObject({ status: "finished" });
  });

  it("a resume after the turn already finished elsewhere just replays the saved reply", async () => {
    const db = await testDb();
    const first = scriptedClient([{ content: [text("Finished while you were offline.")] }]);
    await collect(runTutorTurn({ db, client: first.client, map }, "Hi"));
    const events = await collect(runTutorTurn({ db, client: scriptedClient([]).client, map }, { resume: true }));
    expect(events[0]).toEqual({ type: "replay", text: "Finished while you were offline." });
    expect(events.at(-1)).toMatchObject({ type: "done" });
  });

  it("a new message after a cut-off first answers the saved tool calls that had no result, then carries on", async () => {
    const db = await testDb();
    await ensureTopicStarted(db, map); // an earlier turn has shown the story
    const first = scriptedClient([{ content: [finish("story")] }, { content: [text("Lost.")], delayMs: 400 }]);
    await collect(runTutorTurn({ db, client: first.client, map, timeBudgetMs: 150 }, { continue: true }));
    const next = scriptedClient([{ content: [text("Where were we? The concept.")] }]);
    expect((await collect(runTutorTurn({ db, client: next.client, map }, "Hello?"))).at(-1)).toMatchObject({ type: "done" });
    const sent = next.requests[0].messages;
    expect(sent.findIndex((m) => m.role === "user" && m.content === "Hello?")).toBeGreaterThan(
      sent.findIndex((m) => JSON.stringify(m.content).includes('"tool_result"')),
    );
    expect(await learnerSummary(db, map)).toContain("Teaching Step: concept");
  });

  it("a turn left running by a killed function no longer blocks the next send", async () => {
    const db = await testDb();
    let t = Date.parse("2026-11-02T09:00:00Z");
    const now = () => new Date(t);
    await db.insert(turns).values({ status: "running", startedAt: now() });
    t += 6 * 60_000;
    const { client } = scriptedClient([{ content: [text("Here.")] }]);
    expect((await collect(runTutorTurn({ db, client, map, now }, "Hello"))).at(-1)).toMatchObject({ type: "done" });
  });

  it("max_tokens: the partial reply is kept as sent, the Learner is told it was cut short, a truncated tool call is not run, and Continue carries on", async () => {
    const db = await testDb();
    const partial = [text("A rupee today is worth"), finish("story", "toolu_cut")];
    const { client, requests } = scriptedClient([{ content: partial, stop_reason: "max_tokens" }, { content: [text("...more than a rupee next year.")] }]);
    const events = await collect(runTutorTurn({ db, client, map }, { continue: true }));
    expect(events).toContainEqual({ type: "cut_short", message: expect.stringMatching(/cut short/i) });
    expect(events.at(-1)).toMatchObject({ type: "done", stopReason: "max_tokens" });
    expect(await learnerSummary(db, map)).toContain("Teaching Step: story");

    await collect(runTutorTurn({ db, client, map }, { continue: true }));
    const sent = requests[1].messages;
    expect(sent).toContainEqual({ role: "assistant", content: partial });
    expect(resultsIn(requests[1])).toEqual([{ type: "tool_result", tool_use_id: "toolu_cut", is_error: true, content: expect.stringMatching(/Not run/) }]);
  });

  it("refusal: the declined reply is discarded, the Learner sees a plain message, their place doesn't change, and the next message starts a new Session from SQL", async () => {
    const db = await testDb();
    const { client, requests } = scriptedClient([
      { content: [text("Hello.")] },
      { content: [text("I can help with tha")], stop_reason: "refusal" },
      { content: [text("Back to present value.")] },
    ]);
    await collect(runTutorTurn({ db, client, map }, "Hi"));
    const events = await collect(runTutorTurn({ db, client, map }, "Something declined"));
    expect(events).toContainEqual({ type: "refusal", message: expect.stringMatching(/Nothing was changed/), text: "" });
    expect(await learnerSummary(db, map)).toContain("Teaching Step: story");
    // The partial reply is never stored.
    expect(noUsage(await loadCurrentSession(db)).map((l) => l.text)).not.toContain("I can help with tha");

    const next = await collect(runTutorTurn({ db, client, map }, "Let us go on"));
    expect(next).toContainEqual({ type: "session", reason: "refused" });
    expect(await listSessions(db)).toHaveLength(2);
    expect(requests.at(-1)!.messages).toHaveLength(1);
    expect(String(JSON.stringify(requests.at(-1)!.messages))).not.toContain("Something declined");
  });

  it("refusal after earlier loop steps saved progress: the Learner is told it was kept, and the saved reply text stays on screen", async () => {
    const db = await testDb();
    await ensureTopicStarted(db, map); // an earlier turn has shown the story
    const { client } = scriptedClient([
      { content: [text("Story done."), finish("story")] },
      { content: [text("I can help with tha")], stop_reason: "refusal" },
    ]);
    const events = await collect(runTutorTurn({ db, client, map }, "Go on"));
    const refusal = events.find((e) => e.type === "refusal");
    expect(refusal).toEqual({ type: "refusal", message: expect.stringMatching(/kept/), text: "Story done." });
    expect(refusal && "message" in refusal ? refusal.message : "").not.toContain("Nothing was changed");
    expect(await learnerSummary(db, map)).toContain("Teaching Step: concept");
  });

  it("a turn that fails before the Learner's message is stored can be retried, and the retry sends that message", async () => {
    const db = await testDb();
    await db.execute(sql`CREATE FUNCTION refuse_start() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'connection lost'; END $$ LANGUAGE plpgsql`);
    await db.execute(sql`CREATE TRIGGER refuse_start BEFORE INSERT ON topic_progress FOR EACH ROW EXECUTE FUNCTION refuse_start()`);
    const { client, requests } = scriptedClient([{ content: [text("Picture October 2018.")] }]);
    const failed = await collect(runTutorTurn({ db, client, map }, "Why discount?"));
    expect(failed.at(-1)).toMatchObject({ type: "error" });
    expect(await latestTurn(db)).toMatchObject({ status: "failed", sessionId: null });
    await db.execute(sql`DROP TRIGGER refuse_start ON topic_progress`);

    const retried = await collect(runTutorTurn({ db, client, map }, { resume: true }));
    expect(retried.at(-1)).toMatchObject({ type: "done" });
    expect(JSON.stringify(requests.at(-1)!.messages[0].content)).toContain("Why discount?");
    expect(noUsage(await loadCurrentSession(db))).toEqual([
      { role: "user", text: "Why discount?" },
      { role: "assistant", text: "Picture October 2018." },
    ]);
  });

  it("an API error or exhausted credits shows the reason and a retry, keeps everything saved, and Retry doesn't repeat the Learner's message", async () => {
    const db = await testDb();
    const credits = APIError.generate(402, { type: "error", error: { type: "billing_error", message: "Your credit balance is too low" } }, "402 billing", new Headers());
    const { client, requests } = scriptedClient([{ content: [text("First reply.")] }, { error: credits }, { content: [text("Answer after retry.")] }]);
    await collect(runTutorTurn({ db, client, map }, "Hello"));
    const failed = await collect(runTutorTurn({ db, client, map }, "Why discount?"));
    expect(failed.at(-1)).toEqual({ type: "error", kind: "credits", message: expect.stringMatching(/credits/i) });
    expect(await latestTurn(db)).toMatchObject({ status: "failed" });

    const retried = await collect(runTutorTurn({ db, client, map }, { resume: true }));
    expect(retried.at(-1)).toMatchObject({ type: "done" });
    expect(requests.at(-1)!.messages.at(-1)).toMatchObject({ role: "user", content: "Why discount?" });
    expect(noUsage(await loadCurrentSession(db))).toEqual([
      { role: "user", text: "Hello" },
      { role: "assistant", text: "First reply." },
      { role: "user", text: "Why discount?" },
      { role: "assistant", text: "Answer after retry." },
    ]);
  });

  it("describes rate limits, overload and spend limits plainly", () => {
    const err = (status: number, message = "x") => APIError.generate(status, { type: "error", error: { type: "e", message } }, message, new Headers());
    expect(describeFailure(err(429)).kind).toBe("rate_limit");
    expect(describeFailure(err(529)).kind).toBe("overloaded");
    expect(describeFailure(err(400, "You have reached your specified workspace API usage limits; spend limit")).kind).toBe("credits");
    expect(describeFailure(new Error("boom"))).toEqual({ kind: "error", message: expect.stringContaining("boom") });
  });

  it("if a progress write fails, the Tutor is told nothing was recorded, the Learner sees an error, and the Course Navigator doesn't advance", async () => {
    const db = await testDb();
    await ensureTopicStarted(db, map); // an earlier turn has shown the story
    await db.execute(sql`CREATE FUNCTION refuse_write() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'disk full'; END $$ LANGUAGE plpgsql`);
    await db.execute(sql`CREATE TRIGGER refuse_progress BEFORE UPDATE ON topic_progress FOR EACH ROW EXECUTE FUNCTION refuse_write()`);
    const { client, requests } = scriptedClient([{ content: [finish("story")] }, { content: [text("Sorry, that was not saved.")] }]);
    const events = await collect(runTutorTurn({ db, client, map }, { continue: true }));
    expect(events).toContainEqual({ type: "save_failed", message: expect.stringMatching(/could not be saved/i) });
    expect(resultsIn(requests[1])[0]).toMatchObject({ is_error: true, content: expect.stringMatching(/Nothing was recorded/) });
    await db.execute(sql`DROP TRIGGER refuse_progress ON topic_progress`);
    expect(await learnerSummary(db, map)).toContain("Teaching Step: story");
  });

  it("a changed fingerprint of instructions and tools starts a new Session from SQL, and the workspace is told", async () => {
    const db = await testDb();
    const { client } = scriptedClient([{ content: [text("One.")] }, { content: [text("Two.")] }]);
    await collect(runTutorTurn({ db, client, map }, "Hello"));
    // As if the Session was frozen by an earlier build.
    await db.update(sessionsTable).set({ fingerprint: "an-earlier-build" });
    const events = await collect(runTutorTurn({ db, client, map }, "Hello again"));
    expect(events[0]).toEqual({ type: "session", reason: "updated" });
    expect(await listSessions(db)).toHaveLength(2);
  });

  it("the calculate tool runs the tested formula and answers with formatted numbers; bad input is an error result the Tutor can read", async () => {
    const db = await testDb();
    const emi = { type: "tool_use", id: "toolu_emi", name: "calculate", input: { calculator: "emi", inputs: { principal: 5_000_000, ratePercent: 8.5, years: 20 } } };
    const bad = { type: "tool_use", id: "toolu_bad", name: "calculate", input: { calculator: "emi", inputs: { principal: 5_000_000 } } };
    const { client, requests } = scriptedClient([{ content: [emi] }, { content: [bad] }, { content: [text("Done.")] }]);
    await collect(runTutorTurn({ db, client, map }, "What is the EMI on 50 lakh?"));
    expect(JSON.stringify(resultsIn(requests[1])[0])).toContain("₹43,391.16");
    const failed = resultsIn(requests[2]).find((r) => (r as { tool_use_id: string }).tool_use_id === "toolu_bad");
    expect(failed).toMatchObject({ is_error: true });
    expect(JSON.stringify(failed)).toContain("ratePercent");
  });

  it("a misconception given a topic_id that isn't on the Course Map is saved under the current Topic, not lost", async () => {
    const db = await testDb();
    const time = Date.parse("2026-11-02T09:00:00Z");
    const note = { type: "tool_use", id: "toolu_m", name: "record_misconception", input: { description: "Adds payments without discounting.", topic_id: "Present value" } };
    const { client, requests } = scriptedClient([{ content: [note] }, { content: [text("Noted.")] }, { content: [text("Welcome back.")] }]);
    await collect(runTutorTurn({ db, client, map, now: () => new Date(time) }, { continue: true }));
    expect(resultsIn(requests[1])[0]).not.toHaveProperty("is_error");
    await collect(runTutorTurn({ db, client, map, now: () => new Date(time + 7 * 3600_000) }, { continue: true }));
    expect(JSON.stringify(requests.at(-1)!.messages[0])).toContain("Adds payments without discounting.");
  });

  it("on-demand compaction: once a Session grows past the setting, the runner is asked for a summary after the turn, and later requests start from it", async () => {
    const db = await testDb();
    await db.insert(settings).values({ key: "compact_at_tokens", value: "1000" }).onConflictDoUpdate({ target: settings.key, set: { value: "1000" } });
    const summary = { type: "compaction", content: "Summary of the Session so far.", encrypted_content: null, signature: "sig==" };
    const { client, requests } = scriptedClient([
      { content: [text("Short reply.")], usage: { input_tokens: 10, output_tokens: 5 } },
      { content: [text("Long reply.")], usage: { input_tokens: 5, cache_read_input_tokens: 2000, output_tokens: 50 } },
      { content: [summary], stop_reason: "compaction", usage: { input_tokens: 0, output_tokens: 0, iterations: [{ input_tokens: 2100, output_tokens: 300 }] } },
      { content: [text("Carrying on.")] },
    ]);
    await collect(runTutorTurn({ db, client, map }, "First"));
    expect(requests.filter((r) => r.compaction)).toHaveLength(0);
    const second = await collect(runTutorTurn({ db, client, map }, "Second"));
    expect(requests.filter((r) => r.compaction)).toHaveLength(1);
    // The summary is not streamed to the Learner, and its cost shows in the panel.
    expect(second.filter((e) => e.type === "text").map((e) => (e as { text: string }).text)).toEqual(["Long reply."]);
    const done = second.at(-1) as Extract<TurnEvent, { type: "done" }>;
    expect(done.usage.steps.at(-1)).toMatchObject({ tools: ["compaction"], inputTokens: 2100, outputTokens: 300 });

    await collect(runTutorTurn({ db, client, map }, "Third"));
    const third = requests.at(-1)!;
    expect(third.betas).toContain("compact-2026-09-04");
    expect(third.messages[0]).toEqual({ role: "assistant", content: [summary] });
    expect(third.messages[1]).toMatchObject({ role: "user", content: "Third" });
    // Context messages before the summary were summarised, so code sends the Course Navigator's context again.
    expect(third.messages[2]).toMatchObject({ role: "system" });
    expect(String(third.messages[2].content)).toContain("Course Navigator:");
    // Nothing is deleted: the whole Session still reads back in full.
    expect(noUsage(await loadCurrentSession(db)).map((l) => l.text)).toEqual(["First", "Short reply.", "Second", "Long reply.", "Third", "Carrying on."]);
  });

  it("a repeated finish_teaching_step under the same tool call ID has no second effect", async () => {
    const db = await testDb();
    await ensureTopicStarted(db, map); // an earlier turn has shown the story
    const same = finish("story", "toolu_same");
    const { client, requests } = scriptedClient([{ content: [same] }, { content: [same] }, { content: [text("Concept.")] }]);
    await collect(runTutorTurn({ db, client, map }, { continue: true }));
    const results = resultsIn(requests.at(-1)!);
    expect(results.map((r) => r.is_error ?? false)).toEqual([false, false]);
    expect(results[1].content).toEqual(results[0].content);
    expect(await learnerSummary(db, map)).toContain("Teaching Step: concept");
  });
});
