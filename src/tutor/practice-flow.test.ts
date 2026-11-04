import { describe, expect, it } from "vitest";
import { CONVERTED_TOPIC_DATA, topicFileOf } from "@/course/lesson-fixture";
import { parseCourseMap, type CourseMap } from "@/course/map";
import { navigate } from "@/course/navigator";
import { OWNER_LEARNER_ID } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadProgress, saveFinishedStep } from "@/learner/memory";
import { noteMethodUsed, recordAnswer, skillStates } from "@/learner/skill-state";
import { loadWidgetStates, saveWidgetState } from "@/learner/widget-state";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { WIDGET_SHOWN } from "@/widgets/shown-widget";
import { afterReteachItems, answerQuickTry, enterStepItems, pendingQuickTryNote, quickTryFollowUpNote } from "./practice";
import { CONCEPT_CARD, QUICK_TRY, QUICK_TRY_RESULT, STEP_DIVIDER, type QuickTryData, type SessionItem } from "./session-item-kinds";
import { loadSessionItems, saveItemAfterLatest } from "./session-items";
import { runTutorTurn } from "./turn";
import { startTurn } from "./turn-status";

/**
 * Seam: practice in Learner Memory (spec #229, ticket #243). Entering a converted step stores its Concept card, Widget
 * preset and Quick tries as Session items; POST /api/quick-try's handler marks an answer exactly, once per key.
 */

const { map: parsed } = parseCourseMap([topicFileOf(CONVERTED_TOPIC_DATA)]);
const map = parsed as CourseMap;
const me = OWNER_LEARNER_ID;
const now = () => new Date();

/** Starts the Topic with one Tutor turn (its Session), and returns the Session's id. */
async function started(db: Db): Promise<number> {
  const { client } = scriptedClient([{ content: [{ type: "text", text: "In 1994 the Fed held its rate at 3%." }] }]);
  let sessionId = 0;
  for await (const e of runTutorTurn({ db, client, map, learnerId: me }, "Hi")) if (e.type === "done") sessionId = e.ref.sessionId;
  return sessionId;
}

async function atYourTurn(db: Db) {
  const sessionId = await started(db);
  for (const step of ["story", "concept"] as const) await saveFinishedStep(db, map, step, now(), me);
  const [first] = await enterStepItems(db, map, me, sessionId, now());
  return { sessionId, first: first.data as QuickTryData };
}

const tryIn = (items: SessionItem[]) => items.find((i) => i.kind === QUICK_TRY)?.data as QuickTryData | undefined;
/** The basis points a "from a% to b%" try moves by, read from its ask. */
const bpOf = (t: QuickTryData) => {
  const [a, b] = [...t.prompt.matchAll(/([\d.]+)%/g)].map((m) => Number(m[1]));
  return Math.round(Math.abs(b - a) * 100);
};

describe("entering a converted Concept step", () => {
  it("stores the card, then its rate_move Widget set to the card's numbers, once per step", async () => {
    const db = await testDb();
    const sessionId = await started(db);
    await saveFinishedStep(db, map, "story", now(), me);
    const items = await enterStepItems(db, map, me, sessionId, now());
    expect(items.map((i) => i.kind)).toEqual([CONCEPT_CARD, WIDGET_SHOWN]);
    expect(items[0].data).toMatchObject({ checkId: "pct-demo-check-1", title: "One move, two ways", writeDown: expect.stringContaining("Points times 100") });
    expect(items[1].data).toMatchObject({ recipe: "rate_move", title: "One move, two ways", params: { inputs: { old: 4, new: 5 } } });
    expect(await enterStepItems(db, map, me, sessionId, now())).toEqual([]);
  });

  it("opens the card's Widget at the card's numbers even after the Learner moved its sliders", async () => {
    const db = await testDb();
    const sessionId = await started(db);
    await saveFinishedStep(db, map, "story", now(), me);
    await enterStepItems(db, map, me, sessionId, now());
    await saveWidgetState(db, { sessionId, widgetKey: "One move, two ways", values: { $old: 1, $new: 9 }, ticked: ["a task"] }, me, now());
    // The Learner comes back to the step (a new divider): the card and its Widget are shown again, at the card's numbers.
    await saveItemAfterLatest(db, me, sessionId, { kind: STEP_DIVIDER, data: { label: "Picking up" } }, now());
    expect((await enterStepItems(db, map, me, sessionId, now())).map((i) => i.kind)).toEqual([CONCEPT_CARD, WIDGET_SHOWN]);
    expect((await loadWidgetStates(db, sessionId, me))["One move, two ways"]).toEqual({ values: { $old: 4, $new: 5 }, ticked: ["a task"] });
  });
});

describe("Your turn with Quick tries", () => {
  it("opens with a half-done try and keeps the same open try on a reload", async () => {
    const db = await testDb();
    const { sessionId, first } = await atYourTurn(db);
    expect(first).toMatchObject({ skillId: "pts-to-bp", halfDone: expect.stringMatching(/^First step, done for you/) });
    expect(await enterStepItems(db, map, me, sessionId, now())).toEqual([]);
    const stored = await loadSessionItems(db, sessionId, me);
    expect(stored.filter((i) => i.kind === QUICK_TRY).map((i) => i.data)).toEqual([first]);
  });

  it("marks exactly, shows Known-mistake fixes, counts each key once, and finishes Your turn from fluency", async () => {
    const db = await testDb();
    const { sessionId, first } = await atYourTurn(db);
    const points = Number(first.halfDone!.match(/([\d.]+) points/)![1]);
    const a1 = await answerQuickTry(db, map, me, first.key, `${Math.round(points * 100)} bp`, now());
    expect(a1).toMatchObject({ ok: true, followUp: false });
    expect(a1.ok && a1.items[0]).toEqual({ kind: QUICK_TRY_RESULT, data: { key: first.key, verdict: "right", line: "Right." } });
    // The same key again changes nothing.
    expect(await answerQuickTry(db, map, me, first.key, "0", now())).toEqual({ ok: true, items: [], followUp: false });
    expect((await skillStates(db, me, "pct-demo"))["pts-to-bp"]).toMatchObject({ tries: 1, streak: 1 });

    const second = tryIn(a1.ok ? a1.items : [])!;
    expect(second.halfDone).toBeUndefined();
    const a2 = await answerQuickTry(db, map, me, second.key, String(bpOf(second) / 10), now());
    expect(a2.ok && a2.items[0].data).toMatchObject({ verdict: "known_mistake", line: "One point is 100 basis points, so multiply by 100, not 10." });
    const third = tryIn(a2.ok ? a2.items : [])!;
    expect(third.skillId).toBe("pts-to-bp");
    const a3 = await answerQuickTry(db, map, me, third.key, String(bpOf(third)), now());
    const fourth = tryIn(a3.ok ? a3.items : [])!;
    const a4 = await answerQuickTry(db, map, me, fourth.key, `${bpOf(fourth)}bp`, now());
    const fifth = tryIn(a4.ok ? a4.items : [])!;
    expect(fifth).toMatchObject({ skillId: "bp-to-pts", prompt: "120 bp is how many points?" });
    const a5 = await answerQuickTry(db, map, me, fifth.key, "1.2", now());
    const sixth = tryIn(a5.ok ? a5.items : [])!;
    const bp6 = Number(sixth.prompt.match(/by (\d+) basis/)![1]);
    const a6 = await answerQuickTry(db, map, me, sixth.key, String(bp6 / 100), now());
    expect(a6).toMatchObject({ ok: true, followUp: true });
    expect(a6.ok && a6.items.map((i) => i.kind)).toEqual([QUICK_TRY_RESULT, STEP_DIVIDER]);
    expect(navigate(map, await loadProgress(db, me))).toMatchObject({ step: "check", check: { id: "pct-demo-check-1" } });
    expect(await quickTryFollowUpNote(db, map, me)).toMatch(/^Quick try follow-up by code: .*Your turn is done.*Check tab/);
    // Every result since the Tutor's last reply goes to the next turn.
    const note = await pendingQuickTryNote(db, map, me, sessionId);
    expect(note?.split("\n")).toHaveLength(7);
    expect(note).toContain(`"120 bp is how many points? First step, done for you: 100 bp make 1 point, so divide by 100." The Learner gave "1.2": right.`);
  });

  it("answers a wrong answer with no Known mistake with Not quite and a follow-up that names the slip", async () => {
    const db = await testDb();
    const { first } = await atYourTurn(db);
    const answer = await answerQuickTry(db, map, me, first.key, "7777", now());
    expect(answer).toEqual({ ok: true, followUp: true, items: [{ kind: QUICK_TRY_RESULT, data: { key: first.key, verdict: "wrong", line: "Not quite." } }] });
    expect(await quickTryFollowUpNote(db, map, me)).toMatch(/The Learner gave "7777": not right; the answer is .*Reply kind: feedback\. Name the slip in one sentence/s);
  });

  it("refuses while a turn runs, and a key that is not the Learner's", async () => {
    const db = await testDb();
    const { first } = await atYourTurn(db);
    expect(await answerQuickTry(db, map, me, "qt:1:0:pct-demo-try-bp-half", "1.2", now())).toMatchObject({ ok: false, status: 404 });
    await startTurn(db, now(), "Hi", me);
    expect(await answerQuickTry(db, map, me, first.key, "60", now())).toMatchObject({ ok: false, status: 409 });
  });
});

describe("the re-teach note after a second miss in a row (ticket #248, lane R11)", () => {
  /** Misses the first Quick try at Your turn after one earlier miss on its Skill, with these rungs already used on it. */
  async function secondMiss(used: ("restate" | "worked")[]) {
    const db = await testDb();
    const { sessionId, first } = await atYourTurn(db);
    for (const method of used) await noteMethodUsed(db, me, "pct-demo", first.skillId, method);
    await recordAnswer(db, { learnerId: me, topicId: "pct-demo", skillId: first.skillId, itemKey: `quiz:91:${first.skillId}`, itemId: first.skillId, input: "x", verdict: "wrong", source: "quiz" });
    await answerQuickTry(db, map, me, first.key, "999", now());
    return { db, sessionId, note: await quickTryFollowUpNote(db, map, me) };
  }

  it("on the fill-in boxes rung, has the Tutor name the slip and leave the last box blank as its one ask", async () => {
    const { note } = await secondMiss(["restate", "worked"]);
    expect(note).toContain("Method: boxes, fill-in boxes. Code posts a half-done try after your reply");
    expect(note).toContain("name the slip in one sentence");
    expect(note).toContain("The blank last box is your one ask");
    expect(note).not.toContain("Write no practice question of your own");
  });

  it("on the fill-in boxes rung, names the very half-done try code posts after the reply, so the boxes can be set on it", async () => {
    const { db, sessionId, note } = await secondMiss(["restate", "worked"]);
    const [posted] = await afterReteachItems(db, map, me, sessionId, "boxes", now());
    const data = posted.data as QuickTryData;
    expect(data.halfDone).toBeTruthy();
    expect(note).toContain(`The half-done try code posts after your reply: "${data.prompt} ${data.halfDone}". Set your boxes on its numbers`);
    expect(note).toContain('Box 1 says its rate move in full ("a rate goes from A% to B%") and its first step; Box 2 is its blank last step. Never give its answer.');
  });

  it("on another rung, still has the Tutor write no practice question of its own", async () => {
    const { note } = await secondMiss([]);
    expect(note).toContain("Method: restate");
    expect(note).toContain("Write no practice question of your own");
  });
});
