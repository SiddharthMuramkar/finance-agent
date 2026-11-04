import { describe, expect, it } from "vitest";
import { noteItems, OWNER_LEARNER_ID } from "@/db/schema";
import type { Db } from "@/db/types";
import { saveFinishedStep } from "@/learner/memory";
import { checkTabNow } from "@/learner/quiz";
import { presentValueOnly } from "@/test/present-value-map";
import { testDb } from "@/test/pglite";
import { scriptedClient, type ScriptedReply } from "@/test/scripted-client";
import { runTutorTurn, type TurnEvent, type TurnInput } from "./turn";

/**
 * The saved rule through a Tutor Turn (ticket #248, review item 7): the Learner types a rule, the Tutor calls
 * save_learner_rule and replies. A rule that leaks an open quiz answer is refused by the tool itself.
 */

const map = presentValueOnly({ withoutInsight: true });
const say = (text: string): ScriptedReply => ({ content: [{ type: "text", text }] });
const save = (id: string, words: string): ScriptedReply => ({ content: [{ type: "tool_use", id, name: "save_learner_rule", input: { learner_words: words } }] });

async function turn(db: Db, input: TurnInput, replies: ScriptedReply[]) {
  const { client, requests } = scriptedClient(replies);
  const events: TurnEvent[] = [];
  for await (const e of runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, input)) events.push(e);
  return { events, requests };
}

async function toQuiz(db: Db) {
  await turn(db, "Hi", [say("Once, a lottery winner had a choice.")]);
  for (const step of ["story", "concept", "your_turn"] as const) await saveFinishedStep(db, map, step, new Date(), OWNER_LEARNER_ID);
  await checkTabNow(db, map, new Date(), OWNER_LEARNER_ID);
}

const lastResult = (requests: { messages: { content?: unknown }[] }[]) =>
  requests
    .at(-1)!
    .messages.flatMap((m) => (Array.isArray(m.content) ? (m.content as { type: string; is_error?: boolean; content?: unknown }[]).filter((b) => b.type === "tool_result") : []))
    .at(-1)!;

describe("save_learner_rule with a quiz open", () => {
  it("saves a rule that gives nothing away, and the reply goes out", async () => {
    const db = await testDb();
    await toQuiz(db);
    const words = "money later is worth less than money now";
    const { events, requests } = await turn(db, `so ${words}`, [save("r1", words), say("Yes, waiting costs you something.")]);
    expect((await db.select().from(noteItems)).filter((n) => n.kind === "own_rule")).toHaveLength(1);
    expect(lastResult(requests).is_error).not.toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "done" });
  });

  it("refuses a rule that gives away an open answer, and saves nothing", async () => {
    const db = await testDb();
    await toQuiz(db);
    const words = "the present value of $1,100 at 10% for a year is $1,000";
    const { events, requests } = await turn(db, `so ${words}`, [save("r1", words), say("Good thinking, that is worth testing.")]);
    expect((await db.select().from(noteItems)).filter((n) => n.kind === "own_rule")).toHaveLength(0);
    expect(JSON.stringify(lastResult(requests).content)).toContain("still working on");
    expect(events.at(-1)).toMatchObject({ type: "done" });
  });
});
