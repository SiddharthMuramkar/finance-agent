import { describe, expect, it } from "vitest";
import type { Db } from "@/db/types";
import { insightAttempts, OWNER_LEARNER_ID } from "@/db/schema";
import { saveFinishedStep } from "@/learner/memory";
import { presentValueOnly } from "@/test/present-value-map";
import { testDb } from "@/test/pglite";
import { scriptedClient, type ScriptedReply } from "@/test/scripted-client";
import { REPLY_CHOICES } from "./session-item-kinds";
import { loadSessionItems } from "./session-items";
import { loadCurrentSession } from "./transcript";
import { runTutorTurn, type TurnEvent, type TurnInput } from "./turn";
import { latestTurn, turnKind } from "./turn-status";

/**
 * Seam 2, Tutor Turn: Choices under every reply (spec 2026-11-05, D3a). The scripted client stands in for the model;
 * code stores the reply's Choices as a reply_choices item, and a press posts the stored words as a chip turn.
 */

const map = presentValueOnly({ withoutQuiz: true });
const say = (text: string): ScriptedReply => ({ content: [{ type: "text", text }] });
const suggest = (label: string): ScriptedReply => ({ content: [{ type: "tool_use", id: `toolu_suggest_${label.length}`, name: "suggest_choice", input: { label } }] });
const STORY = "February 1994. Bond traders in New York are about to get a surprise.";

async function run(db: Db, input: TurnInput, replies: ScriptedReply[]) {
  const { client, requests } = scriptedClient(replies);
  const events: TurnEvent[] = [];
  for await (const e of runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, input)) events.push(e);
  return { events, requests };
}

/** The Choices stored after the latest reply. */
async function storedChoices(db: Db) {
  const turn = await latestTurn(db, OWNER_LEARNER_ID);
  const items = await loadSessionItems(db, turn!.sessionId!, OWNER_LEARNER_ID);
  const last = items.filter((i) => i.kind === REPLY_CHOICES).at(-1);
  return (last?.data.choices ?? []) as { id: string; label: string; says: string }[];
}

describe("Choices under every reply", () => {
  it("stores three Choices with the Tutor's suggest_choice label first", async () => {
    const db = await testDb();
    const { events } = await run(db, "Hi", [suggest("Who were the traders?"), say(STORY)]);
    const choices = await storedChoices(db);
    expect(choices).toHaveLength(3);
    expect(choices[0]).toMatchObject({ label: "Who were the traders?", says: "Who were the traders?" });
    // Words only (ADR 0014, A2): each stored Choice holds its id, its label and the words its press posts, and no emoji.
    for (const c of choices) expect(Object.keys(c).sort(), c.label).toEqual(["id", "label", "says"]);
    // The browser gets the Choices with the reply.
    expect(events.some((e) => e.type === "item" && e.item.kind === REPLY_CHOICES)).toBe(true);
  });

  it("stores the step's Choices when the Tutor suggests none: no word Choice when the reply names no Topic term (G6)", async () => {
    const db = await testDb();
    await run(db, "Hi", [say(STORY)]);
    expect((await storedChoices(db)).map((c) => c.label)).toEqual(["What happened next?", "How does this touch my life?"]);
  });

  it("names the first Topic term in the reply in the word Choice (G6)", async () => {
    const db = await testDb();
    await run(db, "Hi", [say("A prize paid later is worth less today. The discount rate says how much less, and the lump sum is the deal.")]);
    expect((await storedChoices(db)).map((c) => c.label)).toEqual(["What happened next?", "What does 'discount rate' mean?", "How does this touch my life?"]);
  });

  it("runs a press of the named word Choice as a chip turn that asks the Tutor about that term (G6)", async () => {
    const db = await testDb();
    await run(db, "Hi", [say("The discount rate shrinks a later prize to its worth today.")]);
    const index = (await storedChoices(db)).findIndex((c) => c.id === "word");
    const { requests } = await run(db, { choice: index }, [say("A discount rate is the yearly percentage that shrinks a later payment.")]);
    const turn = await latestTurn(db, OWNER_LEARNER_ID);
    expect(turn!.input).toBe("What does 'discount rate' mean?");
    expect(turnKind(turn!)).toBe("chip");
    // The Tutor is asked about the term by name.
    expect(JSON.stringify(requests.at(-1))).toContain("What does 'discount rate' mean?");
    const lines = await loadCurrentSession(db, map, OWNER_LEARNER_ID);
    expect(lines.filter((l) => l.role === "user").at(-1)).toMatchObject({ text: "What does 'discount rate' mean?" });
    // The Choice just pressed is skipped under the answer, though the answer names the term again.
    expect((await storedChoices(db)).map((c) => c.id)).not.toContain("word");
  });

  it("runs a press of Choice 0 as a chip turn whose Learner message is the stored words", async () => {
    const db = await testDb();
    await run(db, "Hi", [say(STORY)]);
    const [first] = await storedChoices(db);
    await run(db, { choice: 0 }, [say("Rates had sat still for a year. Then the Fed moved.")]);
    const turn = await latestTurn(db, OWNER_LEARNER_ID);
    expect(turn!.input).toBe(first.says);
    expect(turnKind(turn!)).toBe("chip");
    const lines = await loadCurrentSession(db, map, OWNER_LEARNER_ID);
    expect(lines.filter((l) => l.role === "user").at(-1)).toMatchObject({ text: first.says });
  });

  it("at explore, a press of the Tutor's suggested Choice is never an Insight attempt", async () => {
    const db = await testDb();
    for (const step of ["story", "concept"] as const) await saveFinishedStep(db, map, step, new Date(), OWNER_LEARNER_ID);
    await run(db, "Ready.", [suggest("Who were the traders?"), say("Move the rate and watch the value.")]);
    expect((await storedChoices(db))[0].label).toBe("Who were the traders?");
    await run(db, { choice: 0 }, [
      { content: [{ type: "tool_use", id: "toolu_attempt", name: "record_insight_attempt", input: { outcome: "not_yet", learner_words: "Who were the traders?" } }] },
      say("Traders bought and sold the bonds."),
    ]);
    expect(await db.select().from(insightAttempts)).toEqual([]);
  });
});
