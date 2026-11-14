import { describe, expect, it } from "vitest";
import { OWNER_LEARNER_ID } from "@/db/schema";
import { presentValueOnly } from "@/test/present-value-map";
import { testDb } from "@/test/pglite";
import { scriptedClient, type ScriptedReply } from "@/test/scripted-client";
import { GO_DEEPER, JUST_TELL_ME } from "./chips";
import { learnersOwnWords } from "./reply-choices";
import { runTutorTurn, type TurnInput } from "./turn";
import { DRILL_NOTE, FINISH_NOTE, latestTurn, OLD_CONTINUE_TEXT, OPENER_PREFIX, type Turn } from "./turn-status";

/**
 * learnersOwnWords (ADR 0001): the one test of whether a turn's message is the Learner's own words. Typed words are an
 * Insight attempt or the Learner's own rule; every message they sent counts for the frustration count.
 */

const map = presentValueOnly({ withoutQuiz: true });
const me = OWNER_LEARNER_ID;
const say = (text: string): ScriptedReply => ({ content: [{ type: "text", text }] });
const LABEL = "Later money is worth less";

type Db = Awaited<ReturnType<typeof testDb>>;

async function run(db: Db, input: TurnInput, replies: ScriptedReply[]): Promise<Turn> {
  const { client } = scriptedClient(replies);
  for await (const e of runTutorTurn({ db, client, map, learnerId: me }, input)) void e;
  return (await latestTurn(db, me))!;
}

/** A message with no Session around it, so no Choice can have been shown before it. */
const alone = (input: string | null) => ({ input, sessionId: null, turnSeq: null, learnerId: me });

describe("the Learner's own words", () => {
  it("never counts a note code wrote, typed or sent", async () => {
    const db = await testDb();
    for (const note of [`${OPENER_PREFIX} the page opened.`, FINISH_NOTE, DRILL_NOTE]) {
      expect(await learnersOwnWords(db, alone(note), "typed")).toBe(false);
      expect(await learnersOwnWords(db, alone(note), "sent")).toBe(false);
    }
  });

  it("counts a chip and the old Continue as sent, never as typed", async () => {
    const db = await testDb();
    for (const words of [GO_DEEPER, JUST_TELL_ME, "Explain that more simply.", OLD_CONTINUE_TEXT]) {
      expect(await learnersOwnWords(db, alone(words), "typed")).toBe(false);
      expect(await learnersOwnWords(db, alone(words), "sent")).toBe(true);
    }
  });

  it("counts a press of the Tutor's suggested Choice as sent, never as typed; the same words with no Choice before them are typed", async () => {
    const db = await testDb();
    await run(db, "Hi", [{ content: [{ type: "tool_use", id: "s1", name: "suggest_choice", input: { label: LABEL } }] }, say("Rates rose in 1994.")]);
    const pressed = await run(db, { choice: 0 }, [say("Yes: later money is worth less today.")]);
    expect(pressed.input).toBe(LABEL);
    expect(await learnersOwnWords(db, pressed, "typed")).toBe(false);
    expect(await learnersOwnWords(db, pressed, "sent")).toBe(true);
    expect(await learnersOwnWords(db, alone(LABEL), "typed")).toBe(true);
  });

  it("counts a message the Learner typed, both ways", async () => {
    const db = await testDb();
    const typed = await run(db, "so later money is worth less", [say("Right.")]);
    expect(await learnersOwnWords(db, typed, "typed")).toBe(true);
    expect(await learnersOwnWords(db, typed, "sent")).toBe(true);
  });
});
