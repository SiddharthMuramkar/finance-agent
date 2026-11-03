import { describe, expect, it } from "vitest";
import type { CourseMap } from "@/course/map";
import type { TeachingStep } from "@/course/navigator";
import type { Db } from "@/db/types";
import { loadProgress, saveCheckResult, saveFinishedStep } from "@/learner/memory";
import { presentValueOnly } from "@/test/present-value-map";
import { testDb } from "@/test/pglite";
import { scriptedClient, type ScriptedReply } from "@/test/scripted-client";
import { loadThread, type ThreadEntry } from "./transcript";
import { latestTurn, runTutorTurn, type TurnEvent, type TurnInput } from "./turn";
import { turnKind } from "./turn-status";
import type { NextName } from "./next";

/**
 * Seam 1, Tutor Turn: the Learner's Next. Code checks the move is allowed, advances the Course Navigator,
 * stores the step divider and runs a fresh Tutor turn from a code-written note that is never a Learner bubble.
 */

/** Present value with no quiz and no Insight: Story, Concept, Your turn, Check, Reveal, Principle. */
const plain = presentValueOnly({ withoutQuiz: true, withoutInsight: true });

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

/** What the Learner sees, without the usage and save data that have their own tests. */
const seen = (entries: ThreadEntry[]) => entries.map((e) => (e.role === "item" ? e : { role: e.role, text: e.text, ...(e.more && { more: true }) }));
const sessionOf = (events: TurnEvent[]) => (events.at(-1) as Extract<TurnEvent, { type: "done" }>).ref.sessionId;
const sent = (request: { messages: unknown[] }) => JSON.stringify(request.messages);

async function saveSteps(db: Db, map: CourseMap, steps: TeachingStep[]) {
  for (const step of steps) {
    const moved = await saveFinishedStep(db, map, step);
    if (!moved.ok) throw new Error(moved.reason);
  }
}

describe("the Learner's Next", () => {
  it("advances, stores the step divider and runs a Tutor turn from a code-written note, with no Learner bubble", async () => {
    const db = await testDb();
    const first = await turn(db, "Hi", [say("Once, a lottery winner had a choice.")]);
    const next = await turn(db, { next: "concept" }, [say("Now the concept: money today is worth more.")]);

    const divider = { kind: "step", data: { step: "concept", number: 2, label: "Step 2 of 6 · Concept" } };
    // The browser hears the divider first, so it draws it before the new reply.
    expect(next.events.map((e) => e.type)).toEqual(["item", "text", "done"]);
    expect(next.events[0]).toEqual({ type: "item", item: divider });
    expect((await loadProgress(db)).topics["present-value"]).toMatchObject({ step: "concept" });

    expect(seen(await loadThread(db, sessionOf(first.events), plain))).toEqual([
      { role: "user", text: "Hi" },
      { role: "assistant", text: "Once, a lottery winner had a choice." },
      { role: "item", ...divider },
      { role: "assistant", text: "Now the concept: money today is worth more." },
    ]);
    const request = sent(next.requests[0]);
    expect(request).toContain("Next by code:");
    expect(request).toContain("Teaching Step: concept (Check 1 of 1");
    expect(request).not.toContain("Step 2 of 6");
    expect(turnKind((await latestTurn(db))!)).toBe("next");
  });

  /** A Next that must be refused: nothing moves, nothing is stored or sent, and the Learner can still send at once. */
  async function expectRefused(db: Db, map: CourseMap, named: NextName, reason: string) {
    const before = await loadProgress(db);
    const sessionId = (await latestTurn(db))!.sessionId!;
    const thread = await loadThread(db, sessionId, map);
    const refused = await turn(db, { next: named }, [say("Should not run.")], map);
    expect(refused.events).toEqual([{ type: "not_allowed", message: reason }]);
    expect(refused.requests).toHaveLength(0);
    expect(await loadProgress(db)).toEqual(before);
    expect(await loadThread(db, sessionId, map)).toEqual(thread);
    const after = await turn(db, "Can I ask something?", [say("Of course.")], map);
    expect(after.events.at(-1)).toMatchObject({ type: "done" });
  }

  it("is refused while a conversation Check is open, and after a miss there", async () => {
    const db = await testDb();
    await turn(db, "Hi", [say("Once upon a time.")]);
    await saveSteps(db, plain, ["story", "concept", "your_turn"]);
    await expectRefused(db, plain, "reveal", "A Check is open: only a saved pass moves past it.");

    const check = plain.topic("present-value")!.checks[0];
    const missed = await saveCheckResult(db, plain, { checkId: check.id, passed: false, evidence: "Not yet." });
    expect(missed.ok).toBe(true);
    await expectRefused(db, plain, "reveal", "A Check is open: only a saved pass moves past it.");
  });

  it("is refused at an Explore whose Insight is not yet found or told", async () => {
    const map = presentValueOnly({ withoutQuiz: true });
    const db = await testDb();
    await turn(db, "Hi", [say("Once upon a time.")], map);
    await saveSteps(db, map, ["story", "concept"]);
    await expectRefused(db, map, "your_turn", "Explore is not settled: the Learner has not found the Insight or been told it.");
  });

  it("is refused when it names a step other than the one on offer", async () => {
    const db = await testDb();
    await turn(db, "Hi", [say("Once upon a time.")]);
    await expectRefused(db, plain, "your_turn", 'Next names "concept", not "your_turn".');
  });
});
