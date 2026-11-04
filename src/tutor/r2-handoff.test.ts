import { stringify } from "yaml";
import { describe, expect, it } from "vitest";
import { loadCourseMap, parseCourseMap, type CourseMap } from "@/course/map";
import { OWNER_LEARNER_ID } from "@/db/schema";
import type { Db } from "@/db/types";
import { saveWidgetState } from "@/learner/widget-state";
import { testDb } from "@/test/pglite";
import { scriptedClient, type ScriptedReply } from "@/test/scripted-client";
import { finishStepFromWidget } from "./next";
import { loadThread, textOf } from "./transcript";
import { runTutorTurn, type TurnEvent, type TurnInput } from "./turn";
import { requestStop, resumeTurn, startTurn, STOP_REQUESTED, stopRequested, updateTurn } from "./turn-status";

/** Fixes handed over by the UX run (ticket #248): the Learner's bubble, and a step finished twice from the study page. */

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

describe("the Learner's bubble", () => {
  it("never shows the Widget notes code adds to the Learner's message, in new or old Sessions", () => {
    const content = [
      { type: "text", text: "Why is it flat?" },
      { type: "text", text: "Widget notes (code): Recent archetypes, latest last: Grow, Compare." },
    ];
    expect(textOf(content)).toBe("Why is it flat?");
  });
});

describe("a step finished from a Widget by two renders at once", () => {
  it("stores one step divider", async () => {
    const db = await testDb();
    const first = await turn(db, "Hi", "The story.");
    const sessionId = sessionOf(first);
    await turn(db, { next: "concept" }, "The concept.");
    await saveWidgetState(db, { sessionId, widgetKey: WIDGET, values: { $old: 6, $new: 6.4 }, ticked: [TASK] }, OWNER_LEARNER_ID);
    const [a, b] = await Promise.all([finishStepFromWidget(db, map, OWNER_LEARNER_ID, new Date()), finishStepFromWidget(db, map, OWNER_LEARNER_ID, new Date())]);
    expect(a.length + b.length).toBe(1);
    const dividers = (await loadThread(db, sessionId, map, OWNER_LEARNER_ID)).filter((e) => e.role === "item" && e.kind === "step");
    // One divider from the Next into the concept step, one from the finished step.
    expect(dividers).toHaveLength(2);
  });
});

describe("Stop is tied to its turn", () => {
  it("stops only the turn it names, so a late or repeated Stop cannot stop the next one", async () => {
    const db = await testDb();
    let id = 0;
    const never = new Promise<never>(() => {});
    const { client, requests } = scriptedClient([{ content: [{ type: "text", text: "Writing" }], holdAfterFirstText: never }]);
    const run = (async () => {
      for await (const e of runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID, onTurn: (t) => (id = t) }, "Hello")) void e;
    })();
    while (requests.length < 1) await new Promise((r) => setTimeout(r, 5));
    expect(id).toBeGreaterThan(0);
    // A Stop for an earlier turn finds nothing to stop here.
    expect(await requestStop(db, OWNER_LEARNER_ID, id + 1)).toBe(false);
    expect(await requestStop(db, OWNER_LEARNER_ID, id)).toBe(true);
    await run;
  });

  it("a Stop that reached a turn at its deadline is still there when the cut-off turn resumes", async () => {
    const db = await testDb();
    const turn = (await startTurn(db, new Date(), "Hello", OWNER_LEARNER_ID))!;
    expect(await requestStop(db, OWNER_LEARNER_ID, turn.id)).toBe(true);
    await updateTurn(db, turn.id, { status: "cut_off" });
    const claim = await resumeTurn(db, new Date(), OWNER_LEARNER_ID);
    expect(claim.turn?.stopReason).toBe(STOP_REQUESTED);
    expect(await stopRequested(db, turn.id)).toBe(true);
  });

  it("a failed turn that is retried does not carry an old Stop", async () => {
    const db = await testDb();
    const turn = (await startTurn(db, new Date(), "Hello", OWNER_LEARNER_ID))!;
    await requestStop(db, OWNER_LEARNER_ID, turn.id);
    await updateTurn(db, turn.id, { status: "failed" });
    const claim = await resumeTurn(db, new Date(), OWNER_LEARNER_ID);
    expect(claim.turn?.stopReason).toBeNull();
  });
});

describe("a stopped reply's trailing code fence", () => {
  const FENCE = "```";
  it("drops a bare fence the reply stopped on, in the server copy and the browser copy", async () => {
    const { withoutOpenWidget: server } = await import("./turn");
    const { withoutOpenWidget: browser } = await import("@/app/turn-stream");
    for (const cut of [server, browser]) {
      expect(cut(`Look:\n${FENCE}`)).toBe("Look:");
      expect(cut(FENCE)).toBe("");
      // A fence that closes one is kept, and so is a finished Widget.
      expect(cut(`Try:\n${FENCE}\nx = 1\n${FENCE}`)).toBe(`Try:\n${FENCE}\nx = 1\n${FENCE}`);
      const done = `${FENCE}openui-lang\nroot = Card([])\n${FENCE}`;
      expect(cut(`Here.\n\n${done}`)).toBe(`Here.\n\n${done}`);
    }
  });
});
