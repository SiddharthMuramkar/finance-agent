import { APIError } from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import type { CourseMap } from "@/course/map";
import { messages, OWNER_LEARNER_ID, turns } from "@/db/schema";
import type { Db } from "@/db/types";
import { presentValueOnly } from "@/test/present-value-map";
import { testDb } from "@/test/pglite";
import { scriptedClient, type ScriptedReply } from "@/test/scripted-client";
import { loadThread, type ThreadEntry } from "./transcript";
import { latestTurn, runTutorTurn, type TurnEvent, type TurnInput } from "./turn";
import { turnKind } from "./turn-status";
import { TUTOR_INSTRUCTIONS, TUTOR_TOOLS } from "./instructions";
import { stepContext } from "./context";
import { navigate } from "@/course/navigator";
import { loadProgress, ensureTopicStarted, saveFinishedStep } from "@/learner/memory";

/**
 * Seam 1, Tutor Turn: no "Continue" anywhere. A cut-off reply offers Finish this reply, which runs a Tutor turn
 * from a note code writes and stores no Learner message; nothing stores "Continue.", and nothing the Tutor is told says it.
 */

const plain = presentValueOnly({ withoutQuiz: true, withoutInsight: true });
const withInsight = presentValueOnly({ withoutQuiz: true });

const say = (text: string): ScriptedReply => ({ content: [{ type: "text", text }] });

async function collect(events: AsyncIterable<TurnEvent>) {
  const out: TurnEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

async function turn(db: Db, input: TurnInput, replies: ScriptedReply[], map: CourseMap = plain) {
  const { client, requests } = scriptedClient(replies);
  const events = await collect(runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, input));
  return { events, requests };
}

const seen = (entries: ThreadEntry[]) => entries.map((e) => (e.role === "item" ? e : { role: e.role, text: e.text }));
const sessionOf = (events: TurnEvent[]) => (events.at(-1) as Extract<TurnEvent, { type: "done" }>).ref.sessionId;
const sent = (request: { messages: unknown[] }) => JSON.stringify(request.messages);
const stored = async (db: Db) => JSON.stringify(await db.select().from(messages));

describe("Finish this reply", () => {
  it("runs a Tutor turn from a code-written note after a cut-off reply, and stores no Learner message", async () => {
    const db = await testDb();
    const cut = await turn(db, "Why is money today worth more?", [{ content: [{ type: "text", text: "A rupee today is worth" }], stop_reason: "max_tokens" }]);
    expect(cut.events).toContainEqual({ type: "cut_short", message: expect.stringMatching(/cut short/i) });
    const notice = cut.events.find((e) => e.type === "cut_short");
    expect(JSON.stringify(notice)).not.toMatch(/Continue/);
    expect(JSON.stringify(notice)).toContain("Finish this reply");

    const finished = await turn(db, { finish: true }, [say("more than a rupee next year.")]);
    expect(finished.events.at(-1)).toMatchObject({ type: "done" });
    // The Tutor is asked by code to finish; the Learner wrote nothing.
    expect(sent(finished.requests[0])).toContain("Finish by code:");
    expect(sent(finished.requests[0])).not.toMatch(/Continue/);
    expect(turnKind((await latestTurn(db, OWNER_LEARNER_ID))!)).toBe("finish");
    // The thread shows the Learner's one message and the two replies, never a bubble for the button.
    expect(seen(await loadThread(db, sessionOf(finished.events), plain, OWNER_LEARNER_ID))).toEqual([
      { role: "user", text: "Why is money today worth more?" },
      { role: "assistant", text: "A rupee today is worth" },
      { role: "assistant", text: "more than a rupee next year." },
    ]);
    expect(await stored(db)).not.toContain("Continue.");
  });

  it("Retry of a failed Finish this reply re-sends its own note, never Continue.", async () => {
    const db = await testDb();
    await turn(db, "Why discount?", [{ content: [{ type: "text", text: "Because" }], stop_reason: "max_tokens" }]);
    const overloaded = APIError.generate(529, { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }, "529", new Headers());
    const failed = await turn(db, { finish: true }, [{ error: overloaded }]);
    expect(failed.events.at(-1)).toMatchObject({ type: "error" });

    const retried = await turn(db, { resume: true }, [say("time has value.")]);
    expect(retried.events.at(-1)).toMatchObject({ type: "done" });
    expect(sent(retried.requests[0])).toContain("Finish by code:");
    expect(sent(retried.requests[0])).not.toContain("Continue.");
    expect(await stored(db)).not.toContain("Continue.");
  });

  it("Retry of an opener and of a Next re-sends its own note, never Continue.", async () => {
    const db = await testDb();
    const overloaded = () => APIError.generate(529, { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }, "529", new Headers());
    expect((await turn(db, { opener: true }, [{ error: overloaded() }])).events.at(-1)).toMatchObject({ type: "error" });
    const opener = await turn(db, { resume: true }, [say("Picture October 2018.")]);
    expect(sent(opener.requests[0])).toContain("Opener by code:");
    expect(sent(opener.requests[0])).not.toContain("Continue.");

    expect((await turn(db, { next: "concept" }, [{ error: overloaded() }])).events.at(-1)).toMatchObject({ type: "error" });
    const next = await turn(db, { resume: true }, [say("Now the concept.")]);
    expect(sent(next.requests[0])).toContain("Next by code:");
    expect(sent(next.requests[0])).not.toContain("Continue.");
    expect(await stored(db)).not.toContain("Continue.");
  });

  it("Retry of a turn the old Continue started, failed before the deploy, sends the Finish note instead", async () => {
    const db = await testDb();
    await turn(db, "Why discount?", [say("Because time has value.")]);
    await db.insert(turns).values({ learnerId: OWNER_LEARNER_ID, status: "failed", startedAt: new Date(), input: "Continue." });
    const retried = await turn(db, { resume: true }, [say("Shall we try a number?")]);
    expect(retried.events.at(-1)).toMatchObject({ type: "done" });
    expect(sent(retried.requests[0])).toContain("Finish by code:");
    expect(await stored(db)).not.toContain("Continue.");
  });
});

describe("what the Tutor is told", () => {
  it("never mentions Continue: instructions, tool descriptions and the Course Navigator context", async () => {
    expect(TUTOR_INSTRUCTIONS).not.toMatch(/Continue/);
    expect(JSON.stringify(TUTOR_TOOLS)).not.toMatch(/Continue/);
    const db = await testDb();
    await ensureTopicStarted(db, withInsight, new Date(), OWNER_LEARNER_ID);
    for (const step of ["story", "concept"] as const) await saveFinishedStep(db, withInsight, step, new Date(), OWNER_LEARNER_ID);
    const place = navigate(withInsight, await loadProgress(db, OWNER_LEARNER_ID));
    expect(place?.step).toBe("explore");
    const context = stepContext(place);
    expect(context).toContain("record_insight_attempt");
    expect(context).not.toMatch(/Continue/);
  });
});
