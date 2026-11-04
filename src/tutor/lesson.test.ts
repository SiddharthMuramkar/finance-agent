import { stringify } from "yaml";
import { describe, expect, it } from "vitest";
import { loadCourseMap, parseCourseMap, type CourseMap } from "@/course/map";
import { OWNER_LEARNER_ID } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadProgress } from "@/learner/memory";
import { saveWidgetState } from "@/learner/widget-state";
import { testDb } from "@/test/pglite";
import { scriptedClient, type ScriptedReply } from "@/test/scripted-client";
import { finishStepFromWidget, nextOfferNow } from "./next";
import { offTopicItem, storeOffTopic } from "./off-topic";
import { loadPastSession, loadPastSessions } from "./past-sessions";
import { loadThread } from "./transcript";
import { runTutorTurn, type TurnEvent, type TurnInput } from "./turn";
import { stepContext } from "./context";
import { navigate } from "@/course/navigator";

/**
 * The lesson additions on a real (in-memory) database: a step opens its Widget by itself when it begins, a step
 * finishes from the Learner's saved Widget state, an Off-Topic answer block is stored, and Past Sessions say what the
 * Learner found. Percent, percentage points and basis points alone, with its Widget opening at the concept step here.
 */

const REAL = loadCourseMap();
const TOPIC = "num-percent-bps";
const WIDGET = "rate-change-three-ways";
const TASK = "Set a rise from 6% to 6.4%";

function lessonMap(): CourseMap {
  const t = REAL.topic(TOPIC)!;
  const body = {
    ...t,
    stage: t.stage,
    path: 1,
    prerequisites: [],
    subject: undefined,
    connections: undefined,
    // Concept opens the Widget; the first Guided Task finishes it.
    steps: [{ step: "concept", opens: WIDGET, doneWhen: { kind: "ticked", widget: WIDGET, task: 1 } }],
  };
  const { map, errors } = parseCourseMap([{ name: `${TOPIC}.yaml`, text: stringify(body) }]);
  if (!map) throw new Error(errors.join("\n"));
  return map;
}
const map = lessonMap();

const say = (text: string): ScriptedReply => ({ content: [{ type: "text", text }] });

async function turn(db: Db, input: TurnInput, reply: string) {
  const { client } = scriptedClient([say(reply)]);
  const events: TurnEvent[] = [];
  for await (const e of runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, input)) events.push(e);
  return events;
}
const sessionOf = (events: TurnEvent[]) => (events.at(-1) as Extract<TurnEvent, { type: "done" }>).ref.sessionId;
const items = async (db: Db, sessionId: number) => (await loadThread(db, sessionId, map, OWNER_LEARNER_ID)).filter((e) => e.role === "item");

describe("a step that opens its Widget by itself", () => {
  it("stores the Widget opened item after the divider when the step begins, once", async () => {
    const db = await testDb();
    const first = await turn(db, "Hi", "The story.");
    const next = await turn(db, { next: "concept" }, "The concept.");
    // The browser hears the divider, then the Widget chip, before the new reply.
    expect(next.filter((e) => e.type === "item").map((e) => (e as Extract<TurnEvent, { type: "item" }>).item.kind)).toEqual(["step", "widget_opened"]);
    expect(await items(db, sessionOf(first))).toEqual([
      expect.objectContaining({ kind: "step" }),
      expect.objectContaining({ kind: "widget_opened", data: { id: WIDGET, title: "One rate change, said three ways" } }),
    ]);
  });

  it("tells the Tutor the Widget is open and when the step is done", () => {
    const place = navigate(map, { currentTopicId: TOPIC, topics: { [TOPIC]: { step: "concept", passedChecks: [], revealShown: false, status: "in_progress" } } })!;
    const context = stepContext(place);
    expect(context).toContain(`Code opened the Widget "One rate change, said three ways" (id ${WIDGET})`);
    expect(context).toContain(`ticked the Guided Task "${TASK}"`);
    expect(context).toContain("Topic goal");
  });
});

describe("a step that finishes from what the Learner did in a Widget", () => {
  it("finishes only once the Guided Task is ticked, then stores the divider and teaches nothing yet", async () => {
    const db = await testDb();
    const first = await turn(db, "Hi", "The story.");
    const sessionId = sessionOf(first);
    await turn(db, { next: "concept" }, "The concept.");
    expect(await finishStepFromWidget(db, map, OWNER_LEARNER_ID, new Date())).toEqual([]);
    expect((await loadProgress(db, OWNER_LEARNER_ID)).topics[TOPIC]).toMatchObject({ step: "concept" });

    const saved = await saveWidgetState(db, { sessionId, widgetKey: WIDGET, values: { $old: 6, $new: 6.4 }, ticked: [TASK] }, OWNER_LEARNER_ID);
    expect(saved.ok).toBe(true);
    const stored = await finishStepFromWidget(db, map, OWNER_LEARNER_ID, new Date());
    expect(stored.map((i) => i.kind)).toEqual(["step"]);
    expect((await loadProgress(db, OWNER_LEARNER_ID)).topics[TOPIC]).toMatchObject({ step: "your_turn" });
    // Nothing is taught yet, so Next names the new step without moving on.
    expect(await nextOfferNow(db, map, OWNER_LEARNER_ID, new Date())).toEqual({ kind: "next", step: "your_turn", label: "Next: Your turn", advances: false });
    // Once the Tutor has spoken, it moves on as usual.
    await turn(db, { next: "your_turn" }, "Your turn.");
    expect(await nextOfferNow(db, map, OWNER_LEARNER_ID, new Date())).toEqual({ kind: "next", step: "check", label: "Next: Check", advances: true });
    // And finishing again does nothing: that step has no condition.
    expect(await finishStepFromWidget(db, map, OWNER_LEARNER_ID, new Date())).toEqual([]);
  });
});

describe("an Off-Topic answer block", () => {
  it("is stored after the latest message, pointing back at the current step", async () => {
    const db = await testDb();
    const first = await turn(db, "Hi", "The story.");
    await turn(db, { next: "concept" }, "The concept.");
    const sessionId = sessionOf(first);
    const item = await storeOffTopic(db, map, OWNER_LEARNER_ID, sessionId, new Date());
    expect(item).toEqual({ kind: "off_topic", data: { topicId: TOPIC, title: map.topic(TOPIC)!.title, step: 2 } });
    expect((await items(db, sessionId)).at(-1)).toMatchObject({ kind: "off_topic" });
    expect(await offTopicItem(db, map, OWNER_LEARNER_ID, 9999)).toBeNull();
  });
});

describe("what the Learner found", () => {
  it("is on the Past Sessions row and header once their saved Widget state shows it", async () => {
    const db = await testDb();
    const first = await turn(db, "Hi", "The story.");
    const sessionId = sessionOf(first);
    expect((await loadPastSessions(db, map, OWNER_LEARNER_ID)).topics[0].found).toBeUndefined();
    await saveWidgetState(db, { sessionId, widgetKey: WIDGET, values: { $old: 6, $new: 6.4 }, ticked: [TASK] }, OWNER_LEARNER_ID);
    const found = ["You set a rate change on the sliders and read it in points, basis points and percent change."];
    expect((await loadPastSessions(db, map, OWNER_LEARNER_ID)).topics[0].found).toEqual(found);
    expect(await loadPastSession(db, map, sessionId, OWNER_LEARNER_ID)).toMatchObject({ kind: "topic", found });
  });
});
