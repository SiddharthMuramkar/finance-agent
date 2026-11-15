import { describe, expect, it, vi } from "vitest";
import { CONVERTED_TOPIC_DATA, topicFileOf } from "@/course/lesson-fixture";
import { parseCourseMap, type CourseMap } from "@/course/map";
import { navigate } from "@/course/navigator";
import { OWNER_LEARNER_ID } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadProgress, saveFinishedStep } from "@/learner/memory";
import { testDb } from "@/test/pglite";
import { scriptedClient, type ScriptedReply } from "@/test/scripted-client";
import { answerQuickTry } from "./practice";
import { stepBeganThisTurn } from "./pacing";
import { openLog, sessionForTurn } from "./session-log";
import { saveItemAfterLatest } from "./session-items";
import { startTurn, updateTurn } from "./turn-status";
import { QUICK_TRY, STEP_DIVIDER, type QuickTryData, type SessionItem } from "./session-item-kinds";
import { runTutorTurn, type TurnEvent, type TurnInput } from "./turn";
import { VERDICT_PACING_REJECTION } from "./tools";

// The Companion Widget code adds to a reply with none (E4a) is off here: this file tests pacing, and
// src/tutor/companion-turn.test.ts tests the companion.
vi.mock("./companion", () => ({ pickCompanion: () => null }));

/**
 * Seam 1, Tutor Turn: the pacing rule (ADR 0001). A step code moved the Learner onto outside a Tutor reply has
 * not been taught, so the turn that first speaks of it cannot record its Check verdict, whichever way the step was reached.
 */

const me = OWNER_LEARNER_ID;
const CHECK = "pct-demo-check-3";

/**
 * The converted test Topic with one Check: a conversation Check whose Your turn has Quick tries on its one Skill, so a
 * right Quick try finishes Your turn and moves the Learner straight to the conversation Check.
 */
function conversationAfterTries(): CourseMap {
  const data = structuredClone(CONVERTED_TOPIC_DATA);
  const conversation = data.checks.find((c) => c.id === CHECK)!;
  const tryOn = (id: string, ask: string) => ({
    id,
    skill: "wording",
    ask,
    kind: "choice",
    answer: "right",
    choices: [
      { id: "right", text: "Up 25 bp" },
      { id: "off", text: "Up 25%", mistake: { fix: "25% compares the move with the old rate. The gap itself is 25 bp.", tag: "mixed_percent_points" } },
    ],
  });
  (data as { checks: unknown[] }).checks = [
    { ...conversation, quickTries: [tryOn("pace-try-1", "A rate goes from 3% to 3.25%. Which says the gap?"), tryOn("pace-try-2", "A rate goes from 5% to 5.25%. Which says the gap?")] },
  ];
  const { map, errors } = parseCourseMap([topicFileOf(data)]);
  if (!map) throw new Error(errors.join("\n"));
  return map;
}

const map = conversationAfterTries();
const say = (text: string): ScriptedReply => ({ content: [{ type: "text", text }] });
const verdict = (): ScriptedReply => ({
  content: [
    { type: "text", text: "Let me look." },
    { type: "tool_use", id: `toolu_verdict_${Math.random().toString(36).slice(2)}`, name: "record_check_verdict", input: { check_id: CHECK, verdict: "pass", reasons: "Said it in points and basis points." } },
  ],
});

async function turn(db: Db, input: TurnInput, replies: ScriptedReply[]) {
  const { client, requests } = scriptedClient(replies);
  const events: TurnEvent[] = [];
  for await (const e of runTutorTurn({ db, client, map, learnerId: me }, input)) events.push(e);
  return { events, requests };
}

/** The result of the turn's record_check_verdict call, as the Tutor got it back. */
const verdictResult = (requests: { messages: unknown[] }[]) => JSON.stringify(requests.at(-1)!.messages.at(-1));

/** Starts the Topic, reaches Your turn, and answers its Quick tries right until code finishes Your turn. */
async function finishedYourTurn(db: Db): Promise<SessionItem[]> {
  await turn(db, "Hi", [say("In 1994 the Fed moved its rate from 3% to 3.25%.")]);
  for (const step of ["story", "concept"] as const) await saveFinishedStep(db, map, step, new Date(), me);
  const ready = await turn(db, "Ready.", [say("Over to you.")]);
  let shown = ready.events.flatMap((e) => (e.type === "item" && e.item.kind === QUICK_TRY ? [e.item.data as QuickTryData] : []))[0];
  for (let i = 0; i < 6 && shown; i++) {
    const answer = await answerQuickTry(db, map, me, shown.key, "right", new Date());
    if (!answer.ok) throw new Error(answer.error);
    if (answer.items.some((it) => it.kind === STEP_DIVIDER)) return answer.items;
    shown = answer.items.find((it) => it.kind === QUICK_TRY)?.data as QuickTryData;
  }
  throw new Error("Your turn did not finish");
}

describe("a right Quick try that finishes Your turn and moves the Learner to a conversation Check", () => {
  it("the follow-up turn puts the Check's prompt but cannot record its verdict; the Learner's answer in the next turn can", async () => {
    const db = await testDb();
    const items = await finishedYourTurn(db);
    expect(items.at(-1)).toMatchObject({ kind: STEP_DIVIDER, data: { step: "check" } });
    expect(navigate(map, await loadProgress(db, me))).toMatchObject({ step: "check", check: { id: CHECK } });

    const followUp = await turn(db, { quickTryFollowUp: true }, [verdict(), say("Your turn is done. Now: say the Fed's move in points and in basis points.")]);
    expect(JSON.stringify(followUp.requests[0].messages)).toContain("put the Check's prompt to them");
    expect(verdictResult(followUp.requests)).toContain(VERDICT_PACING_REJECTION);
    expect((await loadProgress(db, me)).topics["pct-demo"]).toMatchObject({ step: "check", passedChecks: [] });

    // The Learner has now seen the prompt: their answer can be marked.
    const answered = await turn(db, "A quarter of a point, which is 25 basis points.", [verdict(), say("Right: a quarter point is 25 bp.")]);
    expect(verdictResult(answered.requests)).toContain("Recorded by code: pass");
    expect((await loadProgress(db, me)).topics["pct-demo"].passedChecks).toEqual([CHECK]);
  });

  it("a typed turn after it, with no follow-up between, cannot record the verdict either: no reply has put the prompt yet", async () => {
    const db = await testDb();
    await finishedYourTurn(db);
    const typed = await turn(db, "What now?", [verdict(), say("Now the Check: say the Fed's move in points and in basis points.")]);
    expect(verdictResult(typed.requests)).toContain(VERDICT_PACING_REJECTION);
    expect((await loadProgress(db, me)).topics["pct-demo"]).toMatchObject({ step: "check", passedChecks: [] });
  });
});

describe("a step divider before the turn, read in the turn", () => {
  /** A Session with one reply, then a step divider code stored, then `between`, then a turn's own message. */
  async function turnAfterDivider(between: unknown[]) {
    const db = await testDb();
    const session = await sessionForTurn(db, new Date(), me, "pct-demo");
    const log = await openLog(db, session.id, () => new Date());
    await log.append({ role: "user", content: "Hi" });
    await log.append({ role: "assistant", content: [{ type: "text", text: "In 1994 the Fed moved its rate." }] });
    await saveItemAfterLatest(db, me, session.id, { kind: STEP_DIVIDER, data: { step: "check", number: 4, label: "Step 4 of 4 · Check" } }, new Date());
    for (const content of between) await log.append({ role: "assistant", content } as never);
    const turn = (await startTurn(db, new Date(), "What now?", me))!;
    await updateTurn(db, turn.id, { sessionId: session.id, turnSeq: log.nextSeq });
    await log.append({ role: "user", content: "What now?" });
    return stepBeganThisTurn(db, turn.id);
  }

  it("counts the step as begun when no reply follows the divider, and as taught once one does", async () => {
    expect(await turnAfterDivider([])).toBe(true);
    expect(await turnAfterDivider([[{ type: "text", text: "Now the Check: say the move in points and in basis points." }]])).toBe(false);
  });

  it("does not take a refreeze summary written at the turn's start for a reply that taught the step", async () => {
    expect(await turnAfterDivider([[{ type: "compaction", content: "Summary of the Session so far." }]])).toBe(true);
  });
});
