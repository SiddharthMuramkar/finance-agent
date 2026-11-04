import { eq } from "drizzle-orm";
import { stringify } from "yaml";
import { describe, expect, it } from "vitest";
import { loadCourseMap, parseCourseMap, type CourseMap } from "@/course/map";
import { messages, OWNER_LEARNER_ID, sessions as sessionsTable, settings, topicProgress } from "@/db/schema";
import type { Db } from "@/db/types";
import { learnerSummary, loadCheckResults, loadProgress, openCurrentTopic, saveFinishedStep, saveJump } from "@/learner/memory";
import { openQuiz, submitQuiz } from "@/learner/quiz";
import { profileInput, saveProfile } from "@/learner/profile";
import { OPENING_PREFIX } from "./context";
import { TUTOR_INSTRUCTIONS } from "./instructions";
import { presentValueOnly } from "@/test/present-value-map";
import { testDb } from "@/test/pglite";
import { scriptedClient, type ScriptedReply } from "@/test/scripted-client";
import { listSessions, loadCurrentSession, loadSession } from "./transcript";
import { passedTopicShown, shownInWorkspace, topicSessions, type Shown } from "./session-log";
import { latestTurn, runTutorTurn, type TurnEvent, type TurnInput } from "./turn";
import { startTurn, turnKind, updateTurn } from "./turn-status";

/**
 * One Session per Topic (ADR 0004, spec #119): the Tutor Turn on in-memory Postgres with the real
 * migrations and the scripted Tutor client. A Session is one Learner's whole conversation about one
 * Topic; the model is sent only that Topic's messages.
 */

/** The real present value Topic (no Insight; no quiz unless asked) plus a second Topic, "Bond prices". */
function withBonds({ quiz = false } = {}): CourseMap {
  const base = presentValueOnly({ real: loadCourseMap(), withoutQuiz: !quiz, withoutInsight: true });
  const pv = base.topic("present-value")!;
  const files = [
    { name: "present-value.yaml", text: stringify(pv) },
    {
      name: "bonds.yaml",
      text: stringify({
        ...pv,
        id: "bonds",
        title: "Bond prices",
        path: 30,
        prerequisites: [],
        cases: pv.cases.map((c) => ({ ...c, id: "bonds-case" })),
        widgets: undefined,
        checks: [{ id: "bonds-check", kind: "conversation", prompt: "Why do prices fall?", passCriteria: "Discounting." }],
        questions: undefined,
        insight: undefined,
        explore: undefined,
        connections: [],
      }),
    },
  ];
  const { map, errors } = parseCourseMap(files);
  if (!map) throw new Error(errors.join("\n"));
  return map;
}
const twoTopics = withBonds();

const say = (text: string): ScriptedReply => ({ content: [{ type: "text", text }] });

async function collect(events: AsyncIterable<TurnEvent>) {
  const out: TurnEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

/** Runs one turn with its own scripted replies; returns the events and the model requests it made. */
async function turn(db: Db, input: TurnInput, replies: ScriptedReply[], map = twoTopics, shown?: Shown) {
  const { client, requests } = scriptedClient(replies);
  const events = await collect(runTutorTurn({ db, client, map, shown, learnerId: OWNER_LEARNER_ID }, input));
  return { events, requests };
}

const sent = (request: { messages: unknown[] }) => JSON.stringify(request.messages);
const texts = async (db: Db, map = twoTopics) => (await loadCurrentSession(db, map, OWNER_LEARNER_ID)).map((l) => l.text);

describe("one Session per Topic", () => {
  it("A → B → A: each Topic shows only its own messages, and B's model request holds nothing from A", async () => {
    const db = await testDb();
    await saveJump(db, twoTopics, "present-value", new Date(), OWNER_LEARNER_ID);
    await turn(db, "Tell me about the lottery.", [say("Picture October 2018.")]);
    expect(await texts(db)).toEqual(["Tell me about the lottery.", "Picture October 2018."]);

    await saveJump(db, twoTopics, "bonds", new Date(), OWNER_LEARNER_ID);
    // The page renders B before its first turn: an empty thread, and no Session made by rendering.
    expect(await texts(db)).toEqual([]);
    const b = await turn(db, "What were we just talking about?", [say("We are starting on bond prices.")]);
    expect(sent(b.requests[0])).not.toContain("Tell me about the lottery.");
    expect(sent(b.requests[0])).not.toContain("Picture October 2018.");
    expect(await texts(db)).toEqual(["What were we just talking about?", "We are starting on bond prices."]);

    await saveJump(db, twoTopics, "present-value", new Date(), OWNER_LEARNER_ID);
    expect(await texts(db)).toEqual(["Tell me about the lottery.", "Picture October 2018."]);
    const a = await turn(db, "Go on.", [say("The winner had a choice.")]);
    expect(sent(a.requests[0])).toContain("Picture October 2018.");
    expect(sent(a.requests[0])).not.toContain("bond prices");
    expect(await texts(db)).toEqual(["Tell me about the lottery.", "Picture October 2018.", "Go on.", "The winner had a choice."]);
  });

  it("sends the Where the Learner stands block again, as a new message, only when it changes; nothing already sent is rebuilt", async () => {
    const db = await testDb();
    await saveJump(db, twoTopics, "present-value", new Date(), OWNER_LEARNER_ID);
    await saveProfile(db, profileInput.parse({ work: "Nurse" }), new Date(), OWNER_LEARNER_ID);
    const first = await turn(db, "Hi", [say("Hello.")]);
    const second = await turn(db, "Again", [say("Still here.")]);
    // Unchanged: no new block, and the opening message replays as it was sent.
    expect(second.requests[0].messages[0]).toEqual(first.requests[0].messages[0]);
    expect(second.requests[0].messages.filter((m) => m.role === "system")).toEqual([]);

    await saveProfile(db, profileInput.parse({ work: "Teacher" }), new Date(), OWNER_LEARNER_ID);
    const third = await turn(db, "And now?", [say("Teaching, then.")]);
    const sentNow = third.requests[0].messages;
    expect(sentNow[0]).toEqual(first.requests[0].messages[0]);
    expect(sentNow.at(-2)).toMatchObject({ role: "user", content: "And now?" });
    expect(sentNow.at(-1)).toMatchObject({ role: "system" });
    const block = String(sentNow.at(-1)!.content);
    expect(block.startsWith(OPENING_PREFIX)).toBe(true);
    expect(block).toContain("- Work: Teacher");
    expect(block).toContain("Course Navigator:");

    const fourth = await turn(db, "Fine.", [say("Good.")]);
    expect(fourth.requests[0].messages.filter((m) => m.role === "system")).toHaveLength(1);
  });

  it("the Tutor's instructions point it to the latest Where the Learner stands block, and to this Topic alone", () => {
    expect(TUTOR_INSTRUCTIONS).toContain("the latest Where the Learner stands block");
    expect(TUTOR_INSTRUCTIONS).not.toContain("The summary at the start of a Session");
    expect(TUTOR_INSTRUCTIONS).not.toContain("when the first message holds");
    expect(TUTOR_INSTRUCTIONS).toContain("This conversation is about one Topic");
  });

  it("a refused turn stays on screen, but every row of it is left out of later requests, in the same Session", async () => {
    const db = await testDb();
    await saveJump(db, twoTopics, "present-value", new Date(), OWNER_LEARNER_ID);
    await turn(db, "Hi", [say("Hello.")]);
    const calc = { type: "tool_use", id: "toolu_calc", name: "calculate", input: { expression: "100 / 1.08" } };
    const refused = await turn(db, "Something odd", [
      { content: [{ type: "text", text: "Let me work that out." }, calc], stop_reason: "tool_use" },
      { content: [{ type: "text", text: "I can't help with tha" }], stop_reason: "refusal" },
    ]);
    expect(refused.events).toContainEqual({
      type: "refusal",
      message: "The Tutor declined to answer that message. Nothing was changed, and your place is the same. Try asking another way.",
      text: "Let me work that out.",
    });
    // Shown as it was left: the Learner's message and the text kept from before the refusal.
    expect(await texts(db)).toEqual(["Hi", "Hello.", "Something odd", "Let me work that out."]);

    const next = await turn(db, "Let me ask another way", [say("Sure.")]);
    expect(await listSessions(db, OWNER_LEARNER_ID)).toHaveLength(1);
    const request = sent(next.requests[0]);
    for (const left of ["Something odd", "Let me work that out.", "toolu_calc", "I can't help"]) expect(request).not.toContain(left);
    expect(request).toContain("Hello.");
    expect(next.requests[0].messages.at(-1)).toMatchObject({ role: "user", content: "Let me ask another way" });
  });

  it("a turn from a tab showing another Topic's Session, or an opener for another Topic, is refused and changes nothing", async () => {
    const db = await testDb();
    await saveJump(db, twoTopics, "present-value", new Date(), OWNER_LEARNER_ID);
    // The page shows no Session yet, so it sends its Topic; the done event says what it shows next.
    const first = await turn(db, "Hi", [say("Hello.")], twoTopics, { topicId: "present-value" });
    const done = first.events.at(-1) as Extract<TurnEvent, { type: "done" }>;
    expect(done.shown).toEqual({ sessionId: done.ref.sessionId });

    // Another tab chooses Bond prices.
    await saveJump(db, twoTopics, "bonds", new Date(), OWNER_LEARNER_ID);
    const staleMessage = "This Topic changed in another tab. Reload to carry on.";
    for (const shown of [done.shown, { topicId: "present-value" }]) {
      const stale = await turn(db, "Still on present value?", [say("Should not run.")], twoTopics, shown);
      expect(stale.events).toEqual([{ type: "stale", message: staleMessage }]);
      expect(stale.requests).toHaveLength(0);
    }
    const retried = await turn(db, { resume: true }, [say("Should not run.")], twoTopics, done.shown);
    expect(retried.events).toEqual([{ type: "stale", message: staleMessage }]);
    expect(await latestTurn(db, OWNER_LEARNER_ID)).toMatchObject({ status: "finished", input: "Hi" });

    // The tab that shows Bond prices carries on.
    const b = await turn(db, "Bonds, then.", [say("Bond prices.")], twoTopics, { topicId: "bonds" });
    expect(b.events.at(-1)).toMatchObject({ type: "done" });
  });

  it("a turn that failed before reaching a Session is set aside when the Learner chooses another Topic, so it never runs there", async () => {
    const db = await testDb();
    await saveJump(db, twoTopics, "present-value", new Date(), OWNER_LEARNER_ID);
    // A turn for present value failed before it had a Session (a database error before its Session was chosen).
    const failed = (await startTurn(db, new Date(), "Tell me about the lottery.", OWNER_LEARNER_ID))!;
    await updateTurn(db, failed.id, { status: "failed", error: "The database could not be reached." });
    // Choosing the same Topic again keeps it, with its Retry.
    await saveJump(db, twoTopics, "present-value", new Date(), OWNER_LEARNER_ID);
    expect(await latestTurn(db, OWNER_LEARNER_ID)).toMatchObject({ id: failed.id, status: "failed" });

    await saveJump(db, twoTopics, "bonds", new Date(), OWNER_LEARNER_ID);
    // Nothing unfinished is left, so Bond prices' page starts its opener rather than offering present value's Retry.
    expect((await latestTurn(db, OWNER_LEARNER_ID))?.status).toBe("finished");
    // A Retry from any tab sends nothing into Bond prices' Session.
    const retried = await turn(db, { resume: true }, [say("Should not run.")], twoTopics, { topicId: "bonds" });
    expect(retried.requests).toHaveLength(0);
    expect(await texts(db)).toEqual([]);
    const opener = await turn(db, { opener: true }, [say("Picture a bond.")], twoTopics, { topicId: "bonds" });
    expect(sent(opener.requests[0])).not.toContain("Tell me about the lottery.");
  });

  it("every Session from before is Older: never continued, never shown in the Study Workspace, and still readable", async () => {
    const db = await testDb();
    await saveJump(db, twoTopics, "present-value", new Date(), OWNER_LEARNER_ID);
    // As the expand migration left it: a Session that may hold several Topics, Older by default.
    const [old] = await db
      .insert(sessionsTable)
      .values({ learnerId: OWNER_LEARNER_ID, instructions: TUTOR_INSTRUCTIONS, tools: [], model: "claude-opus-5-5", effort: "medium", fingerprint: "old", topicId: "present-value" })
      .returning();
    await db.insert(messages).values({ sessionId: old.id, seq: 0, role: "user", content: "An old question about the Sensex." });
    expect(await texts(db)).toEqual([]);

    const fresh = await turn(db, "Hello.", [say("A fresh start.")]);
    expect(sent(fresh.requests[0])).not.toContain("Sensex");
    expect(await texts(db)).toEqual(["Hello.", "A fresh start."]);
    expect((await loadSession(db, old.id, twoTopics, OWNER_LEARNER_ID)).map((l) => l.text)).toEqual(["An old question about the Sensex."]);
  });

  it("with every Topic passed, the Learner talks to the Tutor in one Session with no Topic", async () => {
    const db = await testDb();
    for (const topicId of ["present-value", "bonds"]) await db.insert(topicProgress).values({ learnerId: OWNER_LEARNER_ID, topicId, step: "principle", status: "passed" });
    await turn(db, "What next?", [say("Every Topic is passed.")]);
    const again = await turn(db, "Tell me more.", [say("Ask me anything.")]);
    expect(sent(again.requests[0])).toContain("What next?");
    const [only, ...rest] = await db.select().from(sessionsTable);
    expect(rest).toEqual([]);
    expect(only).toMatchObject({ topicId: null, older: false });
    expect(await texts(db)).toEqual(["What next?", "Every Topic is passed.", "Tell me more.", "Ask me anything."]);
  });

  it("B7: a pass survives A → B → A, a deploy that changes the instructions, and a reload", async () => {
    const db = await testDb();
    await saveJump(db, twoTopics, "present-value", new Date(), OWNER_LEARNER_ID);
    for (const step of ["story", "concept", "your_turn"] as const) await saveFinishedStep(db, twoTopics, step, new Date(), OWNER_LEARNER_ID);
    const checkId = twoTopics.topic("present-value")!.checks[0].id;
    const verdict = { type: "tool_use", id: "toolu_pass", name: "record_check_verdict", input: { check_id: checkId, verdict: "pass", reasons: "Discounted each payment." } };
    await turn(db, "Each payment is worth less today.", [{ content: [verdict], stop_reason: "tool_use" }, say("That is a pass.")]);
    expect((await loadProgress(db, OWNER_LEARNER_ID)).topics["present-value"].passedChecks).toEqual([checkId]);

    await saveJump(db, twoTopics, "bonds", new Date(), OWNER_LEARNER_ID);
    await turn(db, "Bonds now.", [say("Bond prices.")]);
    await saveJump(db, twoTopics, "present-value", new Date(), OWNER_LEARNER_ID);
    await db.update(sessionsTable).set({ fingerprint: "an-earlier-build" });
    const back = await turn(db, "Where was I?", [say("Past the Check, at the reveal.")]);

    // Reload: the pass, the place and the Topic's own thread are all still there.
    expect((await loadProgress(db, OWNER_LEARNER_ID)).topics["present-value"].passedChecks).toEqual([checkId]);
    expect(await loadCheckResults(db, OWNER_LEARNER_ID)).toMatchObject([{ checkId, passed: true }]);
    expect(await learnerSummary(db, twoTopics, OWNER_LEARNER_ID)).toContain("Teaching Step: reveal");
    expect(sent(back.requests[0])).toContain("Teaching Step: reveal");
    expect(await texts(db)).toEqual(["Each payment is worth less today.", "That is a pass.", "Where was I?", "Past the Check, at the reveal."]);
  });

  it("a quiz result reaches only its own Topic's Session", async () => {
    const db = await testDb();
    const map = withBonds({ quiz: true });
    await saveJump(db, map, "present-value", new Date(), OWNER_LEARNER_ID);
    for (const step of ["story", "concept", "your_turn"] as const) await saveFinishedStep(db, map, step, new Date(), OWNER_LEARNER_ID);
    await turn(db, "Ready.", [say("Your quiz is on the right.")], map);
    const quiz = (await openQuiz(db, map, new Date(), OWNER_LEARNER_ID))!;
    await submitQuiz(db, map, quiz.attemptId, Object.fromEntries(quiz.questions.map((q) => [q.id, map.question(q.id)!.answer])), new Date(), OWNER_LEARNER_ID);

    await saveJump(db, map, "bonds", new Date(), OWNER_LEARNER_ID);
    const b = await turn(db, "Hello bonds.", [say("Bond prices.")], map);
    expect(sent(b.requests[0])).not.toContain("Quiz result by code");

    await saveJump(db, map, "present-value", new Date(), OWNER_LEARNER_ID);
    const a = await turn(db, "Back again.", [say("You passed.")], map);
    expect(sent(a.requests[0])).toContain(`Quiz result by code, Check ${quiz.checkId}, attempt 1`);
  });
});

describe("the opener: the page starts a Topic's first turn by itself", () => {
  it("stores no Learner message, is recorded as an opener turn, and teaches the Story of a Topic not yet started", async () => {
    const db = await testDb();
    await saveJump(db, twoTopics, "bonds", new Date(), OWNER_LEARNER_ID);
    const opened = await turn(db, { opener: true }, [say("Picture a bond in 1994.")], twoTopics, { topicId: "bonds" });
    expect(opened.events.at(-1)).toMatchObject({ type: "done" });

    // Only the Tutor's reply is on screen: no Learner bubble.
    expect(await texts(db)).toEqual(["Picture a bond in 1994."]);
    expect(turnKind((await latestTurn(db, OWNER_LEARNER_ID))!)).toBe("opener");
    const request = sent(opened.requests[0]);
    expect(request).toContain("Opener by code:");
    expect(request).toContain("Teach the Story");
    expect(request).toContain("Teaching Step: story.");
    // The opener started the Topic.
    expect((await loadProgress(db, OWNER_LEARNER_ID)).topics["bonds"]).toMatchObject({ step: "story", status: "in_progress" });
  });

  it("in a Topic already started, teaches the step reached, which nothing in this Session has taught yet", async () => {
    const db = await testDb();
    await saveJump(db, twoTopics, "present-value", new Date(), OWNER_LEARNER_ID);
    await turn(db, "Hi", [say("Hello.")]);
    await saveFinishedStep(db, twoTopics, "story", new Date(), OWNER_LEARNER_ID);
    // The Learner went to Bond prices and comes back to a Topic whose Session is new (as after the switch-over).
    await db.update(sessionsTable).set({ older: true });
    const opened = await turn(db, { opener: true }, [say("Now the concept.")], twoTopics, { topicId: "present-value" });
    const request = sent(opened.requests[0]);
    expect(request).toContain("at the concept step");
    expect(request).toContain("Nothing of this step has been taught in this Session yet");
    expect(request).toContain("Teaching Step: concept");
    expect(request).not.toContain("Teach the Story");
    expect(await texts(db)).toEqual(["Now the concept."]);
  });

  it("at an open quiz, points the Learner to the Check tab rather than teaching", async () => {
    const db = await testDb();
    const map = withBonds({ quiz: true });
    await saveJump(db, map, "present-value", new Date(), OWNER_LEARNER_ID);
    for (const step of ["story", "concept", "your_turn"] as const) await saveFinishedStep(db, map, step, new Date(), OWNER_LEARNER_ID);
    const opened = await turn(db, { opener: true }, [say("Your quiz is in the Check tab.")], map, { topicId: "present-value" });
    const request = sent(opened.requests[0]);
    expect(request).toContain("is open on the right, in the Check tab. Point the Learner to it");
    expect(await texts(db, map)).toEqual(["Your quiz is in the Check tab."]);
  });

  it("is refused once the Session has messages (another tab opened it first), and changes nothing", async () => {
    const db = await testDb();
    await saveJump(db, twoTopics, "bonds", new Date(), OWNER_LEARNER_ID);
    await turn(db, { opener: true }, [say("Picture a bond.")], twoTopics, { topicId: "bonds" });
    const again = await turn(db, { opener: true }, [say("Should not run.")], twoTopics, { topicId: "bonds" });
    expect(again.events).toEqual([{ type: "stale", message: "This Topic changed in another tab. Reload to carry on." }]);
    expect(again.requests).toHaveLength(0);
    expect(await texts(db)).toEqual(["Picture a bond."]);
  });

  it("a failed opener's Retry sends its note again and is still an opener", async () => {
    const db = await testDb();
    await saveJump(db, twoTopics, "bonds", new Date(), OWNER_LEARNER_ID);
    const failed = await turn(db, { opener: true }, [{ error: new Error("overloaded") }], twoTopics, { topicId: "bonds" });
    expect(failed.events.at(-1)).toMatchObject({ type: "error" });
    const retried = await turn(db, { resume: true }, [say("Picture a bond.")], twoTopics);
    expect(sent(retried.requests[0])).toContain("Opener by code:");
    expect(turnKind((await latestTurn(db, OWNER_LEARNER_ID))!)).toBe("opener");
    expect(await texts(db)).toEqual(["Picture a bond."]);
  });
});

describe("a Topic passed in a turn", () => {
  it("tells the Tutor \"Topic complete: stop here\" with no context for another Topic, starts nothing, and stays on screen", async () => {
    const db = await testDb();
    await saveJump(db, twoTopics, "present-value", new Date(), OWNER_LEARNER_ID);
    await turn(db, "Hi", [say("Hello.")]);
    await db.update(topicProgress).set({ step: "principle" });
    const finish = { type: "tool_use", id: "toolu_done", name: "finish_teaching_step", input: { step: "principle" } };
    const passed = await turn(db, "So money today is worth more.", [{ content: [{ type: "text", text: "Exactly." }, finish], stop_reason: "tool_use" }, say("Well done.")], twoTopics);

    const result = JSON.stringify(passed.requests[1].messages.at(-1));
    expect(result).toContain("Topic complete: stop here");
    expect(result).not.toContain("Bond prices");
    expect(result).not.toContain("Course Navigator:");
    // The next Topic is not started, and the Learner's shown Session is still the passed one.
    expect((await loadProgress(db, OWNER_LEARNER_ID)).topics).not.toHaveProperty("bonds");
    const done = passed.events.at(-1) as Extract<TurnEvent, { type: "done" }>;
    expect(done.shown).toEqual({ sessionId: done.ref.sessionId });
    expect(await shownInWorkspace(db, twoTopics, OWNER_LEARNER_ID)).toEqual({ sessionId: done.ref.sessionId });
    expect((await loadSession(db, done.ref.sessionId, twoTopics, OWNER_LEARNER_ID)).map((l) => l.text)).toEqual(["Hi", "Hello.", "So money today is worth more.", "Exactly.\n\nWell done."]);
    expect(await passedTopicShown(db, twoTopics, OWNER_LEARNER_ID, done.shown)).toBe("present-value");
    // Its page can send no more turns there: the Learner's current Topic has moved on.
    expect((await turn(db, "And now?", [say("Should not run.")], twoTopics, done.shown)).events.map((e) => e.type)).toEqual(["stale"]);

    // Choosing where to go shows that Topic: here, what comes next (Bond prices), before its first turn.
    await openCurrentTopic(db, OWNER_LEARNER_ID);
    expect(await shownInWorkspace(db, twoTopics, OWNER_LEARNER_ID)).toEqual({ topicId: "bonds" });
    expect(await passedTopicShown(db, twoTopics, OWNER_LEARNER_ID, { topicId: "bonds" })).toBeNull();
  });
});

describe("a deploy that changes the Tutor's instructions", () => {
  const thinking = (n: number) => ({ type: "thinking", thinking: `Thought ${n}.`, signature: `sig-${n}==` });

  it("refreezes instructions, tools, model and effort at the next new turn in the same Session; earlier thinking is never sent again, later thinking replays unchanged", async () => {
    const db = await testDb();
    await saveJump(db, twoTopics, "present-value", new Date(), OWNER_LEARNER_ID);
    const reply = (n: number): ScriptedReply => ({ content: [thinking(n), { type: "text", text: `Reply ${n}.` }] });
    await turn(db, "One", [reply(1)]);
    await turn(db, "Two", [reply(2)]);
    // As if the Session was frozen by an earlier build, on other settings.
    await db.update(sessionsTable).set({ fingerprint: "an-earlier-build", instructions: "Old instructions.", model: "claude-old", effort: "low" });
    await db.update(settings).set({ value: "high" }).where(eq(settings.key, "effort"));

    const three = await turn(db, "Three", [reply(3)]);
    const four = await turn(db, "Four", [reply(4)]);
    expect(await listSessions(db, OWNER_LEARNER_ID)).toHaveLength(1);
    for (const request of [...three.requests, ...four.requests]) {
      expect(request.system).toEqual([{ type: "text", text: TUTOR_INSTRUCTIONS, cache_control: { type: "ephemeral" } }]);
      expect(request.model).toBe("claude-opus-5-5");
      expect(request.output_config).toEqual({ effort: "high" });
      expect(sent(request)).not.toContain("Thought 1.");
      expect(sent(request)).not.toContain("Thought 2.");
      // Their text still replays.
      expect(sent(request)).toContain("Reply 2.");
    }
    expect(four.requests[0].messages).toContainEqual({ role: "assistant", content: [thinking(3), { type: "text", text: "Reply 3." }] });
    // No notice: the Learner carries on in the same Session.
    expect([...three.events, ...four.events].map((e) => e.type)).not.toContain("session");
  });
});

describe("the Course Map's passed rows", () => {
  it("find each Topic's own Session, never an Older one, so a passed row opens the right conversation", async () => {
    const db = await testDb();
    await db
      .insert(sessionsTable)
      .values({ learnerId: OWNER_LEARNER_ID, instructions: TUTOR_INSTRUCTIONS, tools: [], model: "claude-opus-5-5", effort: "medium", fingerprint: "old", topicId: "bonds" });
    await saveJump(db, twoTopics, "present-value", new Date(), OWNER_LEARNER_ID);
    await turn(db, "Tell me about the lottery.", [say("Picture October 2018.")]);
    await saveJump(db, twoTopics, "bonds", new Date(), OWNER_LEARNER_ID);
    await turn(db, "And bonds?", [say("Prices fall when rates rise.")]);

    const ids = await topicSessions(db, OWNER_LEARNER_ID);
    expect(Object.keys(ids).sort()).toEqual(["bonds", "present-value"]);
    expect((await loadSession(db, ids["present-value"], twoTopics, OWNER_LEARNER_ID)).map((l) => l.text)).toEqual(["Tell me about the lottery.", "Picture October 2018."]);
    expect((await loadSession(db, ids.bonds, twoTopics, OWNER_LEARNER_ID)).map((l) => l.text)).toEqual(["And bonds?", "Prices fall when rates rise."]);
  });
});
