import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { parseCourseMap, type CourseMap } from "@/course/map";
import type { TeachingStep } from "@/course/navigator";
import type { Db } from "@/db/types";
import { OWNER_LEARNER_ID } from "@/db/schema";
import { loadProgress, saveCheckResult, saveFinishedStep } from "@/learner/memory";
import { checkTabNow, type OpenQuiz } from "@/learner/quiz";
import { presentValueOnly } from "@/test/present-value-map";
import { testDb } from "@/test/pglite";
import { scriptedClient, type ScriptedReply } from "@/test/scripted-client";
import { submitQuizAnswers } from "./check-results";
import { loadThread, type ThreadEntry } from "./transcript";
import { runTutorTurn, type TurnEvent, type TurnInput } from "./turn";

/**
 * Seam 1, Tutor Turn: a passed Topic stops at its Topic complete card. The card is a display-only Session item
 * stored at the end of the passed Topic's conversation; it is never sent to the model, and no turn for another
 * Topic runs.
 */

/** Present value with no quiz and no Insight: Story, Concept, Your turn, Check, Reveal, Principle. */
const plain = presentValueOnly({ withoutQuiz: true, withoutInsight: true });
/** The same Topic once its quiz Check was added as a required Check: a Learner who passed it without the quiz owes it as a Due Check. */
const withQuiz = requiredQuiz(presentValueOnly({ withoutInsight: true }));

function requiredQuiz(from: CourseMap): CourseMap {
  const topic = from.topic("present-value")!;
  const checks = topic.checks.map((c) => (c.kind === "quiz" ? { ...c, required: true } : c));
  const { map, errors } = parseCourseMap([{ name: "present-value.yaml", text: stringify({ ...topic, checks, connections: undefined, prerequisites: [] }) }]);
  if (!map) throw new Error(errors.join("\n"));
  return map;
}
const principle = plain.topic("present-value")!.principle.replace(/\s+/g, " ").trim();
const firstSentence = principle.slice(0, principle.indexOf(". ") + 1);

const say = (text: string): ScriptedReply => ({ content: [{ type: "text", text }] });

async function collect(events: AsyncIterable<TurnEvent>) {
  const out: TurnEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

async function turn(db: Db, input: TurnInput, replies: ScriptedReply[], map: CourseMap = plain) {
  const { client, requests } = scriptedClient(replies);
  const events = await collect(runTutorTurn({ db, client, map }, input));
  return { events, requests };
}

const seen = (entries: ThreadEntry[]) => entries.map((e) => (e.role === "item" ? e : { role: e.role, text: e.text }));
const sessionOf = (events: TurnEvent[]) => (events.at(-1) as Extract<TurnEvent, { type: "done" }>).ref.sessionId;
const sent = (request: { messages: unknown[] }) => JSON.stringify(request.messages);

async function saveSteps(db: Db, map: CourseMap, steps: TeachingStep[]) {
  for (const step of steps) {
    const moved = await saveFinishedStep(db, map, step);
    if (!moved.ok) throw new Error(moved.reason);
  }
}

/** Walks Present value to its Principle; returns the Topic's Session. */
async function atPrinciple(db: Db) {
  const first = await turn(db, "Hi", [say("Once upon a time.")]);
  await saveSteps(db, plain, ["story", "concept", "your_turn"]);
  await saveCheckResult(db, plain, { checkId: plain.topic("present-value")!.checks[0].id, passed: true, evidence: "Explained it." });
  await saveSteps(db, plain, ["reveal"]);
  return sessionOf(first.events);
}

const card = { kind: "topic_complete", data: { topicId: "present-value", title: "Present value", principle: firstSentence, next: null } };

describe("a passed Topic", () => {
  it("stops at its Topic complete card after the Tutor's closing reply, and no turn for another Topic runs", async () => {
    const db = await testDb();
    const sessionId = await atPrinciple(db);

    const closed = await turn(db, { next: "complete" }, [say("Well done: that is the Topic.")]);
    // The card comes after the closing reply, then the turn ends: the scripted client was asked once.
    expect(closed.events.map((e) => e.type)).toEqual(["text", "item", "done"]);
    expect(closed.events[1]).toEqual({ type: "item", item: card });
    expect(closed.requests).toHaveLength(1);
    expect((closed.events.at(-1) as Extract<TurnEvent, { type: "done" }>).shown).toEqual({ sessionId });

    // A reload draws the card at the end of the passed Topic's conversation.
    expect(seen(await loadThread(db, sessionId, plain)).slice(-2)).toEqual([{ role: "assistant", text: "Well done: that is the Topic." }, { role: "item", ...card }]);
    // The card is never sent to the model.
    expect(sent(closed.requests[0])).not.toContain("topic_complete");
  });

  it("finished by the Tutor at its Principle gets the card after the reply that closes it", async () => {
    const db = await testDb();
    const sessionId = await atPrinciple(db);
    await turn(db, { next: "principle" }, [say("The principle: money today is worth more.")]);
    const finished = await turn(db, "Got it.", [
      { content: [{ type: "tool_use", id: "t1", name: "finish_teaching_step", input: { step: "principle" } }], stop_reason: "tool_use" },
      say("That closes the Topic."),
    ]);
    expect((await loadProgress(db)).topics["present-value"]).toMatchObject({ status: "passed" });
    expect(finished.events.filter((e) => e.type === "item")).toEqual([{ type: "item", item: card }]);
    expect(seen(await loadThread(db, sessionId, plain)).at(-1)).toEqual({ role: "item", ...card });
  });

  it("passing its last Due Check by quiz stores the card after the result card, with no turn", async () => {
    const db = await testDb();
    const sessionId = await atPrinciple(db);
    await turn(db, { next: "complete" }, [say("Well done.")]);

    // The quiz Check is added: the passed Topic owes it, and its Session reopens for the Due Check run.
    await turn(db, "Ready for the new Check.", [say("Here is the new concept.")], withQuiz);
    await saveSteps(db, withQuiz, ["concept", "your_turn"]);
    const quiz = (await checkTabNow(db, withQuiz, new Date(), OWNER_LEARNER_ID)).quiz as OpenQuiz;
    const right = Object.fromEntries(quiz.questions.map((q) => [q.id, withQuiz.question(q.id)!.answer]));
    const result = await submitQuizAnswers(db, withQuiz, quiz.attemptId, right, new Date(), OWNER_LEARNER_ID);
    expect(result).toMatchObject({ ok: true, passed: true, complete: card });

    const items = seen(await loadThread(db, sessionId, withQuiz)).filter((e) => e.role === "item");
    expect(items.map((e) => e.role === "item" && e.kind)).toEqual(["topic_complete", "due_check", "check_result", "topic_complete"]);
  });
});
