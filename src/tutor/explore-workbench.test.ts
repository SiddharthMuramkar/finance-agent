import { stringify } from "yaml";
import { describe, expect, it } from "vitest";
import { loadCourseMap, parseCourseMap, type CourseMap } from "@/course/map";
import { OWNER_LEARNER_ID } from "@/db/schema";
import { saveFinishedStep } from "@/learner/memory";
import { loadSessionItems } from "./session-items";
import { navigate } from "@/course/navigator";
import { testDb } from "@/test/pglite";
import { scriptedClient, type ScriptedReply } from "@/test/scripted-client";
import { WIDGET_SHOWN } from "@/widgets/shown-widget";
import { recipeById } from "@/widgets/recipes";
import { stepContext } from "./context";
import { exploreWidgetOf } from "@/course/explore-widget";
import { exploreWorkbenchCall, opensExploreWorkbench } from "./explore-workbench";
import { runTutorTurn, type TurnEvent } from "./turn";

/**
 * A Spine Topic's explore Workbench reaches the Widget panel through show_widget (spec 2026-11-12 B2, C2; ADR 0018). The
 * Topic here is present value with its explore Widget swapped for the Value levers Workbench on Damodaran's Amazon Case
 * (val-dcf's amazon-dcf-2000), as a Spine Topic's file writes it.
 */

function workbenchMap(): CourseMap {
  const real = loadCourseMap();
  const t = real.topic("present-value")!;
  const amazon = real.topic("val-dcf")!.cases.find((c) => c.id === "amazon-dcf-2000")!;
  const body = {
    ...t,
    stage: t.stage,
    path: t.path,
    prerequisites: [],
    subject: undefined,
    connections: undefined,
    checks: t.checks.filter((c) => c.kind !== "quiz"),
    questions: undefined,
    scenes: t.scenes.filter((s) => !t.checks.some((c) => c.kind === "quiz" && c.id === s.check)),
    cases: [...t.cases, amazon],
    explore: { ...t.explore, widget: undefined, workbench: { recipe: "value_levers", case: "amazon-dcf-2000", title: "What is Amazon worth a share?", inputs: { caseStory: "Damodaran's story" } } },
  };
  const { map, errors } = parseCourseMap([{ name: "present-value.yaml", text: stringify(body) }]);
  if (!map) throw new Error(errors.join("\n"));
  return map;
}

const map = workbenchMap();
const topic = map.topic("present-value")!;

describe("the explore Workbench", () => {
  it("is one show_widget call from the Topic file that the recipe builds", () => {
    const call = exploreWorkbenchCall(topic)!;
    expect(call).toEqual({
      recipe: "value_levers",
      params: { title: "What is Amazon worth a share?", inputs: { caseStory: "Damodaran's story", case: "amazon-dcf-2000" }, refs: {}, facts: {} },
    });
    expect(recipeById(call.recipe)!.build(call.params)).toMatchObject({ ok: true });
    expect(exploreWorkbenchCall(loadCourseMap().topic("present-value")!)).toBeNull();
  });

  it("is the Widget code puts in the panel at explore, and the Tutor is told it is on screen", () => {
    const call = exploreWorkbenchCall(topic)!;
    const drawn = exploreWidgetOf(topic)!;
    expect(drawn.code).toBe((recipeById(call.recipe)!.build(call.params) as { code: string }).code);
    const at = (step: "concept" | "explore") =>
      stepContext(navigate(map, { currentTopicId: topic.id, topics: { [topic.id]: { status: "in_progress", step, passedChecks: [], revealShown: false } } } as never));
    expect(at("explore")).toContain("Explore Widget. Code has put it on screen already");
    expect(at("explore")).toContain("Do not draw it yourself");
    expect(at("concept")).not.toContain("Explore Widget. Code has put it on screen already");
  });

  it("is not listed twice when the Tutor reopens it with show_widget at the explore step: the Tutor is pointed at the Explore tab", async () => {
    const db = await testDb();
    for (const step of ["story", "concept"] as const) await saveFinishedStep(db, map, step, new Date(), OWNER_LEARNER_ID);
    const call = exploreWorkbenchCall(topic)!;
    // The scripted Tutor's own title, as a real Tutor might write it: same recipe, same Case.
    const again = { ...call, params: { ...call.params, title: "Amazon, February 2000: your story" } };
    const replies: ScriptedReply[] = [
      { content: [{ type: "tool_use", id: "toolu_bench", name: "show_widget", input: again }] },
      { content: [{ type: "text", text: "Move the Levers and watch what a share is worth.\n\nWhich Lever moves it most?" }] },
    ];
    const { client, requests } = scriptedClient(replies);
    const events: TurnEvent[] = [];
    for await (const e of runTutorTurn({ db, client, map, learnerId: OWNER_LEARNER_ID }, "Ready.")) events.push(e);
    const result = JSON.stringify(requests[1]?.messages.at(-1));
    expect(result).not.toContain('"is_error":true');
    expect(result).toContain("Already on screen: the Topic's explore Workbench is open in the Widget panel as its \\\"Explore\\\" tab");
    expect(events.some((e) => e.type === "item" && e.item.kind === WIDGET_SHOWN)).toBe(false);
    const stored = (await loadSessionItems(db, (events.at(-1) as Extract<TurnEvent, { type: "done" }>).ref.sessionId, OWNER_LEARNER_ID)).filter((i) => i.kind === WIDGET_SHOWN);
    expect(stored).toEqual([]);
  });

  it("knows a call that reopens it: the same recipe on the same Case, whatever the title", () => {
    const call = exploreWorkbenchCall(topic)!;
    expect(opensExploreWorkbench(topic, "value_levers", call.params)).toBe(true);
    expect(opensExploreWorkbench(topic, "value_levers", { ...call.params, title: "Another title", inputs: { case: "amazon-dcf-2000" } })).toBe(true);
    expect(opensExploreWorkbench(topic, "value_levers", { ...call.params, inputs: { case: "spine-01-amazon-2000" } })).toBe(false);
    expect(opensExploreWorkbench(topic, "terminal_seesaw", { ...call.params, inputs: { case: "amazon-dcf-2000" } })).toBe(false);
    expect(opensExploreWorkbench(loadCourseMap().topic("present-value")!, "value_levers", call.params)).toBe(false);
  });
});

describe("every Spine Topic's explore Workbench", () => {
  it("is a show_widget call its recipe builds, and code puts it in the panel (never dropped silently)", () => {
    const real = loadCourseMap();
    const benches = real.topics.filter((t) => t.explore?.workbench);
    expect(benches.length).toBeGreaterThan(0);
    const broken = benches.flatMap((t) => {
      const call = exploreWorkbenchCall(t)!;
      const built = recipeById(call.recipe)?.build(call.params);
      if (!built?.ok) return [`${t.id}: ${built ? built.error : `no recipe ${call.recipe}`}`];
      return exploreWidgetOf(t) ? [] : [`${t.id}: exploreWidgetOf dropped it`];
    });
    expect(broken).toEqual([]);
  });
});
