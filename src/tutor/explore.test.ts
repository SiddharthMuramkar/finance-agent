import { asc } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { insightAttempts, OWNER_LEARNER_ID } from "@/db/schema";
import { navigate } from "@/course/navigator";
import { loadProgress, saveCheckResult, saveFinishedStep } from "@/learner/memory";
import { presentValueOnly } from "@/test/present-value-map";
import { scriptedClient, type ScriptedReply } from "@/test/scripted-client";
import { testDb } from "@/test/pglite";
import { runTutorTurn, type TurnEvent, type TurnInput } from "./turn";
import { latestTurn, turnKind } from "./turn-status";

/** Tutor Turn tests for the explore step and Insight recording (ADR 0001), with a scripted Anthropic client and the real migrations. */

const map = presentValueOnly({ withoutQuiz: true });
const insight = map.topic("present-value")!.insight!;
const REVEAL_MARK = "877,784,124";

async function collect(events: AsyncIterable<TurnEvent>) {
  for await (const _ of events) void _;
}

/** A Learner at the explore step of present value: story and concept are done. */
async function atExplore() {
  const db = await testDb();
  for (const step of ["story", "concept"] as const) await saveFinishedStep(db, map, step, new Date(), OWNER_LEARNER_ID);
  return db;
}

const attempt = (id: string, outcome: string, words: string) => ({
  content: [{ type: "tool_use", id, name: "record_insight_attempt", input: { outcome, learner_words: words } }],
});
const finish = (id: string, step: string) => ({ content: [{ type: "tool_use", id, name: "finish_teaching_step", input: { step } }] });
const say = (text: string): ScriptedReply => ({ content: [{ type: "text", text }] });

type Request = ReturnType<typeof scriptedClient>["requests"][number];
const toolResults = (request: Request) =>
  request.messages.flatMap((m) =>
    Array.isArray(m.content) ? (m.content as { type: string; tool_use_id?: string; is_error?: boolean; content?: unknown }[]).filter((b) => b.type === "tool_result") : [],
  );
const everything = (request: Request) => JSON.stringify(request.messages);

async function turn(db: Awaited<ReturnType<typeof testDb>>, message: TurnInput, replies: ScriptedReply[]) {
  const { client, requests } = scriptedClient(replies);
  await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, message));
  return requests;
}

describe("explore step in the Tutor Turn", () => {
  it("sends the question and what counts as found, and never the written Insight or the reveal", async () => {
    const db = await atExplore();
    const [request] = await turn(db, "Ready.", [say("Here is a question.")]);
    const sent = everything(request);
    expect(sent).toContain("Teaching Step: explore");
    expect(sent).toContain("Move the interest rate up and down");
    expect(sent).toContain("The Insight is found when");
    expect(sent).toContain("No hint has been released yet.");
    expect(sent).not.toContain("money today beats bigger payments later");
    expect(sent).not.toContain(REVEAL_MARK);
    expect(sent).not.toContain("Reveal (what happened)");
    expect(sent).toContain("cannot finish explore yet");
  });

  it("tells the Tutor the Topic's own Explore Widget is already on screen, and not to draw it", async () => {
    const db = await atExplore();
    const [request] = await turn(db, "Ready.", [say("Here is a question.")]);
    const sent = everything(request);
    expect(sent).toContain("Explore Widget. Code has put it on screen already");
    expect(sent).toContain("Do not draw it yourself");
    expect(sent).not.toContain("the Widget you drew at the concept step");
    // The Widget's code itself is not sent: it only draws, and the Tutor needs no copy of it.
    expect(sent).not.toContain("AnnuityChart(");
  });

  it("lists the Guided Tasks under the Explore Widget as practice, without the Widget's code or their conditions", async () => {
    const db = await atExplore();
    const [request] = await turn(db, "Ready.", [say("Here is a question.")]);
    const sent = everything(request);
    expect(sent).toContain("Guided Tasks under the Explore Widget");
    expect(sent).toContain("1. Set the rate to 0%: the payments are worth the advertised $1.537B 2. Find the rate where the annuity is worth the same as the cash");
    expect(sent).toContain("do not mark them");
    expect(sent).not.toContain("$rate");
    expect(sent).not.toContain("GuidedTask(");
  });

  it("goes hint 1, hint 2, then tells the Insight, saving the Learner's exact words each time", async () => {
    const db = await atExplore();
    const first = await turn(db, "The bars get smaller", [attempt("t1", "not_yet", "the bars get smaller"), say("Try the far bars.")]);
    const hint1 = toolResults(first[1])[0].content as string;
    expect(hint1).toContain(`Hint 1 for the Learner: ${insight.hints[0].trim()}`);
    expect(hint1).not.toContain(insight.written.trim());

    const second = await turn(db, "Still the bars shrink", [attempt("t2", "not_yet", "Still the bars shrink"), say("Compare with today.")]);
    const hint2 = toolResults(second.at(-1)!).at(-1)!.content as string;
    expect(hint2).toContain(`Hint 2 for the Learner: ${insight.hints[1].trim()}`);
    expect(hint2).not.toContain(insight.written.trim());
    // The hints released so far are in the next context, the written Insight still is not.
    const [third] = await turn(db, "Hmm", [say("Take your time.")]);
    expect(everything(third)).toContain("Hints released so far");
    expect(everything(third)).not.toContain(insight.written.trim());

    const told = await turn(db, "I give up on this one", [attempt("t3", "not_yet", "I give up on this one"), say("Here it is.")]);
    const result = toolResults(told.at(-1)!).at(-1)!.content as string;
    expect(result).toContain("the Insight is told");
    expect(result).toContain(insight.written.trim());

    const rows = await db.select().from(insightAttempts).orderBy(asc(insightAttempts.id));
    expect(rows.map((r) => [r.reported, r.released, r.words])).toEqual([
      ["not_yet", "hint_1", "The bars get smaller"],
      ["not_yet", "hint_2", "Still the bars shrink"],
      ["not_yet", "told", "I give up on this one"],
    ]);
  });

  it("tells the Insight at once when the Learner asks to be told, and cannot finish explore in that turn", async () => {
    const db = await atExplore();
    const requests = await turn(db, "Just tell me", [
      attempt("t1", "asked_to_be_told", "Just tell me"),
      finish("f1", "explore"),
      say("Here it is."),
    ]);
    expect(toolResults(requests[1])[0].content).toContain(insight.written.trim());
    const rejection = toolResults(requests[2]).find((r) => r.tool_use_id === "f1")!;
    expect(rejection.is_error).toBe(true);
    expect(rejection.content).toContain("began during this turn");
    expect(navigate(map, await loadProgress(db, OWNER_LEARNER_ID))?.step).toBe("explore");

    // The next turn can finish it, and the Learner moves on to their turn.
    await turn(db, "Okay, I see", [finish("f2", "explore"), say("Your turn.")]);
    expect(navigate(map, await loadProgress(db, OWNER_LEARNER_ID))).toMatchObject({ step: "your_turn", check: { id: "pv-jackpot-choice" } });
  });

  it("confirms a found Insight against the Learner's own words and lets explore be finished in the same turn", async () => {
    const db = await atExplore();
    const requests = await turn(db, "A high rate shrinks later payments, so cash now can beat more later.", [
      attempt("t1", "found", "A high rate shrinks later payments, so cash now can beat more later."),
      finish("f1", "explore"),
      say("Exactly what you said."),
    ]);
    const found = toolResults(requests[1])[0].content as string;
    expect(found).toContain("the Learner found the Insight");
    expect(found).toContain("final text of your reply");
    expect(found).toContain(insight.written.trim());
    expect(navigate(map, await loadProgress(db, OWNER_LEARNER_ID))?.step).toBe("your_turn");
  });

  it("refuses to finish explore until the Insight is found or told", async () => {
    const db = await atExplore();
    const requests = await turn(db, "Skip this", [finish("f1", "explore"), say("Okay.")]);
    const refused = toolResults(requests[1])[0];
    expect(refused.is_error).toBe(true);
    expect(refused.content).toMatch(/Insight/);
    expect(navigate(map, await loadProgress(db, OWNER_LEARNER_ID))?.step).toBe("explore");
  });

  it("does not record words that are not in the Learner's message this turn", async () => {
    const db = await atExplore();
    const requests = await turn(db, "I am not sure where to start", [attempt("t1", "found", "higher rates shrink later payments"), say("Try the sliders.")]);
    const result = toolResults(requests[1])[0];
    expect(result.is_error).toBe(true);
    expect(result.content).toContain("not in the Learner's message");
    expect(await db.select().from(insightAttempts)).toEqual([]);
  });

  it("never counts Finish this reply as an attempt: its note is code-written", async () => {
    const db = await atExplore();
    const requests = await turn(db, { finish: true }, [attempt("t1", "not_yet", "Finish"), say("Have a play with the Widget.")]);
    const result = toolResults(requests[1])[0];
    expect(result.is_error).toBe(true);
    expect(result.content).toContain("a note code wrote");
    expect(result.content).not.toMatch(/Continue/);
    expect(await db.select().from(insightAttempts)).toEqual([]);
  });

  it("never counts a help chip's message as an attempt, while a typed answer still counts", async () => {
    const db = await atExplore();
    // "Explain that more simply." is the old chip's words, which old Sessions still hold: it still reads as a chip turn.
    for (const words of ["Go deeper.", "Show me in a widget.", "Explain that more simply."]) {
      const requests = await turn(db, words, [attempt("c-" + words, "not_yet", words), say("Here it is another way.")]);
      const result = toolResults(requests[1])[0];
      expect(result.is_error).toBe(true);
      expect(result.content).toContain("never an attempt at the Insight");
      // The chip's exact words are the Learner's message, and the turn records its kind as chip.
      expect(everything(requests[0])).toContain(JSON.stringify(words).slice(1, -1));
      expect(turnKind((await latestTurn(db, OWNER_LEARNER_ID))!)).toBe("chip");
    }
    expect(await db.select().from(insightAttempts)).toEqual([]);

    await turn(db, "The far bars shrink most", [attempt("t1", "not_yet", "The far bars shrink most"), say("Try comparing.")]);
    const rows = await db.select().from(insightAttempts);
    expect(rows.map((r) => [r.reported, r.released, r.words])).toEqual([["not_yet", "hint_1", "The far bars shrink most"]]);
  });

  it("never counts a code-written message (an opener's or a Next's note) as an attempt", async () => {
    const db = await atExplore();
    // The Tutor quotes some of the opener's note as if the Learner had said it.
    const { client, requests } = scriptedClient([attempt("o1", "not_yet", "Opener by code"), say("Have a look.")]);
    await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, { opener: true }));
    const result = toolResults(requests[1])[0];
    expect(result.is_error).toBe(true);
    expect(result.content).toContain("never an attempt at the Insight");
    expect(await db.select().from(insightAttempts)).toEqual([]);
  });

  it("counts the Just tell me chip only as asking to be told, never as a not-yet attempt", async () => {
    const db = await atExplore();
    const requests = await turn(db, "Just tell me.", [attempt("t1", "not_yet", "Just tell me."), say("Here it is.")]);
    const result = toolResults(requests[1])[0];
    expect(result.content).toContain("the Insight is told");
    expect(result.content).toContain(insight.written.trim());
    const rows = await db.select().from(insightAttempts);
    expect(rows.map((r) => [r.reported, r.released])).toEqual([["asked_to_be_told", "told"]]);
  });

  it("records an attempt once per tool call ID", async () => {
    const db = await atExplore();
    await turn(db, "Bars shrink", [attempt("same", "not_yet", "Bars shrink"), attempt("same", "not_yet", "Bars shrink"), say("Hint given.")]);
    expect(await db.select().from(insightAttempts)).toHaveLength(1);
  });

  it("does not record an attempt at a step that began in the same turn", async () => {
    const db = await testDb();
    await saveFinishedStep(db, map, "story", new Date(), OWNER_LEARNER_ID);
    // The Tutor finishes the concept step, then tries to record an attempt from the same message.
    const requests = await turn(db, "ok go on, bars shrink", [
      finish("f1", "concept"),
      attempt("t1", "not_yet", "bars shrink"),
      say("Here is the question."),
    ]);
    const results = toolResults(requests.at(-1)!);
    const rejected = results.find((r) => r.tool_use_id === "t1");
    expect(rejected?.is_error).toBe(true);
    expect(rejected?.content).toContain("began during this turn");
    expect(await db.select().from(insightAttempts)).toEqual([]);
  });

  it("reminds the Tutor after two turns at explore with no attempt", async () => {
    const db = await atExplore();
    const [one] = await turn(db, "What do I do?", [say("Play with the Widget.")]);
    expect(everything(one)).not.toContain("Reminder");
    await turn(db, "Still looking", [say("Take your time.")]);
    const [three] = await turn(db, "Hmm", [say("Say what you notice.")]);
    expect(everything(three)).toContain("Reminder: the Learner has not yet tried the question");
  });

  it("gives the principle step the Learner's own Insight words", async () => {
    const db = await atExplore();
    await turn(db, "Cash now beats later at high rates", [attempt("t1", "found", "Cash now beats later at high rates"), say("Yes.")]);
    // Move on with progress saved directly, as earlier turns would have.
    await saveFinishedStep(db, map, "explore", new Date(), OWNER_LEARNER_ID);
    await saveFinishedStep(db, map, "your_turn", new Date(), OWNER_LEARNER_ID);
    await saveCheckResult(db, map, { checkId: "pv-jackpot-choice", passed: true }, new Date(), OWNER_LEARNER_ID);
    await saveFinishedStep(db, map, "reveal", new Date(), OWNER_LEARNER_ID);
    const [request] = await turn(db, "Go on", [say("The principle.")]);
    expect(everything(request)).toContain("Teaching Step: principle");
    expect(everything(request)).toContain(`The Learner's own words about the Insight (found by themselves): \\"Cash now beats later at high rates\\"`);
  });

  it("marks words saved after being told as such at the principle step", async () => {
    const db = await atExplore();
    await turn(db, "Just tell me please", [attempt("t1", "asked_to_be_told", "Just tell me please"), say("Here.")]);
    await saveFinishedStep(db, map, "explore", new Date(), OWNER_LEARNER_ID);
    await saveFinishedStep(db, map, "your_turn", new Date(), OWNER_LEARNER_ID);
    await saveCheckResult(db, map, { checkId: "pv-jackpot-choice", passed: true }, new Date(), OWNER_LEARNER_ID);
    await saveFinishedStep(db, map, "reveal", new Date(), OWNER_LEARNER_ID);
    const [request] = await turn(db, "Go on", [say("The principle.")]);
    expect(everything(request)).toContain("after being told it");
  });
});

describe("settling the Insight is enforced by the database", () => {
  it("lets only one of two simultaneous settling attempts through", async () => {
    const { saveInsightAttempt } = await import("@/learner/insight");
    const db = await atExplore();
    const input = (toolCallId: string) => ({ reported: "found" as const, words: "money now is worth more", learnerMessage: "I think money now is worth more", toolCallId, model: "m", turnId: 1 });
    const results = await Promise.all([saveInsightAttempt(db, map, input("a"), new Date(), OWNER_LEARNER_ID), saveInsightAttempt(db, map, input("b"), new Date(), OWNER_LEARNER_ID)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await db.select().from(insightAttempts)).filter((r) => r.released === "found")).toHaveLength(1);
  });
});
