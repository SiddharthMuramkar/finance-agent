import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { parse, stringify } from "yaml";
import { describe, expect, it } from "vitest";
import { engineOff } from "@/test/engine-off";
import { testDb } from "@/test/pglite";
import { importCaseData } from "@/case-data/import";
import { scriptedClient } from "@/test/scripted-client";
import { messages, sessions as sessionsTable, settings, turns, OWNER_LEARNER_ID } from "@/db/schema";
import { APIError } from "@anthropic-ai/sdk";
import { sql } from "drizzle-orm";
import { describeFailure } from "./failures";
import { TUTOR_INSTRUCTIONS } from "./instructions";
import { OPENING_PREFIX } from "./context";
import { plainFormulaText } from "@/finance/formula-text";
import { type Line, listSessions, loadCurrentSession, loadSession } from "./transcript";
import { latestTurn, runTutorTurn, type TurnEvent } from "./turn";
import { loadCourseMap, parseCourseMap, type CourseMap } from "@/course/map";
import { presentValueOnly } from "@/test/present-value-map";
import { openQuiz, submitQuiz } from "@/learner/quiz";
import { ensureTopicStarted, loadCheckResults, saveCheckResult, saveFinishedStep, saveJump, saveReturnToDefaultPath, learnerSummary } from "@/learner/memory";
import { profileInput, saveProfile } from "@/learner/profile";
import frozenWidgets from "@/widgets/frozen.generated.json";

async function collect(events: AsyncIterable<TurnEvent>) {
  const out: TurnEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

/** The real present value Topic alone, with its quiz Check removed (see src/test/present-value-map.ts). */
function withoutQuizChecks(real: CourseMap): CourseMap {
  return presentValueOnly({ real, withoutQuiz: true, withoutInsight: true });
}

/** Moves the Learner to the Check step by saving progress directly, as earlier turns would have (one step per turn). */
async function advanceToCheck(db: Awaited<ReturnType<typeof testDb>>, map: CourseMap) {
  for (const step of ["story", "concept", "your_turn"] as const) await saveFinishedStep(db, map, step, new Date(), OWNER_LEARNER_ID);
}

/** Lines without the usage panel data, which has its own tests. */
const noUsage = (lines: Line[]) => lines.map((l) => ({ role: l.role, text: l.text }));

describe("Tutor Turn", () => {
  it("streams the Tutor's reply and the Session is still there after a reload", async () => {
    const db = await testDb();
    const { client } = scriptedClient([
      { content: [{ type: "text", text: "Present value " }, { type: "text", text: "starts with a story." }] },
    ]);

    const events = await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "What is present value?"));

    // The reply is held until code has checked it (ADR 0008), then sent as one text.
    expect(events).toEqual([
      { type: "text", text: "Present value starts with a story." },
      { type: "done", stopReason: "end_turn", usage: expect.any(Object), ref: { sessionId: expect.any(Number), turnSeq: 0 }, shown: { sessionId: expect.any(Number) } },
    ]);
    expect(noUsage(await loadCurrentSession(db, undefined, OWNER_LEARNER_ID))).toEqual([
      { role: "user", text: "What is present value?" },
      { role: "assistant", text: "Present value starts with a story." },
    ]);
    // The finished reply says where it sits, so it can be saved to notes.
    const line = (await loadCurrentSession(db, undefined, OWNER_LEARNER_ID)).at(-1)!;
    expect(line.ref).toEqual((events.at(-1) as { ref: unknown }).ref);
  });

  it("uses claude-opus-5-5 at medium effort from stored settings, frozen at Session start and replayed every request", async () => {
    const db = await testDb();
    await engineOff(db);
    const { client, requests } = scriptedClient([
      { content: [{ type: "text", text: "First." }] },
      { content: [{ type: "text", text: "Second." }] },
    ]);

    await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "Hello"));
    await db.update(settings).set({ value: "claude-haiku-5-5" }).where(eq(settings.key, "model"));
    await db.update(settings).set({ value: "high" }).where(eq(settings.key, "effort"));
    await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "And again"));

    for (const request of requests) {
      expect(request.model).toBe("claude-opus-5-5");
      for (const banned of ["tool_choice", "temperature", "top_p", "top_k"]) expect(request).not.toHaveProperty(banned);
      expect(request.output_config).toEqual({ effort: "medium" });
      expect(request.system).toEqual([{ type: "text", text: TUTOR_INSTRUCTIONS, cache_control: { type: "ephemeral" } }]);
      expect(request.tools).toEqual([
        { name: "finish_teaching_step" },
        { name: "record_insight_attempt" },
        { name: "save_learner_rule" },
        { name: "start_again" },
        { name: "record_check_verdict" },
        { name: "search_library" },
        { name: "record_misconception" },
        { name: "open_widget" },
        { name: "calculate" },
        { name: "code_execution" },
      ]);
      expect(request.thinking).toEqual({ type: "adaptive" });
      expect(request.cache_control).toEqual({ type: "ephemeral" });
    }
  });

  it("keeps a Session on the model it started with, even after idle hours and a deploy that refreezes its instructions", async () => {
    const db = await testDb();
    let t = Date.parse("2026-11-03T09:00:00Z");
    const now = () => new Date(t);
    const { client, requests } = scriptedClient([
      { content: [{ type: "text", text: "One." }] },
      { content: [{ type: "text", text: "Two." }] },
      { content: [{ type: "text", text: "Three." }] },
      // The first turn after the refreeze folds the history into a summary first.
      { content: [{ type: "compaction", content: "Summary." }] },
      { content: [{ type: "text", text: "Four." }] },
    ]);

    await collect(runTutorTurn({ db, client, now, learnerId: OWNER_LEARNER_ID }, "Hello"));
    await db.update(settings).set({ value: "claude-sonnet-5-5" }).where(eq(settings.key, "model"));
    t += 60_000;
    await collect(runTutorTurn({ db, client, now, learnerId: OWNER_LEARNER_ID }, "Same Session"));
    t += 7 * 3600_000;
    await collect(runTutorTurn({ db, client, now, learnerId: OWNER_LEARNER_ID }, "After a break"));
    expect(requests.map((r) => r.model)).toEqual(["claude-opus-5-5", "claude-opus-5-5", "claude-opus-5-5"]);

    // A deploy that changes the instructions refreezes the Session at its next turn; its model stays (spec #229).
    await db.update(sessionsTable).set({ fingerprint: "an-earlier-build" });
    await collect(runTutorTurn({ db, client, now, learnerId: OWNER_LEARNER_ID }, "After a deploy"));
    expect(requests.at(-1)!.model).toBe("claude-opus-5-5");
    expect(await listSessions(db, OWNER_LEARNER_ID)).toHaveLength(1);
  });

  it("shows text written before a tool call to the Learner and saves it in the reply", async () => {
    const db = await testDb();
    const { client } = scriptedClient([
      {
        content: [
          { type: "text", text: "You found it: a higher rate shrinks later money." },
          { type: "tool_use", id: "toolu_t1", name: "calculate", input: { expression: "100 / 1.08" } },
        ],
        stop_reason: "tool_use",
      },
      { content: [{ type: "text", text: "On to the Check." }] },
    ]);

    const events = await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "I think higher rates make later money worth less"));

    const shown = events.filter((e) => e.type === "text").map((e) => (e as { text: string }).text);
    expect(shown.join("")).toContain("You found it: a higher rate shrinks later money.");
    const lines = await loadCurrentSession(db, undefined, OWNER_LEARNER_ID);
    expect(lines.filter((l) => l.role === "assistant").map((l) => l.text).join("\n")).toContain("You found it: a higher rate shrinks later money.");
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

    await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "Why discount?"));
    await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "Why is that?"));
    await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "Got it"));

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
      const summary = await learnerSummary(db, map, OWNER_LEARNER_ID);
      expect(summary).toContain("Present value");
      expect(summary).toContain("Teaching Step: story");
      expect(requests).toHaveLength(0);
      void client;
    });

    it("tells the Tutor the Topic and Teaching Step in an appended message, withholding the reveal", async () => {
      const db = await testDb();
      const { client, requests } = scriptedClient([{ content: [{ type: "text", text: "Picture October 2018." }] }]);
      await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Go on."));
      const [context] = systemTexts(requests[0]);
      expect(context).toContain("Present value");
      expect(context).toContain("Teaching Step: story");
      expect(context).toContain(pv.cases[0].story.trim());
      expect(context).not.toContain(pv.cases[0].reveal.trim());
    });

    it("tells the Tutor which formulas the Topic teaches, and that they appear only as Formula Cards", async () => {
      const db = await testDb();
      const { client, requests } = scriptedClient([{ content: [{ type: "text", text: "Picture October 2018." }] }]);
      await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Go on."));
      const [context] = systemTexts(requests[0]);
      expect(context).toContain("Formulas this Topic teaches");
      expect(context).toContain('"growing-annuity-present-value"');
      expect(context).toContain("ratePercent");
      expect(TUTOR_INSTRUCTIONS).toContain("Show each only as a FormulaCard widget");
    });

    it("tells the Tutor that made-up numbers before the reveal must not match the real outcome, and sends the Concept to take them from at the your-turn step", async () => {
      expect(TUTOR_INSTRUCTIONS).toContain("a made-up number must never match the Case's real outcome or anything else you know happened after the as-of date");
      expect(TUTOR_INSTRUCTIONS).toContain("Take hypothetical numbers from the Concept or Check prompt in the Course Navigator message");
      // The step where a live run leaked the outcome: code sends the Topic's Concept, never the reveal.
      const db = await testDb();
      for (const step of ["story", "concept"] as const) await saveFinishedStep(db, map, step, new Date(), OWNER_LEARNER_ID);
      const { client, requests } = scriptedClient([{ content: [{ type: "text", text: "Suppose a rate went from 4% to 4.5%." }] }]);
      await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Give me a move to practise on."));
      const [context] = systemTexts(requests[0]);
      expect(context).toContain("Teaching Step: your_turn");
      expect(context).toContain(`Concept: ${plainFormulaText(pv.concept.trim())}`);
      expect(context).not.toContain(pv.cases[0].reveal.trim());
    });

    it("the Tutor reports a finished Teaching Step through a tool, and code accepts only the next legal one", async () => {
      const db = await testDb();
    await ensureTopicStarted(db, map, new Date(), OWNER_LEARNER_ID); // an earlier turn has shown the story
      const { client, requests } = scriptedClient([
        { content: [finish("reveal")] },
        { content: [finish("story")] },
        { content: [{ type: "text", text: "Now the concept." }] },
      ]);
      await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Go on"));

      const results = requests[2].messages.flatMap((m) =>
        Array.isArray(m.content) ? (m.content as { type: string }[]).filter((b) => b.type === "tool_result") : [],
      );
      expect(results[0]).toMatchObject({
        is_error: true,
        content: 'Error: Cannot finish "reveal": the current Teaching Step is "story".',
      });
      expect(results[1]).not.toHaveProperty("is_error");
      expect(String((results[1] as unknown as { content: unknown }).content)).toContain("Teaching Step: concept");
      expect(await learnerSummary(db, map, OWNER_LEARNER_ID)).toContain("Teaching Step: concept");
    });

    it("rejects finishing a Teaching Step that began during the same turn, so each step is taught in a reply the Learner answers", async () => {
      const db = await testDb();
    await ensureTopicStarted(db, map, new Date(), OWNER_LEARNER_ID); // an earlier turn has shown the story
      const { client, requests } = scriptedClient([
        { content: [finish("story")] },
        { content: [finish("concept")] },
        { content: [{ type: "text", text: "Here is the concept." }] },
        { content: [finish("concept", "toolu_concept_again")] },
        { content: [{ type: "text", text: "Your turn." }] },
      ]);
      await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Go on."));
      const results = requests[2].messages.flatMap((m) =>
        Array.isArray(m.content) ? (m.content as { type: string; is_error?: boolean; content?: unknown }[]).filter((b) => b.type === "tool_result") : [],
      );
      expect(results[0]).not.toHaveProperty("is_error");
      expect(results[1]).toMatchObject({ is_error: true });
      expect(String(results[1].content)).toContain("began during this turn");
      expect(await learnerSummary(db, map, OWNER_LEARNER_ID)).toContain("Teaching Step: concept");

      // After the Learner replies, a new turn may finish the step.
      await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Understood."));
      expect(await learnerSummary(db, map, OWNER_LEARNER_ID)).toContain("Teaching Step: your turn");
    });

    it("starts text written after a tool call on a new paragraph, so the streamed reply does not run two steps' sentences together", async () => {
      const db = await testDb();
      const { client } = scriptedClient([
        { content: [{ type: "text", text: "Story told." }, finish("story")] },
        { content: [{ type: "text", text: "Now the concept." }] },
      ]);
      const events = await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Go on."));
      const streamed = events.flatMap((e) => (e.type === "text" ? [e.text] : [])).join("");
      expect(streamed).toBe("Story told.\n\nNow the concept.");
    });

    it("a Topic started by this turn cannot have its first step finished in the same turn", async () => {
      const db = await testDb();
      const { client, requests } = scriptedClient([{ content: [finish("story")] }, { content: [{ type: "text", text: "The story." }] }]);
      await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Go on."));
      const [result] = requests[1].messages.flatMap((m) =>
        Array.isArray(m.content) ? (m.content as { type: string; is_error?: boolean; content?: unknown }[]).filter((b) => b.type === "tool_result") : [],
      );
      expect(result).toMatchObject({ is_error: true });
      expect(await learnerSummary(db, map, OWNER_LEARNER_ID)).toContain("Teaching Step: story");
    });

    it("tells the Tutor the pacing rule in its instructions", () => {
      expect(TUTOR_INSTRUCTIONS).toContain("never finish a step that began in the same turn");
    });

    it("saves the current Topic, Teaching Step and reveal, and after a break the Topic's Session carries on with them", async () => {
      const db = await testDb();
      const time = clock();
      await advanceToCheck(db, map);
      const { client, requests } = scriptedClient([
        { content: [{ type: "text", text: "Your Check." }] },
        { content: [{ type: "text", text: "Here is what happened." }] },
      ]);
      await collect(runTutorTurn({ db, client, map, now: time.now, learnerId: OWNER_LEARNER_ID }, "Go on."));
      // A Check result saved outside a turn (as a quiz will be).
      expect(await saveCheckResult(db, map, { checkId: pv.checks[0].id, passed: true }, new Date(), OWNER_LEARNER_ID)).toEqual({ ok: true, repeated: false });
      const summary = await learnerSummary(db, map, OWNER_LEARNER_ID);
      expect(summary).toContain("Teaching Step: reveal");
      expect(summary).toContain("The reveal has been shown.");

      time.advance(7 * HOUR);
      await collect(runTutorTurn({ db, client, map, now: time.now, learnerId: OWNER_LEARNER_ID }, "Go on."));
      const sessions = await listSessions(db, OWNER_LEARNER_ID);
      expect(sessions).toHaveLength(1);
      const later = requests.at(-1)!;
      // The API rejects a system message as the first message (live 400), so the opening context rides in the first user message.
      expect(later.messages[0].role).toBe("user");
      // The latest Where the Learner stands block and context carry the new place.
      expect(systemTexts(later).at(-1)).toContain("Teaching Step: reveal");
      expect(systemTexts(later).at(-1)).toContain(pv.cases[0].reveal.trim());
    });

    it("appends changed context mid-Session right after the Learner's message, where the API accepts it", async () => {
      const db = await testDb();
      await advanceToCheck(db, map);
      const { client, requests } = scriptedClient([
        { content: [{ type: "text", text: "Your Check." }] },
        { content: [{ type: "text", text: "Here is what happened." }] },
      ]);
      await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Go on."));
      await saveCheckResult(db, map, { checkId: pv.checks[0].id, passed: true }, new Date(), OWNER_LEARNER_ID);

      await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "What happened next?"));
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
              widgets: undefined,
              found: undefined,
              checks: [{ id: "bonds-check", kind: "conversation", prompt: "Why do prices fall?", passCriteria: "Discounting." }],
              questions: undefined,
              insight: undefined,
              explore: undefined,
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

      it("a jump warns of unmet prerequisites, then the opener teaches the chosen Topic", async () => {
        const db = await testDb();
        await ensureTopicStarted(db, twoTopics, new Date(), OWNER_LEARNER_ID);
        expect(await saveJump(db, twoTopics, "bonds", new Date(), OWNER_LEARNER_ID)).toMatchObject({ ok: true, unmetPrerequisites: ["present-value"] });
        const { client, requests } = scriptedClient([{ content: [{ type: "text", text: "Bonds, then." }] }]);
        await collect(runTutorTurn({ db, client, map: twoTopics, learnerId: OWNER_LEARNER_ID }, { opener: true }));
        const [context] = systemTexts(requests[0]);
        expect(context).toContain("Topic: Bond prices");
        expect(context).toContain("Prerequisites not yet passed: present-value.");
        expect(JSON.stringify(requests[0].messages)).toContain("Opener by code:");
        expect(await learnerSummary(db, twoTopics, OWNER_LEARNER_ID)).toContain("Bond prices");
      });

      it("a step reached in a part-finished Topic the Learner chose cannot be finished in its opener", async () => {
        const db = await testDb();
        await ensureTopicStarted(db, twoTopics, new Date(), OWNER_LEARNER_ID);
        await saveFinishedStep(db, twoTopics, "story", new Date(), OWNER_LEARNER_ID); // present value is at its concept step
        await saveJump(db, twoTopics, "bonds", new Date(), OWNER_LEARNER_ID);
        await ensureTopicStarted(db, twoTopics, new Date(), OWNER_LEARNER_ID); // an earlier turn began bonds
        await saveJump(db, twoTopics, "present-value", new Date(), OWNER_LEARNER_ID); // back into present value, at its concept step
        const { client, requests } = scriptedClient([
          { content: [finish("concept")] },
          { content: [{ type: "text", text: "The concept, again." }] },
          { content: [finish("concept", "toolu_concept_later")] },
          { content: [{ type: "text", text: "Your turn." }] },
        ]);
        await collect(runTutorTurn({ db, client, map: twoTopics, learnerId: OWNER_LEARNER_ID }, { opener: true }));
        expect(toolResults(requests[1])[0]).toMatchObject({ is_error: true });
        expect(String(toolResults(requests[1])[0].content)).toContain("began during this turn");
        expect(await learnerSummary(db, twoTopics, OWNER_LEARNER_ID)).toContain("Teaching Step: concept");

        // The next turn has taught it, so the step can now finish; the opener's note is sent once only.
        await collect(runTutorTurn({ db, client, map: twoTopics, learnerId: OWNER_LEARNER_ID }, "Understood."));
        expect(await learnerSummary(db, twoTopics, OWNER_LEARNER_ID)).toContain("Teaching Step: your turn");
        expect(JSON.stringify(requests[2].messages).match(/Opener by code:/g)).toHaveLength(1);
      });

      it("going back to the default path opens its Topic afresh, and the Topic left keeps its progress", async () => {
        const db = await testDb();
        await ensureTopicStarted(db, twoTopics, new Date(), OWNER_LEARNER_ID);
        await saveFinishedStep(db, twoTopics, "story", new Date(), OWNER_LEARNER_ID);
        await saveJump(db, twoTopics, "bonds", new Date(), OWNER_LEARNER_ID);
        await ensureTopicStarted(db, twoTopics, new Date(), OWNER_LEARNER_ID);
        await saveFinishedStep(db, twoTopics, "story", new Date(), OWNER_LEARNER_ID); // bonds at concept
        await saveReturnToDefaultPath(db, twoTopics, new Date(), OWNER_LEARNER_ID);
        const { client, requests } = scriptedClient([{ content: [finish("concept")] }, { content: [{ type: "text", text: "Back to present value." }] }]);
        await collect(runTutorTurn({ db, client, map: twoTopics, learnerId: OWNER_LEARNER_ID }, { opener: true }));
        expect(toolResults(requests[1])[0]).toMatchObject({ is_error: true });
        expect(String(systemTexts(requests[0]).at(-1))).toContain("Topic: Present value");
        await saveJump(db, twoTopics, "bonds", new Date(), OWNER_LEARNER_ID);
        expect(await learnerSummary(db, twoTopics, OWNER_LEARNER_ID)).toContain("Teaching Step: concept");
      });

      it("an off-map question changes nothing: no tool call, same place", async () => {
        const db = await testDb();
        await ensureTopicStarted(db, twoTopics, new Date(), OWNER_LEARNER_ID);
        await saveFinishedStep(db, twoTopics, "story", new Date(), OWNER_LEARNER_ID);
        const before = await learnerSummary(db, twoTopics, OWNER_LEARNER_ID);
        const { client } = scriptedClient([{ content: [{ type: "text", text: "Inflation is a general rise in prices." }] }]);
        await collect(runTutorTurn({ db, client, map: twoTopics, learnerId: OWNER_LEARNER_ID }, "Off topic: what is inflation?"));
        expect(await learnerSummary(db, twoTopics, OWNER_LEARNER_ID)).toBe(before);
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
        await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Go on."));
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
        await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Go on."));
        await saveCheckResult(db, map, { checkId: pv.checks[0].id, passed: true }, new Date(), OWNER_LEARNER_ID);
        await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "What happened next?"));
        const context = String(requests.at(-1)!.messages.at(-1)!.content);
        expect(context).toContain("Teaching Step: reveal");
        expect(context).toContain(`"${caseId}/winner-choice"`);
        expect(context).toContain("2019-03-04");
      });

      it("when a Case has no Case Data, the context says so and tells the Tutor to say data is missing", async () => {
        const db = await testDb();
        const { client, requests } = scriptedClient([{ content: [{ type: "text", text: "Picture October 2018." }] }]);
        await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Go on."));
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
            text: stringify({ ...parse(yaml), stage: "foundation", path: 1, connections: undefined, questions: undefined, checks: [...parse(yaml).checks.filter((c: { kind: string }) => c.kind === "conversation"), second] }),
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
        await collect(runTutorTurn({ db, client, map: twoChecks, learnerId: OWNER_LEARNER_ID }, "Go on."));

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
        await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Go on."));
        await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Later payments are worth less today."));

        expect(requests[0].tools).toContainEqual({ name: "record_check_verdict" });
        expect(String(toolResults(requests.at(-1)!).at(-1)!.content)).toContain("Teaching Step: reveal");
        expect(await learnerSummary(db, map, OWNER_LEARNER_ID)).toContain("Teaching Step: reveal");
      });

      it("rejects a verdict in the turn that reached the Check step, so the Learner answers the prompt before a pass can be recorded", async () => {
        const db = await testDb();
        for (const step of ["story", "concept"] as const) await saveFinishedStep(db, map, step, new Date(), OWNER_LEARNER_ID);
        const { client, requests } = scriptedClient([
          { content: [finish("your_turn")] },
          { content: [verdict({ check_id: checkId, verdict: "pass", reasons: "Too soon." })] },
          { content: [{ type: "text", text: "Here is the Check." }] },
        ]);
        await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "My working is done."));
        const result = toolResults(requests.at(-1)!).at(-1)!;
        expect(result).toMatchObject({ is_error: true });
        expect(String(result.content)).toContain("has not answered the Check prompt");
        expect(await loadCheckResults(db, OWNER_LEARNER_ID)).toHaveLength(0);
        expect(await learnerSummary(db, map, OWNER_LEARNER_ID)).toContain("Teaching Step: check");
      });

      it("code rejects a verdict for any other Check with a tool error, and saves nothing", async () => {
        const db = await testDb();
        const early = scriptedClient([
          { content: [verdict({ check_id: checkId, verdict: "pass", reasons: "Too early." }, "toolu_early")] },
          { content: [{ type: "text", text: "Story first." }] },
        ]);
        await collect(runTutorTurn({ db, client: early.client, map, learnerId: OWNER_LEARNER_ID }, "Go on."));
        const earlyResults = toolResults(early.requests.at(-1)!);
        await advanceToCheck(db, map);
        const { client, requests } = scriptedClient([
          { content: [verdict({ check_id: "some-other-check", verdict: "pass", reasons: "Wrong Check." }, "toolu_other")] },
          { content: [{ type: "text", text: "Let us take the Check." }] },
        ]);
        await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Ready."));

        const results = toolResults(requests.at(-1)!);
        expect(earlyResults[0]).toMatchObject({ is_error: true, content: 'Error: No Check is being taken; the current Teaching Step is "story".' });
        expect(results.at(-1)).toMatchObject({
          is_error: true,
          content: `Error: Check "some-other-check" is not the current Check; the current Check is "${checkId}".`,
        });
        expect(await loadCheckResults(db, OWNER_LEARNER_ID)).toEqual([]);
        expect(await learnerSummary(db, map, OWNER_LEARNER_ID)).toContain("Teaching Step: check");
      });

      it("a Learner who doesn't pass stays at the Check, and evidence and the teaching model are saved", async () => {
        const db = await testDb();
        await advanceToCheck(db, map);
        const { client, requests } = scriptedClient([
          { content: [verdict({ check_id: checkId, verdict: "not_yet", reasons: "Added the payments without discounting." })] },
          { content: [{ type: "text", text: "Not yet. Try again." }] },
        ]);
        await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Go on."));

        expect(String(toolResults(requests.at(-1)!).at(-1)!.content)).toContain("not yet");
        expect(await learnerSummary(db, map, OWNER_LEARNER_ID)).toContain("Teaching Step: check");
        expect(await loadCheckResults(db, OWNER_LEARNER_ID)).toEqual([
          expect.objectContaining({
            checkId,
            topicId: "present-value",
            passed: false,
            evidence: "Added the payments without discounting.",
            model: "claude-opus-5-5",
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
        await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Go on."));
        await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Because of interest."));

        const second = requests[1].messages;
        expect(second.at(-2)).toMatchObject({ role: "user", content: "Because of interest." });
        expect(second.at(-1)).toMatchObject({ role: "system" });
        expect(String(second.at(-1)!.content)).toMatch(/No verdict was recorded for Check pv-jackpot-choice/);
        expect(String(second.at(-1)!.content)).toContain("Teaching Step: check");
        expect(await learnerSummary(db, map, OWNER_LEARNER_ID)).toContain("Teaching Step: check");

        // The next turn recorded a verdict (not yet), so the turn after gets no such note.
        await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Interest compounds."));
        await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Let me try again."));
        const fourth = requests.at(-1)!.messages;
        const fromLast = fourth.slice(fourth.findLastIndex((m) => m.role === "user" && m.content === "Let me try again."));
        expect(fromLast.length).toBeGreaterThan(0);
        expect(JSON.stringify(fromLast)).not.toContain("No verdict was recorded");
      });

      it("after a break, a turn that ended at a Check with no verdict is followed by saying none was recorded", async () => {
        const db = await testDb();
        const time = clock();
        await advanceToCheck(db, map);
        const { client, requests } = scriptedClient([
          { content: [{ type: "text", text: "Why can both figures describe one prize?" }] },
          { content: [{ type: "text", text: "Welcome back." }] },
        ]);
        await collect(runTutorTurn({ db, client, map, now: time.now, learnerId: OWNER_LEARNER_ID }, "Go on."));
        time.advance(7 * HOUR);
        await collect(runTutorTurn({ db, client, map, now: time.now, learnerId: OWNER_LEARNER_ID }, "Go on."));
        expect(await listSessions(db, OWNER_LEARNER_ID)).toHaveLength(1);
        expect(systemTexts(requests.at(-1)!).at(-1)).toMatch(/No verdict was recorded for Check pv-jackpot-choice/);
      });

      it("the Tutor records a misconception through a tool, and the next Where the Learner stands block brings it up in code's summary", async () => {
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
        await collect(runTutorTurn({ db, client, map, now: time.now, learnerId: OWNER_LEARNER_ID }, "Go on."));
        expect(String(toolResults(requests[1]).at(-2)!.content)).toContain("Recorded by code: misconception noted");

        time.advance(7 * HOUR);
        await collect(runTutorTurn({ db, client, map, now: time.now, learnerId: OWNER_LEARNER_ID }, "Go on."));
        const opening = systemTexts(requests.at(-1)!).at(-1)!;
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
        await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Go on."));
        expect(await loadCheckResults(db, OWNER_LEARNER_ID)).toHaveLength(1);
      });
    });

    it("rejects a Check result for a Check that is not current", async () => {
      const db = await testDb();
      expect(await saveCheckResult(db, map, { checkId: pv.checks[0].id, passed: true }, new Date(), OWNER_LEARNER_ID)).toEqual({
        ok: false,
        reason: 'No Check is being taken; the current Teaching Step is "story".',
      });
    });

    it("idle time never starts a new Session: the Topic's Session carries on after any break", async () => {
      const db = await testDb();
      const time = clock();
      const { client, requests } = scriptedClient(
        Array.from({ length: 3 }, (_, i) => ({ content: [{ type: "text", text: `Reply ${i}` }] })),
      );
      await collect(runTutorTurn({ db, client, map, now: time.now, learnerId: OWNER_LEARNER_ID }, "First"));
      time.advance(7 * HOUR);
      await collect(runTutorTurn({ db, client, map, now: time.now, learnerId: OWNER_LEARNER_ID }, "Second"));
      time.advance(30 * 24 * HOUR);
      await collect(runTutorTurn({ db, client, map, now: time.now, learnerId: OWNER_LEARNER_ID }, "Third"));

      const all = await listSessions(db, OWNER_LEARNER_ID);
      expect(all).toHaveLength(1);
      expect(JSON.stringify(requests.at(-1)!.messages)).toContain("Reply 1");
      expect(noUsage(await loadSession(db, all[0].id, undefined, OWNER_LEARNER_ID)).map((l) => l.text)).toEqual(["First", "Reply 0", "Second", "Reply 1", "Third", "Reply 2"]);
    });
  });

  describe("widgets", () => {
    const good =
      '```openui-lang\nroot = Widget("PV", [rate, chart, steps])\n$rate = 3\nrate = Slider("rate", "Rate", 0, 10, 0.01, $rate, "percent")\nchart = AnnuityChart(1537000000, 30, 5, $rate)\nsteps = GuidedTasks([zero])\nzero = GuidedTask("Set the rate to 0%", $rate == 0)\n```';
    const bad = '```openui-lang\nroot = Widget("PV", [chart])\nchart = LineChart([1, 2, 3])\n```';
    const text = (t: string) => ({ content: [{ type: "text", text: t }] });
    /** The correction request's text, or undefined when the reply needed none. */
    const correctionAsked = (requests: { messages: { role: string; content?: unknown }[] }[]) =>
      requests.length > 1 ? String(requests[1].messages.at(-1)!.content) : undefined;

    it("sends a new Widget with a slider and no Guided Task back for one correction turn", async () => {
      const noTasks = '```openui-lang\nroot = Widget("PV", [rate, chart])\n$rate = 3\nrate = Slider("rate", "Rate", 0, 10, 0.01, $rate, "percent")\nchart = AnnuityChart(1537000000, 30, 5, $rate)\n```';
      const db = await testDb();
      await engineOff(db);
      const { client, requests } = scriptedClient([{ content: [{ type: "text", text: `Here it is.\n${noTasks}` }] }, { content: [{ type: "text", text: `Here it is.\n${good}` }] }]);
      const events = await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "Show me"));
      expect(correctionAsked(requests)).toMatch(/slider.*Guided Task/i);
      // The reply is held until checked (ADR 0008): the Learner sees only the retry, as one text.
      expect(events.map((e) => e.type)).toEqual(["text", "done"]);
      expect(noUsage(await loadCurrentSession(db, undefined, OWNER_LEARNER_ID))).toEqual([
        { role: "user", text: "Show me" },
        { role: "assistant", text: `Here it is.\n${good}` },
      ]);
    });

    it("freezes the generated widget instructions into the Session with the Tutor's instructions", async () => {
      const db = await testDb();
    await engineOff(db);
      const { client, requests } = scriptedClient([{ content: [{ type: "text", text: "Hi." }] }]);
      await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "Hello"));
      expect(requests[0].system[0].text).toContain(frozenWidgets.instructions);
    });

    it("sends a kit chart with no axis labels back for one correction turn", async () => {
      const unlabelled = '```openui-lang\nroot = Widget("Illustration: two rates", [bars])\nbars = BarChart(["Before", "After"], [Series("Rate", [5, 5.5])])\n```';
      const labelled = '```openui-lang\nroot = Widget("Illustration: two rates", [bars])\nbars = BarChart(["Before", "After"], [Series("Rate", [5, 5.5])], "grouped", "When", "Rate in percent")\n```';
      const db = await testDb();
      await engineOff(db);
      const { client, requests } = scriptedClient([{ content: [{ type: "text", text: unlabelled }] }, { content: [{ type: "text", text: labelled }] }]);
      await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "Show me"));
      expect(correctionAsked(requests)).toMatch(/bars: this BarChart has no axis labels/);

      const fine = await testDb();
      await engineOff(fine);
      const once = scriptedClient([{ content: [{ type: "text", text: labelled }] }]);
      await collect(runTutorTurn({ db: fine, client: once.client, learnerId: OWNER_LEARNER_ID }, "Show me"));
      expect(correctionAsked(once.requests)).toBeUndefined();
    });

    describe("with a Widget already open", () => {
      const history = (title: string) => `\`\`\`openui-lang\nroot = Widget("${title}", [chart])\nchart = HistoryChart("mega-millions-2018/treasury-30-year")\n\`\`\``;
      const queried = (title: string) =>
        `\`\`\`openui-lang\nroot = Widget("${title}", [line])\nd = Query("case_data", {dataset: "mega-millions-2018/treasury-30-year"}, {rows: []})\nline = LineChart(d.rows.date, [Series("Yield", d.rows.value)], "linear", "Date", "Percent")\n\`\`\``;
      const sentText = (request: { messages: { content?: unknown }[] }) => JSON.stringify(request.messages);

      it("tells the Tutor the open Widgets' titles and to update one by reusing its title", async () => {
        const db = await testDb();
        await engineOff(db);
        const { client, requests } = scriptedClient([text(history("Long-term interest rates")), text("Look at the chart.")]);
        await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "Show me rates"));
        expect(sentText(requests[0])).not.toContain("Open Widgets");
        await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "And now?"));
        const context = requests[1].messages.filter((m) => m.role === "system").map((m) => String(m.content)).join("\n");
        expect(context).toContain('Open Widgets (tabs in the Widget panel): "Long-term interest rates".');
        expect(context).toMatch(/write it again in full under exactly the same title: code replaces it in its tab/);
      });

      it("sends a new Widget drawing the same Case Data as an open Widget back for one correction turn", async () => {
        const db = await testDb();
        await engineOff(db);
        const { client, requests } = scriptedClient([text(history("Long-term interest rates")), text(queried("Rates around the draw")), text(queried("Long-term interest rates"))]);
        await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "Show me rates"));
        const events = await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "Show them as a line"));
        expect(events.map((e) => e.type)).toEqual(["text", "done"]);
        expect(String(requests[2].messages.at(-1)!.content)).toMatch(/same Case Data \(mega-millions-2018\/treasury-30-year\) as the open Widget "Long-term interest rates"/);
      });

      it("lets the Tutor update an open Widget in place by reusing its title, with no correction turn", async () => {
        const db = await testDb();
        await engineOff(db);
        const { client, requests } = scriptedClient([text(history("Long-term interest rates")), text(queried("Long-term interest rates"))]);
        await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "Show me rates"));
        const events = await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "Show them as a line"));
        expect(requests).toHaveLength(2);
        expect(events.some((e) => e.type === "correction")).toBe(false);
      });

      it("never holds the Widgets already stored to the new rules: a stored slider Widget with no Guided Task reloads unchanged", async () => {
        const db = await testDb();
        const old = '```openui-lang\nroot = Widget("PV", [rate, chart])\n$rate = 3\nrate = Slider("rate", "Rate", 0, 10, 0.25, $rate, "percent")\nchart = AnnuityChart(1537000000, 30, 5, $rate)\n```';
        // Stored before the rule: written straight to the Session, as an earlier deploy's turn saved it.
        const { client } = scriptedClient([text("Hello."), text("Still here.")]);
        await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "Hi"));
        const [session] = await db.select().from(sessionsTable);
        await db.insert(messages).values({ sessionId: session.id, seq: 99, role: "assistant", content: [{ type: "text", text: old }] });
        expect(noUsage(await loadCurrentSession(db, undefined, OWNER_LEARNER_ID)).at(-1)).toEqual({ role: "assistant", text: `Hello.\n\n${old}` });
        const events = await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "Thanks"));
        expect(events.some((e) => e.type === "correction")).toBe(false);
      });
    });

    it("a valid widget needs no correction turn", async () => {
      const db = await testDb();
      await engineOff(db);
      const { client, requests } = scriptedClient([{ content: [{ type: "text", text: `Here it is.\n${good}\nDrag the rate.` }] }]);
      const events = await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "Show me"));
      expect(requests).toHaveLength(1);
      expect(events.some((e) => e.type === "correction")).toBe(false);
    });

    it("detects an invalid widget on the server, allows one correction turn, and the corrected widget replaces the broken one on reload", async () => {
      const db = await testDb();
      await engineOff(db);
      const { client, requests } = scriptedClient([
        { content: [{ type: "text", text: `Here it is.\n${bad}\nDrag the rate.` }] },
        { content: [{ type: "text", text: `Here it is.\n${good}\nDrag the rate.` }] },
      ]);
      const events = await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "Show me"));

      expect(requests).toHaveLength(2);
      const correction = requests[1].messages.at(-1)!;
      expect(correction.role).toBe("user");
      expect(String(correction.content)).toMatch(/LineChart/);
      expect(events.map((e) => e.type)).toEqual(["text", "done"]);

      // History stays add-only: both replies and the correction request are stored, and a reload shows the retry.
      expect(await db.select().from(messages)).toHaveLength(4);
      expect(noUsage(await loadCurrentSession(db, undefined, OWNER_LEARNER_ID))).toEqual([
        { role: "user", text: "Show me" },
        { role: "assistant", text: `Here it is.\n${good}\nDrag the rate.` },
      ]);
    });

    it("sends a Formula Card with a rate bound to no slider back for one correction turn, naming the symbol", async () => {
      const unbound = '```openui-lang\nroot = Widget("PV", [card])\ncard = FormulaCard("present-value", {ratePercent: 5}, {}, {amount: 1000, years: 5})\n```';
      const fixed = '```openui-lang\nroot = Widget("PV", [rate, card, steps])\n$rate = 5\nrate = Slider("rate", "Rate", 0, 10, 0.5, $rate, "percent")\ncard = FormulaCard("present-value", {ratePercent: $rate}, {}, {amount: 1000, years: 5})\nsteps = GuidedTasks([zero])\nzero = GuidedTask("Set the rate to 0%", $rate == 0)\n```';
      const db = await testDb();
      await engineOff(db);
      const { client, requests } = scriptedClient([
        { content: [{ type: "text", text: `Here it is.\n${unbound}` }] },
        { content: [{ type: "text", text: fixed }] },
      ]);
      const events = await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "Show me the formula"));
      expect(requests).toHaveLength(2);
      expect(String(requests[1].messages.at(-1)!.content)).toMatch(/input "ratePercent" is bound to no Slider/);
      expect(events.map((e) => e.type)).toEqual(["text", "done"]);
    });

    it("gives up after one retry, and the fallback leaves the broken Widget out", async () => {
      const db = await testDb();
      const { client, requests } = scriptedClient([
        { content: [{ type: "text", text: `Here it is.\n${bad}` }] },
        { content: [{ type: "text", text: `Here it is.\n${bad}` }] },
      ]);
      const events = await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "Show me"));
      expect(requests).toHaveLength(2);
      expect(events.filter((e) => e.type === "text")).toEqual([{ type: "text", text: "Here it is." }]);
    });

    it("a correction cut off by max_tokens is handled like any cut-off: Finish this reply is offered and a truncated tool call is not run", async () => {
      const db = await testDb();
      const map = withoutQuizChecks(loadCourseMap());
      await ensureTopicStarted(db, map, new Date(), OWNER_LEARNER_ID); // an earlier turn has shown the story
      const truncated = { type: "tool_use", id: "toolu_cut_fix", name: "finish_teaching_step", input: { step: "story" } };
      const { client, requests } = scriptedClient([
        { content: [{ type: "text", text: bad }] },
        { content: [{ type: "text", text: "```openui-lang\nroot =" }, truncated], stop_reason: "max_tokens" },
        { content: [{ type: "text", text: "Carrying on." }] },
      ]);
      const events = await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Show me"));
      expect(events).toContainEqual({ type: "cut_short", message: expect.stringMatching(/cut short/i) });
      expect(events.at(-1)).toMatchObject({ type: "done", stopReason: "max_tokens" });

      await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, { finish: true }));
      const results = requests[2].messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((b) => b.type === "tool_result");
      expect(results).toEqual([{ type: "tool_result", tool_use_id: "toolu_cut_fix", is_error: true, content: expect.stringMatching(/Not run/) }]);
      expect(await learnerSummary(db, map, OWNER_LEARNER_ID)).toContain("Teaching Step: story");
    });

    it("a refused correction tells the Learner, like any refusal", async () => {
      const db = await testDb();
      const { client } = scriptedClient([
        { content: [{ type: "text", text: bad }] },
        { content: [{ type: "text", text: "I can't" }], stop_reason: "refusal" },
      ]);
      const events = await collect(runTutorTurn({ db, client, learnerId: OWNER_LEARNER_ID }, "Show me"));
      expect(events).toContainEqual(expect.objectContaining({ type: "refusal" }));
      expect(events.at(-1)).toMatchObject({ type: "done", stopReason: "refusal" });
    });
  });
  describe("quiz Check", () => {
    const real = presentValueOnly({ withoutInsight: true });
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
      await collect(runTutorTurn({ db, client, map: real, learnerId: OWNER_LEARNER_ID }, "Go on."));
      const context = requests.at(-1)!.messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).map((b) => JSON.stringify(b)).join("\n");
      expect(context).toContain(`Check: quiz ${quizId}`);
      expect(context).toContain("While the quiz is open, help freely");
      // Where the Learner sees it: on the right, in the Check tab, never "beside the conversation" or "the quiz panel".
      expect(context).toContain("on the right, in the Check tab");
      expect(context).not.toContain("panel beside the conversation");
      expect(context).not.toContain("the quiz panel");
      for (const q of real.topic("present-value")!.questions) {
        expect(context).not.toContain(q.prompt.trim());
        expect(context).not.toContain(q.explanation.trim());
      }
    });

    it("marking makes no model call, and the result reaches the Tutor right after the Learner's next message", async () => {
      const db = await testDb();
      await advanceToCheck(db, real);
      const { client, requests } = scriptedClient([text("Your quiz is below."), text("Good. Now the next idea.")]);
      await collect(runTutorTurn({ db, client, map: real, learnerId: OWNER_LEARNER_ID }, "Go on."));
      const callsBefore = requests.length;

      const quiz = (await openQuiz(db, real, new Date(), OWNER_LEARNER_ID))!;
      const answers = Object.fromEntries(quiz.questions.map((q) => [q.id, real.question(q.id)!.answer]));
      const result = await submitQuiz(db, real, quiz.attemptId, answers, new Date(), OWNER_LEARNER_ID);
      expect(result).toMatchObject({ ok: true, passed: true });
      expect(requests).toHaveLength(callsBefore);

      await collect(runTutorTurn({ db, client, map: real, learnerId: OWNER_LEARNER_ID }, "Done."));
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
      await collect(runTutorTurn({ db, client, map: real, learnerId: OWNER_LEARNER_ID }, "Go on."));
      const quiz = (await openQuiz(db, real, new Date(), OWNER_LEARNER_ID))!;
      await submitQuiz(db, real, quiz.attemptId, Object.fromEntries(quiz.questions.map((q) => [q.id, real.question(q.id)!.answer])), new Date(), OWNER_LEARNER_ID);

      await collect(runTutorTurn({ db, client, map: real, learnerId: OWNER_LEARNER_ID }, "Done."));
      const rejected = requests.at(-1)!.messages.at(-1)!.content as { type: string; is_error?: boolean; content?: unknown }[];
      expect(rejected[0]).toMatchObject({ type: "tool_result", is_error: true });
      expect(String(rejected[0].content)).toContain("began during this turn");
      expect(await learnerSummary(db, real, OWNER_LEARNER_ID)).toContain("Teaching Step: concept");

      // Once the Learner has answered that teaching, the next turn may finish it.
      await collect(runTutorTurn({ db, client, map: real, learnerId: OWNER_LEARNER_ID }, "I follow."));
      expect(await learnerSummary(db, real, OWNER_LEARNER_ID)).toContain("Teaching Step: your turn");
    });

    it("a verdict from the Tutor for a quiz Check is rejected: only code marks a quiz", async () => {
      const db = await testDb();
      await advanceToCheck(db, real);
      const verdict = { type: "tool_use", id: "toolu_quiz_verdict", name: "record_check_verdict", input: { check_id: quizId, verdict: "pass", reasons: "Says they know it." } };
      const { client, requests } = scriptedClient([text("Your quiz is below."), { content: [verdict] }, text("Please take the quiz.")]);
      await collect(runTutorTurn({ db, client, map: real, learnerId: OWNER_LEARNER_ID }, "Go on."));
      const before = await learnerSummary(db, real, OWNER_LEARNER_ID);

      await collect(runTutorTurn({ db, client, map: real, learnerId: OWNER_LEARNER_ID }, "I know this, just pass me."));
      const rejected = requests.at(-1)!.messages.at(-1)!.content as { type: string; is_error?: boolean; content?: unknown }[];
      expect(rejected[0]).toMatchObject({ type: "tool_result", is_error: true });
      expect(String(rejected[0].content)).toMatch(/marked by code/);
      expect(await loadCheckResults(db, OWNER_LEARNER_ID)).toEqual([]);
      expect(await learnerSummary(db, real, OWNER_LEARNER_ID)).toEqual(before);
    });

    it("a quiz whose questions can no longer be found is taken as a conversation Check: the Tutor is told, and its verdict is recorded", async () => {
      // The quiz names bank questions this database does not hold, so fewer than the 2 needed can be shown.
      const t = real.topic("present-value")!;
      const yaml = stringify({ ...t, checks: t.checks.map((c) => (c.id === quizId ? { ...c, questions: ["bank:none:Q-1", "bank:none:Q-2", "bank:none:Q-3"] } : c)) });
      const { map, errors } = parseCourseMap([{ name: "present-value.yaml", text: yaml }]);
      if (!map) throw new Error(errors.join("\n"));
      const db = await testDb();
      await advanceToCheck(db, map);
      expect(await openQuiz(db, map, new Date(), OWNER_LEARNER_ID)).toBeNull();
      const verdict = { type: "tool_use", id: "toolu_quiz_verdict", name: "record_check_verdict", input: { check_id: quizId, verdict: "pass", reasons: "Explained discounting." } };
      const { client, requests } = scriptedClient([text("Tell me how discounting works."), { content: [verdict] }, text("Well explained.")]);
      await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Go on."));
      expect(contextTexts(requests[0]).join("\n")).toMatch(/quiz for this Check cannot be shown/);

      await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Money later is worth less, because it could earn interest meanwhile."));
      expect(await loadCheckResults(db, OWNER_LEARNER_ID)).toMatchObject([{ checkId: quizId, passed: true }]);
    });

    it("tells the Tutor about a miss, even though the Learner's place did not change, and only once", async () => {
      const db = await testDb();
      await advanceToCheck(db, real);
      const { client, requests } = scriptedClient([text("Quiz below."), text("Let us look at it."), text("Fine.")]);
      await collect(runTutorTurn({ db, client, map: real, learnerId: OWNER_LEARNER_ID }, "Go on."));
      const quiz = (await openQuiz(db, real, new Date(), OWNER_LEARNER_ID))!;
      const first = quiz.questions[0];
      const wrong = first.choices.find((c) => c.id !== real.question(first.id)!.answer)!;
      await submitQuiz(db, real, quiz.attemptId, { [first.id]: wrong.id }, new Date(), OWNER_LEARNER_ID);

      await collect(runTutorTurn({ db, client, map: real, learnerId: OWNER_LEARNER_ID }, "I missed some."));
      const note = String(requests.at(-1)!.messages.at(-1)!.content);
      expect(note).toContain("0 of 3 correct (needs 2).");
      expect(note).toContain("Not passed");
      expect(note).toContain(`The Learner chose "${wrong.text}"`);
      expect(note).not.toContain("No verdict was recorded");

      await collect(runTutorTurn({ db, client, map: real, learnerId: OWNER_LEARNER_ID }, "And now?"));
      expect(requests.at(-1)!.messages.filter((m) => m.role === "system")).toHaveLength(1);
      expect(contextTexts(requests.at(-1)!).filter((t) => t.includes("Quiz result by code"))).toHaveLength(1);
    });

    it("carries a result into the Topic's Session after a break", async () => {
      const db = await testDb();
      let t = Date.parse("2026-11-02T09:00:00Z");
      const now = () => new Date(t);
      await advanceToCheck(db, real);
      const { client, requests } = scriptedClient([text("Quiz below."), text("Welcome back.")]);
      await collect(runTutorTurn({ db, client, map: real, now, learnerId: OWNER_LEARNER_ID }, "Go on."));
      const quiz = (await openQuiz(db, real, now(), OWNER_LEARNER_ID))!;
      await submitQuiz(db, real, quiz.attemptId, {}, now(), OWNER_LEARNER_ID);
      t += 7 * 3600_000;
      await collect(runTutorTurn({ db, client, map: real, now, learnerId: OWNER_LEARNER_ID }, "Go on."));
      expect(requests.at(-1)!.messages[0].role).toBe("user");
      expect(contextTexts(requests.at(-1)!).at(-1)).toContain("Quiz result by code");
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
    const running = collect(runTutorTurn({ db, client: first.client, map, learnerId: OWNER_LEARNER_ID }, "First message"));
    await new Promise((r) => setTimeout(r, 20));

    const other = scriptedClient([{ content: [text("Should not run.")] }]);
    const events = await collect(runTutorTurn({ db, client: other.client, map, learnerId: OWNER_LEARNER_ID }, "From my phone"));
    expect(events).toEqual([{ type: "busy", message: expect.stringMatching(/turn is in progress/i) }]);
    expect(other.requests).toHaveLength(0);

    release();
    await running;
    expect(noUsage(await loadCurrentSession(db, undefined, OWNER_LEARNER_ID))).toEqual([
      { role: "user", text: "First message" },
      { role: "assistant", text: "Slow reply." },
    ]);
    expect(await latestTurn(db, OWNER_LEARNER_ID)).toMatchObject({ status: "finished", stopReason: "end_turn" });
    // Once the first turn has finished, the next send runs.
    const after = scriptedClient([{ content: [text("Now it runs.")] }]);
    expect((await collect(runTutorTurn({ db, client: after.client, map, learnerId: OWNER_LEARNER_ID }, "Again"))).at(-1)).toMatchObject({ type: "done" });
  });

  const types = (events: TurnEvent[]) => events.map((e) => e.type);
  const resultsIn = (request: { messages: { content?: unknown }[] }) =>
    request.messages.flatMap((m) =>
      Array.isArray(m.content) ? (m.content as { type: string; content?: unknown; is_error?: boolean; tool_use_id?: string }[]).filter((b) => b.type === "tool_result") : [],
    );

  it("a turn cut off by its time limit is saved as cut off, and the resume continues from the last saved loop step without repeating a write", async () => {
    const db = await testDb();
    await ensureTopicStarted(db, map, new Date(), OWNER_LEARNER_ID); // an earlier turn has shown the story
    const first = scriptedClient([{ content: [finish("story")] }, { content: [text("Never saved.")], delayMs: 400 }]);
    const events = await collect(runTutorTurn({ db, client: first.client, map, timeBudgetMs: 150, learnerId: OWNER_LEARNER_ID }, "Go on."));
    expect(events.at(-1)).toEqual({ type: "cut_off" });
    expect(await latestTurn(db, OWNER_LEARNER_ID)).toMatchObject({ status: "cut_off" });
    expect(await learnerSummary(db, map, OWNER_LEARNER_ID)).toContain("Teaching Step: concept");

    const resume = scriptedClient([{ content: [text("Now the concept.")] }]);
    const resumed = await collect(runTutorTurn({ db, client: resume.client, map, learnerId: OWNER_LEARNER_ID }, { resume: true }));
    expect(types(resumed)).toEqual(["replay", "text", "done"]);
    // The finish_teaching_step call ran before the cut-off, but its result was never saved: it is re-run
    // under its tool call ID, returns the saved result, and the Learner moves on only once.
    const results = resultsIn(resume.requests[0]);
    expect(results).toHaveLength(1);
    expect(results[0]).not.toHaveProperty("is_error");
    expect(String(results[0].content)).toContain("Teaching Step: concept");
    expect(await learnerSummary(db, map, OWNER_LEARNER_ID)).toContain("Teaching Step: concept");
    expect(await latestTurn(db, OWNER_LEARNER_ID)).toMatchObject({ status: "finished" });
    // The Learner's message is stored once, and the unsaved step's text never was.
    expect(noUsage(await loadCurrentSession(db, undefined, OWNER_LEARNER_ID))).toEqual([
      { role: "user", text: "Go on." },
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
    await collect(runTutorTurn({ db, client: first.client, map, learnerId: OWNER_LEARNER_ID }, "Go on."));
    await collect(runTutorTurn({ db, client: first.client, map, timeBudgetMs: 150, learnerId: OWNER_LEARNER_ID }, "The bigger number wins."));
    expect(await loadCheckResults(db, OWNER_LEARNER_ID)).toHaveLength(1);

    const resume = scriptedClient([{ content: [text("Not yet. Think about timing.")] }]);
    await collect(runTutorTurn({ db, client: resume.client, map, learnerId: OWNER_LEARNER_ID }, { resume: true }));
    expect(await loadCheckResults(db, OWNER_LEARNER_ID)).toHaveLength(1);
    expect(String(resultsIn(resume.requests[0]).at(-1)!.content)).toContain("Recorded by code: not yet");
  });

  it("the resume clears what the browser showed and sends the whole reply once it is checked, the saved part included", async () => {
    const db = await testDb();
    const first = scriptedClient([{ content: [text("Saved part. "), finish("story")] }, { content: [text("Unsaved part.")], delayMs: 400 }]);
    const events = await collect(runTutorTurn({ db, client: first.client, map, timeBudgetMs: 150, learnerId: OWNER_LEARNER_ID }, "Go on."));
    // Nothing of a reply shows before its checks (ADR 0008).
    expect(events.filter((e) => e.type === "text")).toEqual([]);
    const resume = scriptedClient([{ content: [text("Resumed part.")] }]);
    const resumed = await collect(runTutorTurn({ db, client: resume.client, map, learnerId: OWNER_LEARNER_ID }, { resume: true }));
    expect(resumed[0]).toEqual({ type: "replay", text: "" });
    expect(resumed.filter((e) => e.type === "text")).toEqual([{ type: "text", text: "Saved part.\n\nResumed part." }]);
  });

  it("resuming a turn whose final reply was already saved asks the model nothing and marks it finished", async () => {
    const db = await testDb();
    const first = scriptedClient([{ content: [text("All done.")] }]);
    await collect(runTutorTurn({ db, client: first.client, map, learnerId: OWNER_LEARNER_ID }, "Hi"));
    // The function was killed after the final save, before the turn was marked finished.
    await db.update(turns).set({ status: "cut_off" });
    const resume = scriptedClient([]);
    const events = await collect(runTutorTurn({ db, client: resume.client, map, learnerId: OWNER_LEARNER_ID }, { resume: true }));
    // The stored reply is checked before it shows.
    expect(types(events)).toEqual(["replay", "text", "done"]);
    expect(events[0]).toEqual({ type: "replay", text: "" });
    expect(events[1]).toEqual({ type: "text", text: "All done." });
    expect(resume.requests).toHaveLength(0);
    expect(await latestTurn(db, OWNER_LEARNER_ID)).toMatchObject({ status: "finished" });
  });

  it("a resume after the turn already finished elsewhere just replays the saved reply", async () => {
    const db = await testDb();
    const first = scriptedClient([{ content: [text("Finished while you were offline.")] }]);
    await collect(runTutorTurn({ db, client: first.client, map, learnerId: OWNER_LEARNER_ID }, "Hi"));
    const events = await collect(runTutorTurn({ db, client: scriptedClient([]).client, map, learnerId: OWNER_LEARNER_ID }, { resume: true }));
    expect(events[0]).toEqual({ type: "replay", text: "Finished while you were offline." });
    expect(events.at(-1)).toMatchObject({ type: "done" });
  });

  it("a new message after a cut-off first answers the saved tool calls that had no result, then carries on", async () => {
    const db = await testDb();
    await ensureTopicStarted(db, map, new Date(), OWNER_LEARNER_ID); // an earlier turn has shown the story
    const first = scriptedClient([{ content: [finish("story")] }, { content: [text("Lost.")], delayMs: 400 }]);
    await collect(runTutorTurn({ db, client: first.client, map, timeBudgetMs: 150, learnerId: OWNER_LEARNER_ID }, "Go on."));
    const next = scriptedClient([{ content: [text("Where were we? The concept.")] }]);
    expect((await collect(runTutorTurn({ db, client: next.client, map, learnerId: OWNER_LEARNER_ID }, "Hello?"))).at(-1)).toMatchObject({ type: "done" });
    const sent = next.requests[0].messages;
    expect(sent.findIndex((m) => m.role === "user" && m.content === "Hello?")).toBeGreaterThan(
      sent.findIndex((m) => JSON.stringify(m.content).includes('"tool_result"')),
    );
    expect(await learnerSummary(db, map, OWNER_LEARNER_ID)).toContain("Teaching Step: concept");
  });

  it("a turn left running by a killed function no longer blocks the next send", async () => {
    const db = await testDb();
    let t = Date.parse("2026-11-02T09:00:00Z");
    const now = () => new Date(t);
    await db.insert(turns).values({ learnerId: OWNER_LEARNER_ID, status: "running", startedAt: now() });
    t += 6 * 60_000;
    const { client } = scriptedClient([{ content: [text("Here.")] }]);
    expect((await collect(runTutorTurn({ db, client, map, now, learnerId: OWNER_LEARNER_ID }, "Hello"))).at(-1)).toMatchObject({ type: "done" });
  });

  it("max_tokens: the partial reply is kept as sent, the Learner is told it was cut short, a truncated tool call is not run, and Finish this reply carries on", async () => {
    const db = await testDb();
    const partial = [text("A rupee today is worth"), finish("story", "toolu_cut")];
    const { client, requests } = scriptedClient([{ content: partial, stop_reason: "max_tokens" }, { content: [text("...more than a rupee next year.")] }]);
    const events = await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Go on."));
    expect(events).toContainEqual({ type: "cut_short", message: expect.stringMatching(/cut short/i) });
    expect(events.at(-1)).toMatchObject({ type: "done", stopReason: "max_tokens" });
    expect(await learnerSummary(db, map, OWNER_LEARNER_ID)).toContain("Teaching Step: story");

    await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, { finish: true }));
    const sent = requests[1].messages;
    expect(sent).toContainEqual({ role: "assistant", content: partial });
    expect(resultsIn(requests[1])).toEqual([{ type: "tool_result", tool_use_id: "toolu_cut", is_error: true, content: expect.stringMatching(/Not run/) }]);
  });

  it("refusal: the declined reply is discarded, the Learner sees a plain message, their place doesn't change, and the next message leaves the refused turn out", async () => {
    const db = await testDb();
    const { client, requests } = scriptedClient([
      { content: [text("Hello.")] },
      { content: [text("I can help with tha")], stop_reason: "refusal" },
      { content: [text("Back to present value.")] },
    ]);
    await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Hi"));
    const events = await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Something declined"));
    expect(events).toContainEqual({ type: "refusal", message: expect.stringMatching(/Nothing was changed/), text: "" });
    expect(await learnerSummary(db, map, OWNER_LEARNER_ID)).toContain("Teaching Step: story");
    // The partial reply is never stored.
    expect(noUsage(await loadCurrentSession(db, undefined, OWNER_LEARNER_ID)).map((l) => l.text)).not.toContain("I can help with tha");

    await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Let us go on"));
    expect(await listSessions(db, OWNER_LEARNER_ID)).toHaveLength(1);
    expect(requests.at(-1)!.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(String(JSON.stringify(requests.at(-1)!.messages))).not.toContain("Something declined");
  });

  it("refusal after earlier loop steps saved progress: the Learner is told it was kept, and the saved reply text stays on screen", async () => {
    const db = await testDb();
    await ensureTopicStarted(db, map, new Date(), OWNER_LEARNER_ID); // an earlier turn has shown the story
    const { client } = scriptedClient([
      { content: [text("Story done."), finish("story")] },
      { content: [text("I can help with tha")], stop_reason: "refusal" },
    ]);
    const events = await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Go on"));
    const refusal = events.find((e) => e.type === "refusal");
    expect(refusal).toEqual({ type: "refusal", message: expect.stringMatching(/kept/), text: "Story done." });
    expect(refusal && "message" in refusal ? refusal.message : "").not.toContain("Nothing was changed");
    expect(await learnerSummary(db, map, OWNER_LEARNER_ID)).toContain("Teaching Step: concept");
  });

  it("a turn that fails before the Learner's message is stored can be retried, and the retry sends that message", async () => {
    const db = await testDb();
    await db.execute(sql`CREATE FUNCTION refuse_start() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'connection lost'; END $$ LANGUAGE plpgsql`);
    await db.execute(sql`CREATE TRIGGER refuse_start BEFORE INSERT ON topic_progress FOR EACH ROW EXECUTE FUNCTION refuse_start()`);
    const { client, requests } = scriptedClient([{ content: [text("Picture October 2018.")] }]);
    const failed = await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Why discount?"));
    expect(failed.at(-1)).toMatchObject({ type: "error" });
    expect(await latestTurn(db, OWNER_LEARNER_ID)).toMatchObject({ status: "failed", sessionId: null });
    await db.execute(sql`DROP TRIGGER refuse_start ON topic_progress`);

    const retried = await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, { resume: true }));
    expect(retried.at(-1)).toMatchObject({ type: "done" });
    expect(JSON.stringify(requests.at(-1)!.messages[0].content)).toContain("Why discount?");
    expect(noUsage(await loadCurrentSession(db, undefined, OWNER_LEARNER_ID))).toEqual([
      { role: "user", text: "Why discount?" },
      { role: "assistant", text: "Picture October 2018." },
    ]);
  });

  it("an API error or exhausted credits shows the reason and a retry, keeps everything saved, and Retry doesn't repeat the Learner's message", async () => {
    const db = await testDb();
    const credits = APIError.generate(402, { type: "error", error: { type: "billing_error", message: "Your credit balance is too low" } }, "402 billing", new Headers());
    const { client, requests } = scriptedClient([{ content: [text("First reply.")] }, { error: credits }, { content: [text("Answer after retry.")] }]);
    await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Hello"));
    const failed = await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Why discount?"));
    expect(failed.at(-1)).toEqual({ type: "error", kind: "credits", message: expect.stringMatching(/credits/i) });
    expect(await latestTurn(db, OWNER_LEARNER_ID)).toMatchObject({ status: "failed" });

    const retried = await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, { resume: true }));
    expect(retried.at(-1)).toMatchObject({ type: "done" });
    expect(requests.at(-1)!.messages.at(-1)).toMatchObject({ role: "user", content: "Why discount?" });
    expect(noUsage(await loadCurrentSession(db, undefined, OWNER_LEARNER_ID))).toEqual([
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
    await ensureTopicStarted(db, map, new Date(), OWNER_LEARNER_ID); // an earlier turn has shown the story
    await db.execute(sql`CREATE FUNCTION refuse_write() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'disk full'; END $$ LANGUAGE plpgsql`);
    await db.execute(sql`CREATE TRIGGER refuse_progress BEFORE UPDATE ON topic_progress FOR EACH ROW EXECUTE FUNCTION refuse_write()`);
    const { client, requests } = scriptedClient([{ content: [finish("story")] }, { content: [text("Sorry, that was not saved.")] }]);
    const events = await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Go on."));
    expect(events).toContainEqual({ type: "save_failed", message: expect.stringMatching(/could not be saved/i) });
    expect(resultsIn(requests[1])[0]).toMatchObject({ is_error: true, content: expect.stringMatching(/Nothing was recorded/) });
    await db.execute(sql`DROP TRIGGER refuse_progress ON topic_progress`);
    expect(await learnerSummary(db, map, OWNER_LEARNER_ID)).toContain("Teaching Step: story");
  });

  it("a changed fingerprint of instructions and tools refreezes them in the same Session, with no notice, and folds the history before the reply", async () => {
    const db = await testDb();
    await engineOff(db);
    const { client, requests } = scriptedClient([
      { content: [text("One.")] },
      { content: [{ type: "compaction", content: "Summary of the Session so far." }] },
      { content: [text("Two.")] },
    ]);
    await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Hello"));
    // As if the Session was frozen by an earlier build, on another model and effort.
    await db.update(sessionsTable).set({ fingerprint: "an-earlier-build", instructions: "Old instructions.", model: "claude-sonnet-5-5", effort: "high" });
    const events = await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Hello again"));
    expect(events.map((e) => e.type)).toEqual(["text", "done"]);
    expect(await listSessions(db, OWNER_LEARNER_ID)).toHaveLength(1);
    // The fold runs under the new instructions; the reply's request carries the summary and no reply from before the change.
    expect(requests).toHaveLength(3);
    expect(requests[1].system).toEqual([{ type: "text", text: TUTOR_INSTRUCTIONS, cache_control: { type: "ephemeral" } }]);
    expect(requests.at(-1)!.system).toEqual([{ type: "text", text: TUTOR_INSTRUCTIONS, cache_control: { type: "ephemeral" } }]);
    expect(JSON.stringify(requests.at(-1)!.messages)).toContain("Summary of the Session so far.");
    expect(JSON.stringify(requests.at(-1)!.messages)).not.toContain("One.");
    // The Session keeps its model and effort (spec #229: existing Sessions keep theirs).
    expect(requests.at(-1)).toMatchObject({ model: "claude-sonnet-5-5", output_config: { effort: "high" } });
    const [session] = await db.select().from(sessionsTable);
    expect(session).toMatchObject({ model: "claude-sonnet-5-5", effort: "high", instructions: TUTOR_INSTRUCTIONS });
  });

  it("the calculate tool runs the tested formula and answers with formatted numbers; bad input is an error result the Tutor can read", async () => {
    const db = await testDb();
    const emi = { type: "tool_use", id: "toolu_emi", name: "calculate", input: { calculator: "emi", inputs: { principal: 5_000_000, ratePercent: 8.5, years: 20 } } };
    const bad = { type: "tool_use", id: "toolu_bad", name: "calculate", input: { calculator: "emi", inputs: { principal: 5_000_000 } } };
    const { client, requests } = scriptedClient([{ content: [emi] }, { content: [bad] }, { content: [text("Done.")] }]);
    await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "What is the EMI on 50 lakh?"));
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
    await collect(runTutorTurn({ db, client, map, now: () => new Date(time), learnerId: OWNER_LEARNER_ID }, "Go on."));
    expect(resultsIn(requests[1])[0]).not.toHaveProperty("is_error");
    await collect(runTutorTurn({ db, client, map, now: () => new Date(time + 7 * 3600_000), learnerId: OWNER_LEARNER_ID }, "Go on."));
    expect(String(requests.at(-1)!.messages.at(-1)!.content)).toContain("Adds payments without discounting.");
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
    await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "First"));
    expect(requests.filter((r) => r.compaction)).toHaveLength(0);
    const second = await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Second"));
    expect(requests.filter((r) => r.compaction)).toHaveLength(1);
    // The summary is not streamed to the Learner, and its cost shows in the panel.
    expect(second.filter((e) => e.type === "text").map((e) => (e as { text: string }).text)).toEqual(["Long reply."]);
    const done = second.at(-1) as Extract<TurnEvent, { type: "done" }>;
    expect(done.usage.steps.at(-1)).toMatchObject({ tools: ["compaction"], inputTokens: 2100, outputTokens: 300 });

    await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Third"));
    const third = requests.at(-1)!;
    expect(third.betas).toContain("compact-2026-09-04");
    expect(third.messages[0]).toEqual({ role: "assistant", content: [summary] });
    expect(third.messages[1]).toMatchObject({ role: "user", content: "Third" });
    // Context messages before the summary were summarised, so code sends the Course Navigator's context again.
    expect(third.messages[2]).toMatchObject({ role: "system" });
    expect(String(third.messages[2].content)).toContain("Course Navigator:");
    // Nothing is deleted: the whole Session still reads back in full.
    expect(noUsage(await loadCurrentSession(db, undefined, OWNER_LEARNER_ID)).map((l) => l.text)).toEqual(["First", "Short reply.", "Second", "Long reply.", "Third", "Carrying on."]);
  });

  it("a repeated finish_teaching_step under the same tool call ID has no second effect", async () => {
    const db = await testDb();
    await ensureTopicStarted(db, map, new Date(), OWNER_LEARNER_ID); // an earlier turn has shown the story
    const same = finish("story", "toolu_same");
    const { client, requests } = scriptedClient([{ content: [same] }, { content: [same] }, { content: [text("Concept.")] }]);
    await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Go on."));
    const results = resultsIn(requests.at(-1)!);
    expect(results.map((r) => r.is_error ?? false)).toEqual([false, false]);
    expect(results[1].content).toEqual(results[0].content);
    expect(await learnerSummary(db, map, OWNER_LEARNER_ID)).toContain("Teaching Step: concept");
  });
});

describe("Learner Profile in the Tutor Turn", () => {
  const map = withoutQuizChecks(loadCourseMap());
  const text = (t: string) => ({ type: "text", text: t });
  const openingOf = (request: { messages: object[] }) => ((request.messages[0] as { content: { text: string }[] }).content)[0].text;

  it("opens a new Session with the profile after the Learner summary and before the Course Navigator context", async () => {
    const db = await testDb();
    await saveProfile(db, profileInput.parse({ work: "Nurse", location: "Pune, India", loan: "Home loan", savingFor: "School fees" }), new Date(), OWNER_LEARNER_ID);
    const { client, requests } = scriptedClient([{ content: [text("Hello.")] }]);
    await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Hi"));
    const opening = openingOf(requests[0]);
    const profile = opening.indexOf("Learner Profile");
    expect(opening.indexOf(OPENING_PREFIX)).toBe(0);
    expect(profile).toBeGreaterThan(0);
    expect(opening.indexOf("Course Navigator:")).toBeGreaterThan(profile);
    expect(opening).toContain("- Work: Nurse");
    expect(opening).toContain("- Where you live: Pune, India");
    expect(opening).toContain("never as advice");
    expect((requests[0].messages[0].content as { text: string }[])[1].text).toBe("Hi");
  });

  it("has no profile block when the Learner shared nothing", async () => {
    const db = await testDb();
    const { client, requests } = scriptedClient([{ content: [text("Hello.")] }]);
    await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Hi"));
    expect(openingOf(requests[0])).not.toContain("Learner Profile");
  });

  it("an edit in the middle of a Session takes effect at the next turn, as a new block; the opening is not rebuilt", async () => {
    const db = await testDb();
    await saveProfile(db, profileInput.parse({ work: "Nurse" }), new Date(), OWNER_LEARNER_ID);
    let t = Date.parse("2026-11-03T09:00:00Z");
    const now = () => new Date(t);
    const { client, requests } = scriptedClient([{ content: [text("One.")] }, { content: [text("Two.")] }, { content: [text("Three.")] }]);
    await collect(runTutorTurn({ db, client, map, now, learnerId: OWNER_LEARNER_ID }, "Hi"));
    await saveProfile(db, profileInput.parse({ work: "Teacher" }), new Date(), OWNER_LEARNER_ID);
    t += 60_000;
    await collect(runTutorTurn({ db, client, map, now, learnerId: OWNER_LEARNER_ID }, "Again"));
    // The same Session replays the opening it started with, and the edit follows as a new block.
    expect(await listSessions(db, OWNER_LEARNER_ID)).toHaveLength(1);
    expect(openingOf(requests[1])).toContain("- Work: Nurse");
    expect(openingOf(requests[1])).not.toContain("Teacher");
    expect(String(requests[1].messages.at(-1)!.content)).toContain("- Work: Teacher");
    t += 7 * 3600_000;
    await collect(runTutorTurn({ db, client, map, now, learnerId: OWNER_LEARNER_ID }, "Third"));
    expect(await listSessions(db, OWNER_LEARNER_ID)).toHaveLength(1);
    expect(requests[2].messages.filter((m) => m.role === "system")).toHaveLength(1);
  });

  it("the instructions say the profile is used only when the Learner asks how an idea applies to them, never as advice", () => {
    expect(TUTOR_INSTRUCTIONS).toMatch(/Learner Profile/);
    expect(TUTOR_INSTRUCTIONS).toMatch(/only when the Learner asks how an idea applies to them/);
    expect(TUTOR_INSTRUCTIONS).toMatch(/never advice/i);
  });
});
