import { describe, expect, it } from "vitest";
import { loadCourseMap } from "@/course/map";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { CONCEPT_CARD, QUICK_TRY, QUICK_TRY_RESULT, type QuickTryData, type QuickTryResultData } from "@/tutor/session-item-kinds";
import { loadSessionItems } from "@/tutor/session-items";
import { liveSession } from "@/tutor/session-log";
import { runTutorTurn, type TurnEvent } from "@/tutor/turn";
import { WIDGET_SHOWN } from "@/widgets/shown-widget";
import { CASES_DIR, loadCases, type LiveCase } from "./case";
import { codedFailures } from "./grading";
import { answerDrawnTry, noteMark, pendingReason, prepareCase, seenReply } from "./setup";

/**
 * Seam: the Tutor Turn on in-memory Postgres with a scripted model, on today's Course Map. T3, T5 and T6 are set up so that
 * what they grade is the Tutor's reply and not the harness: the Concept card is already on screen, the Learner's right
 * answer is marked before the rule is typed, and the Quick try code shows is the one the earlier turn talks about.
 */
const map = loadCourseMap();
const cases = loadCases(CASES_DIR).cases;
const live = (id: string) => cases.find((c) => c.id === id) as LiveCase;
const settings = { model: "claude-sonnet-5-5", effort: "low", widgetEngine: "on" as const };

async function collect(events: AsyncIterable<TurnEvent>) {
  const out: TurnEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}
const textOf = (events: TurnEvent[]) => events.flatMap((e) => (e.type === "text" ? [e.text] : [])).join("");
const without = (c: LiveCase, drop: "history" | "answeredTries"): LiveCase => ({ ...c, state: { ...c.state, [drop]: undefined } });

/** A scripted turn: the Tutor calls one tool, then says its reply. */
function scripted(tool: { id: string; name: string; input: unknown }, reply: string) {
  return scriptedClient([{ content: [{ type: "tool_use", ...tool }] }, { content: [{ type: "text", text: reply }] }]);
}

describe("T5: a practice-mode Widget the Tutor shows after the card's", () => {
  const RATE_MOVE = { recipe: "rate_move", params: { title: "Your turn: 3% to 3.25%", inputs: { old: 3, new: 3.25, mode: "practice" }, refs: {}, facts: {} } };

  it("has the Concept card and its Widget on screen before the graded turn, so the Tutor's own Widget is shown and passes", async () => {
    const db = await testDb();
    const c = live("T5");
    const p = await prepareCase(db, c, { map, settings });
    const session = await liveSession(db, p.learnerId, p.topic.id);
    const before = await loadSessionItems(db, session!.id, p.learnerId);
    expect(before.some((i) => i.kind === CONCEPT_CARD)).toBe(true);
    expect(before.find((i) => i.kind === WIDGET_SHOWN)?.data).toMatchObject({ recipe: "rate_move", params: { inputs: { mode: "show" } } });

    const notesAfter = await noteMark(db, p.learnerId);
    const { client } = scripted({ id: "toolu_t5", name: "show_widget", input: RATE_MOVE }, "Here you go.\nHow many basis points did it move?");
    const events = await collect(runTutorTurn({ db, client, map, learnerId: p.learnerId, checkReplies: false }, c.message));
    const done = events.at(-1) as Extract<TurnEvent, { type: "done" }>;
    const reply = await seenReply(db, { learnerId: p.learnerId, topic: p.topic, ...done.ref, text: textOf(events), notesAfter });

    // Only the Tutor's Widget is in the graded turn: the card's was stored in the earlier turn.
    expect(reply.widgets).toHaveLength(1);
    expect(reply.widgets[0]).toMatchObject({ kind: "recipe", id: "rate_move", params: { inputs: { mode: "practice" } } });
    expect(reply.widgets[0].byCode).toBeUndefined();
    expect(codedFailures(c.pass, reply, p.ctx)).toEqual([]);
  });

  it("marks a Widget code stores in the graded turn as code's, and does not credit it to the Tutor", async () => {
    const db = await testDb();
    const c = without(live("T5"), "history");
    const p = await prepareCase(db, c, { map, settings });
    const notesAfter = await noteMark(db, p.learnerId);
    const { client } = scriptedClient([{ content: [{ type: "text", text: "Sure.\nHow many basis points is 1 point?" }] }]);
    const events = await collect(runTutorTurn({ db, client, map, learnerId: p.learnerId, checkReplies: false }, c.message));
    const done = events.at(-1) as Extract<TurnEvent, { type: "done" }>;
    const reply = await seenReply(db, { learnerId: p.learnerId, topic: p.topic, ...done.ref, text: textOf(events), notesAfter });
    // The first turn at the step shows the card and its Widget, whatever the Tutor says.
    expect(reply.widgets.map((w) => [w.id, w.byCode])).toEqual([["rate_move", true]]);
    expect(codedFailures([{ kind: "widget", mode: "practice" }], reply, p.ctx)[0]).toMatch(/Tutor showed no Widget/);
  });
});

describe("T6: the Learner's own rule is saved after a right practice answer", () => {
  it("saves the rule in the Learner's words, because the right answer was marked after the earlier turn", async () => {
    const db = await testDb();
    const c = live("T6");
    expect(pendingReason(c, map)).toBeNull();
    const p = await prepareCase(db, c, { map, settings });
    expect(p.stateNote).toMatch(/answered the Quick try "A rate goes from 2% to 3%\./);
    const notesAfter = await noteMark(db, p.learnerId);
    const { client, requests } = scripted({ id: "toolu_t6", name: "save_learner_rule", input: { learner_words: c.message } }, "Yes, that is the rule.\nWhat is the percent change from 50 to 60?");
    const events = await collect(runTutorTurn({ db, client, map, learnerId: p.learnerId, checkReplies: false }, c.message));
    // The Tutor is told of the right answer with the Learner's message, as the app tells it.
    expect(JSON.stringify(requests[0])).toMatch(/Quick try results since your last reply[\s\S]*The Learner gave \\"50\\": right/);
    const done = events.at(-1) as Extract<TurnEvent, { type: "done" }>;
    const reply = await seenReply(db, { learnerId: p.learnerId, topic: p.topic, ...done.ref, text: textOf(events), notesAfter });
    expect(reply.savedRule).toBe(c.message);
    expect(codedFailures(c.pass, reply, p.ctx)).toEqual([]);
  });

  it("would not save it without that right answer (the tool's own rule for a converted Topic)", async () => {
    const db = await testDb();
    const c = without(live("T6"), "answeredTries");
    const p = await prepareCase(db, c, { map, settings });
    const notesAfter = await noteMark(db, p.learnerId);
    const { client } = scripted({ id: "toolu_t6n", name: "save_learner_rule", input: { learner_words: c.message } }, "Yes, that is the rule.\nWhat is the percent change from 50 to 60?");
    const events = await collect(runTutorTurn({ db, client, map, learnerId: p.learnerId, checkReplies: false }, c.message));
    const done = events.at(-1) as Extract<TurnEvent, { type: "done" }>;
    const reply = await seenReply(db, { learnerId: p.learnerId, topic: p.topic, ...done.ref, text: textOf(events), notesAfter });
    expect(reply.savedRule).toBeNull();
  });
});

describe("T3: the Quick try code shows is the one the earlier turn talks about", () => {
  it("shows 7.5% to 7.2%, marks 0.3 as that try's Known mistake, and tells the grader the try", async () => {
    const db = await testDb();
    const c = live("T3");
    expect(pendingReason(c, map)).toBeNull();
    const p = await prepareCase(db, c, { map, settings });
    await expect(answerDrawnTry(db, map, c, p)).resolves.toBe(true);

    const session = await liveSession(db, p.learnerId, p.topic.id);
    const items = await loadSessionItems(db, session!.id, p.learnerId);
    const tries = items.filter((i) => i.kind === QUICK_TRY).map((i) => i.data as unknown as QuickTryData);
    expect(tries.at(-1)).toMatchObject({ skillId: "pts-to-bp", prompt: expect.stringContaining("7.5% to 7.2%") });
    const result = items.findLast((i) => i.kind === QUICK_TRY_RESULT)?.data as unknown as QuickTryResultData;
    expect(result).toMatchObject({ key: tries.at(-1)!.key, verdict: "known_mistake" });
    expect(p.stateNote).toMatch(/Quick try "A rate falls from 7\.5% to 7\.2%\./);
    expect(p.stateNote).toMatch(/"0\.3" as a Known mistake/);
  });

  it("gives the follow-up turn that same try, with the Known mistake and the next method", async () => {
    const db = await testDb();
    const c = live("T3");
    const p = await prepareCase(db, c, { map, settings });
    await answerDrawnTry(db, map, c, p);
    const { client, requests } = scriptedClient([{ content: [{ type: "text", text: "Fill in the boxes.\nOne point is ___ bp, so 0.4 points is ___ bp?" }] }]);
    const events = await collect(runTutorTurn({ db, client, map, learnerId: p.learnerId, checkReplies: false }, { quickTryFollowUp: true }));
    expect(events.at(-1)?.type).toBe("done");
    const sent = JSON.stringify(requests[0]);
    expect(sent).toMatch(/missed a Quick try on the same idea twice in a row/);
    expect(sent).toMatch(/A rate falls from 7\.5% to 7\.2%\./);
    expect(sent).toMatch(/The Learner gave \\"0\.3\\": a Known mistake/);
  });

  it("refuses a case that names a Quick try the Check does not have, or one on another Skill", () => {
    const wrongId: LiveCase = { ...live("T3"), answer: { skill: "pts-to-bp", verdict: "wrong", try: "pb-try-nope" } };
    expect(pendingReason(wrongId, map)).toMatch(/has no fixed Quick try "pb-try-nope"/);
    const wrongSkill: LiveCase = { ...live("T3"), answer: { skill: "pts-to-bp", verdict: "wrong", try: "pb-try-a1" } };
    expect(pendingReason(wrongSkill, map)).toMatch(/pb-try-a1 is on the Skill pts, not pts-to-bp/);
  });
});
