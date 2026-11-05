import { describe, expect, it } from "vitest";
import type { CourseMap } from "@/course/map";
import { importCaseData } from "@/case-data/import";
import type { TeachingStep } from "@/course/navigator";
import { OWNER_LEARNER_ID } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadProgress, saveFinishedStep } from "@/learner/memory";
import { saveWidgetState } from "@/learner/widget-state";
import { testDb } from "@/test/pglite";
import { presentValueOnly } from "@/test/present-value-map";
import { scriptedClient, type ScriptedReply } from "@/test/scripted-client";
import { GO_DEEPER } from "./chips";
import { listSessions, loadThread } from "./transcript";
import { NOT_THE_LEARNERS_ATTEMPT } from "./tools";
import { latestTurn, runTutorTurn, type TurnDeps, type TurnEvent, type TurnInput } from "./turn";
import { turnKind } from "./turn-status";

/**
 * Seam 1, Tutor Turn: what the Tutor sees of the Learner's Widgets (spec #119, "Widgets › What the Tutor sees").
 * Each Learner message, chip and Next carries the open Widgets' slider values and ticked Guided Tasks, with the
 * key readouts of our own parts worked out by code. Scripted Anthropic client, in-memory Postgres.
 */

const map = presentValueOnly({ withoutQuiz: true, withoutInsight: true });

const RATES = [
  'root = Widget("Rates", [rate, steps])',
  "$rate = 5",
  'rate = Slider("rate", "Interest rate", 0, 10, 0.01, $rate, "percent")',
  "steps = GuidedTasks([t1])",
  't1 = GuidedTask("Set the rate to 3%", $rate == 3)',
].join("\n");
const fence = (code: string) => ["```openui-lang", code, "```"].join("\n");

const say = (text: string): ScriptedReply => ({ content: [{ type: "text", text }] });
const sent = (request: { messages: unknown[] }) => JSON.stringify(request.messages);

async function turn(db: Db, input: TurnInput, replies: ScriptedReply[], extra: Partial<TurnDeps> = {}, courseMap: CourseMap = map) {
  const { client, requests } = scriptedClient(replies);
  const events: TurnEvent[] = [];
  for await (const e of runTutorTurn({ db, client, map: courseMap, ...extra, learnerId: OWNER_LEARNER_ID }, input)) events.push(e);
  return { events, requests };
}

async function sessionId(db: Db) {
  return (await listSessions(db, OWNER_LEARNER_ID))[0].id;
}

describe("the Widget context sent with a Learner's message", () => {
  it("tells the Tutor the rate the Learner has set, so 'What rate do I have set?' gets it right", async () => {
    const db = await testDb();
    await turn(db, "Show me a rate.", [say(`Try it.\n\n${fence(RATES)}`)]);
    await saveWidgetState(db, { sessionId: await sessionId(db), widgetKey: "Rates", values: { $rate: 3.38 }, ticked: [] }, OWNER_LEARNER_ID);

    const asked = await turn(db, "What rate do I have set?", [say("You have 3.38% set.")]);
    expect(sent(asked.requests[0])).toContain("Interest rate: 3.38%");
  });

  it("sends the values the page has now over those saved, and the ticked Guided Tasks", async () => {
    const db = await testDb();
    await turn(db, "Show me a rate.", [say(`Try it.\n\n${fence(RATES)}`)]);
    await saveWidgetState(db, { sessionId: await sessionId(db), widgetKey: "Rates", values: { $rate: 7 }, ticked: [] }, OWNER_LEARNER_ID);

    const asked = await turn(db, "Is this right?", [say("Yes.")], { widgets: { Rates: { values: { $rate: 3 }, ticked: ["Set the rate to 3%"] } } });
    const request = sent(asked.requests[0]);
    expect(request).toContain("Interest rate: 3%");
    expect(request).not.toContain("Interest rate: 7%");
    expect(request).toContain("1 of 1 ticked");
    expect(request).toContain("[x] Set the rate to 3%");
  });

  it("sends the values a Widget's code starts at when the Learner has not moved it", async () => {
    const db = await testDb();
    await turn(db, "Show me a rate.", [say(`Try it.\n\n${fence(RATES)}`)]);
    const asked = await turn(db, "What now?", [say("Move it.")]);
    expect(sent(asked.requests[0])).toContain("Interest rate: 5%");
    expect(sent(asked.requests[0])).toContain("[ ] Set the rate to 3%");
  });

  it("is stored with that message and replayed unchanged, and never drawn in the thread", async () => {
    const db = await testDb();
    await turn(db, "Show me a rate.", [say(`Try it.\n\n${fence(RATES)}`)]);
    await turn(db, "What rate do I have set?", [say("3.38%.")], { widgets: { Rates: { values: { $rate: 3.38 }, ticked: [] } } });
    const later = await turn(db, "And now?", [say("1%.")], { widgets: { Rates: { values: { $rate: 1 }, ticked: [] } } });

    const messages = later.requests[0].messages as { role: string; content: unknown }[];
    const said = (text: string) => JSON.stringify(messages.find((m) => m.role === "user" && JSON.stringify(m.content).includes(text))!.content);
    expect(said("What rate do I have set?")).toContain("Interest rate: 3.38%");
    expect(said("What rate do I have set?")).not.toContain("Interest rate: 1%");
    expect(said("And now?")).toContain("Interest rate: 1%");

    const thread = await loadThread(db, await sessionId(db), map, OWNER_LEARNER_ID);
    expect(thread.filter((e) => e.role === "user").map((e) => e.role === "user" && e.text)).toEqual(["Show me a rate.", "What rate do I have set?", "And now?"]);
  });

  it("goes with a chip and with a Next, but not with the opener the page starts", async () => {
    const db = await testDb();
    const opener = await turn(db, { opener: true }, [say(`Once, a lottery winner had a choice.\n\n${fence(RATES)}`)]);
    expect(sent(opener.requests[0])).not.toContain("Widgets by code:");

    const chip = await turn(db, GO_DEEPER, [say("Simply put.")], { widgets: { Rates: { values: { $rate: 2 }, ticked: [] } } });
    expect(sent(chip.requests[0])).toContain("Interest rate: 2%");

    const next = await turn(db, { next: "concept" }, [say("The concept.")], { widgets: { Rates: { values: { $rate: 4 }, ticked: [] } } });
    expect(sent(next.requests[0])).toContain("Interest rate: 4%");
  });

  it("sends no Widget context while no Widget is open", async () => {
    const db = await testDb();
    await turn(db, "Hi", [say("Hello.")]);
    const asked = await turn(db, "What rate?", [say("None yet.")]);
    expect(sent(asked.requests[0])).not.toContain("Widgets by code:");
    expect(asked.requests[0].messages).toContainEqual({ role: "user", content: "What rate?" });
  });
});

describe("the readouts code works out for the Tutor", () => {
  const withInsight = presentValueOnly({ withoutQuiz: true });

  async function atExplore(db: Db) {
    await turn(db, "Hi", [say("Once upon a time.")], {}, withInsight);
    for (const step of ["story", "concept"] as TeachingStep[]) {
      const moved = await saveFinishedStep(db, withInsight, step, new Date(), OWNER_LEARNER_ID);
      if (!moved.ok) throw new Error(moved.reason);
    }
  }

  it("gives the explore Widget's worth today and the sourced cash option, from the tested calculator and Case Data", async () => {
    const db = await testDb();
    await importCaseData(db, [
      {
        caseId: "mega-millions-2018",
        id: "cash-option",
        label: "Cash option",
        unit: "USD",
        source: "A source",
        sourceUrl: "https://example.org/source",
        checkedOn: "2026-11-02",
        checkNote: "Compared with the source.",
        points: [{ date: "2018-10-23", value: 877_800_000 }],
      },
    ]);
    await atExplore(db);
    const asked = await turn(db, "Which is better?", [say("Look at the Widget.")], { widgets: { "annuity-worth-today": { values: { $rate: 3.5 }, ticked: [] } } }, withInsight);
    const request = sent(asked.requests[0]);
    expect(request).toContain("(the Topic's explore Widget)");
    expect(request).toContain("Interest rate (discount rate): 3.5%");
    expect(request).toContain("Sum of payments: $1.537 billion");
    expect(request).toContain("Worth today at 3.5%: $861.7 million");
    expect(request).toContain("Cash option: $877.8 million (sourced, 2018-10-23)");
  });

  it("lists the annuity Widget once when the Tutor reopens it at explore: it is the explore Widget, under one key", async () => {
    const db = await testDb();
    await atExplore(db);
    const open = { content: [{ type: "tool_use", id: "toolu_open", name: "open_widget", input: { id: "annuity-worth-today" } }] } as ScriptedReply;
    await turn(db, "Show me the annuity again.", [open, say("It is on the right.")], {}, withInsight);
    const asked = await turn(db, "What rate is set?", [say("4%.")], { widgets: { "annuity-worth-today": { values: { $rate: 4 }, ticked: [] } } }, withInsight);
    const request = sent(asked.requests[0]);
    const block = request.slice(request.lastIndexOf("Widgets by code:"));
    expect(block.split('\\"What the annuity is worth today\\"').length - 1).toBe(1);
    expect(block).toContain("Interest rate (discount rate): 4%");
  });

  it("gives a Calculator's and a Formula Card's results at the slider's value", async () => {
    const db = await testDb();
    const code = [
      'root = Widget("Loan and card", [rate, calc, card, steps])',
      "$rate = 8",
      'rate = Slider("rate", "Interest rate", 0, 20, 0.01, $rate, "percent")',
      'calc = Calculator("present_value", {amount: 1000, ratePercent: $rate, years: 5})',
      'card = FormulaCard("present-value", {ratePercent: $rate}, {}, {amount: 1000, years: 5})',
      "steps = GuidedTasks([t1])",
      't1 = GuidedTask("Set the rate to 10%", $rate == 10)',
    ].join("\n");
    await turn(db, "Show me.", [say(fence(code))]);
    const asked = await turn(db, "What is it worth?", [say("See.")], { widgets: { "Loan and card": { values: { $rate: 10 }, ticked: [] } } });
    const request = sent(asked.requests[0]);
    expect(request).toContain("Present value $620.92");
    expect(request).toContain("Present value of one future payment: Worth today (present value) $620.92");
  });
});

describe("Tell the Tutor what I found", () => {
  const tool = (name: string, input: object): ScriptedReply => ({ content: [{ type: "text", text: "Nice." }, { type: "tool_use", id: `toolu_${name}`, name, input }] });
  const ticked = { Rates: { values: { $rate: 3 }, ticked: ["Set the rate to 3%"] } };

  it("posts a message code writes from the Widget's values, as a widget report turn that is never a Learner bubble", async () => {
    const db = await testDb();
    await turn(db, "Show me a rate.", [say(`Try it.\n\n${fence(RATES)}`)]);
    const report = await turn(db, { widgetReport: "Rates" }, [say("You found it.")], { widgets: ticked });

    expect(report.events.at(-1)).toMatchObject({ type: "done" });
    const request = sent(report.requests[0]);
    expect(request).toContain("Widget report by code:");
    expect(request).toContain("I set the interest rate to 3%.");
    expect(turnKind((await latestTurn(db, OWNER_LEARNER_ID))!)).toBe("widget_report");
    const thread = await loadThread(db, await sessionId(db), map, OWNER_LEARNER_ID);
    expect(thread.filter((e) => e.role === "user").map((e) => e.role === "user" && e.text)).toEqual(["Show me a rate."]);
    expect(thread.at(-1)).toMatchObject({ role: "assistant", text: "You found it." });
  });

  it("is refused as an Insight attempt", async () => {
    const withInsight = presentValueOnly({ withoutQuiz: true });
    const db = await testDb();
    await turn(db, "Hi", [say("Once upon a time.")], {}, withInsight);
    for (const step of ["story", "concept"] as TeachingStep[]) await saveFinishedStep(db, withInsight, step, new Date(), OWNER_LEARNER_ID);
    await turn(db, "Show me.", [say(`Here.\n\n${fence(RATES)}`)], {}, withInsight);

    const report = await turn(
      db,
      { widgetReport: "Rates" },
      [tool("record_insight_attempt", { outcome: "found", learner_words: "I set the interest rate to 3%." }), say("Say it in your words.")],
      { widgets: ticked },
      withInsight,
    );
    expect(JSON.stringify(report.requests.at(-1)!.messages.at(-1))).toContain(NOT_THE_LEARNERS_ATTEMPT);
    expect((await loadProgress(db, OWNER_LEARNER_ID)).topics["present-value"].insight).toBeUndefined();
  });

  it("is not allowed until every Guided Task under the Widget is ticked, and nothing is stored", async () => {
    const db = await testDb();
    await turn(db, "Show me a rate.", [say(`Try it.\n\n${fence(RATES)}`)]);
    const report = await turn(db, { widgetReport: "Rates" }, [], { widgets: { Rates: { values: { $rate: 3 }, ticked: [] } } });
    expect(report.events.map((e) => e.type)).toEqual(["not_allowed"]);
    expect(report.requests).toEqual([]);
    expect(turnKind((await latestTurn(db, OWNER_LEARNER_ID))!)).toBe("message");
  });
});
