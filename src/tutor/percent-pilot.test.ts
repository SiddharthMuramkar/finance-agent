import { stringify } from "yaml";
import { describe, expect, it } from "vitest";
import { questionLookup } from "@/bank/lookup";
import { loadCourseMap, parseCourseMap, type CourseMap } from "@/course/map";
import { navigate } from "@/course/navigator";
import { widgetsIn, type ThreadLine } from "@/app/thread";
import { WIDGET_OPENED } from "@/course/written-ahead";
import { caseDataPoints, caseDatasets, messages, OWNER_LEARNER_ID, sessionItems, sessions } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadProgress } from "@/learner/memory";
import { openQuiz, submitQuiz } from "@/learner/quiz";
import { loadSaved, saveToNotes } from "@/learner/saved";
import { loadWidgetStates, saveWidgetState } from "@/learner/widget-state";
import { OLD_PERCENT_WIDGET } from "@/test/old-percent-map";
import { loadWrittenAhead } from "./written-ahead";
import { plainExact } from "@/teaching";
import { testDb } from "@/test/pglite";
import { scriptedClient, type ScriptedReply } from "@/test/scripted-client";
import { WIDGET_SHOWN, type ShownWidget } from "@/widgets/shown-widget";
import { answerQuickTry, enterStepItems, quickTryItem } from "./practice";
import { CONCEPT_CARD, QUICK_TRY, STEP_DIVIDER, type ConceptCardData, type QuickTryData, type QuickTryResultData, type SessionItem } from "./session-item-kinds";
import { loadSessionItems } from "./session-items";
import { runTutorTurn } from "./turn";

/**
 * Percent, converted (spec #229, ticket #246), played from story to principle: each card stored with its rate_move
 * preset, Quick tries answered right, with a Known mistake and with an unknown wrong answer until fluency ends Your turn,
 * both quizzes answered in typed numbers with one fix line, the conversation Check passed on a scripted verdict, the
 * reveal opening rate_move at the Fed's move read from Case Data, and the Topic passed. A scripted Tutor, PGlite.
 */

const PERCENT = "num-percent-bps";

/** The real Percent Topic alone, first on the path. */
function percentOnly(): CourseMap {
  const t = loadCourseMap().topic(PERCENT)!;
  const body = { ...t, path: 1, prerequisites: [], subject: undefined, connections: undefined };
  const { map, errors } = parseCourseMap([{ name: `${PERCENT}.yaml`, text: stringify(body) }]);
  if (!map) throw new Error(errors.join("\n"));
  return map;
}

const map = percentOnly();
const percent = map.topic(PERCENT)!;
const me = OWNER_LEARNER_ID;
const now = () => new Date();

const say = (text: string): ScriptedReply => ({ content: [{ type: "text", text }] });
const tool = (id: string, name: string, input: Record<string, unknown>): ScriptedReply => ({ content: [{ type: "tool_use", id, name, input }] });

/** The Fed's target across the Case's as-of date, as Case Data holds it (the Topic file types neither figure). */
async function seedFedFunds(db: Db) {
  await db.insert(caseDatasets).values({
    caseId: "fed-hike-1994",
    datasetId: "fed-funds-target",
    label: "Federal funds target rate",
    unit: "percent",
    source: "Federal Reserve",
    sourceUrl: "https://www.federalreserve.gov/",
    checkedOn: "2026-10-01",
    checkNote: "test",
  });
  await db.insert(caseDataPoints).values([
    { caseId: "fed-hike-1994", datasetId: "fed-funds-target", date: "1994-01-03", value: 3 },
    { caseId: "fed-hike-1994", datasetId: "fed-funds-target", date: "1994-02-04", value: 3.25 },
  ]);
}

/** The right answer, a Known mistake's answer, or a number no rule predicts, for a Quick try, typed as the Learner would. */
function answerFor(t: QuickTryData, how: "right" | "known" | "wrong"): string | null {
  const found = quickTryItem(percent, t.key)!;
  const item = found.item;
  if (how === "wrong") return t.kind === "truth" ? null : "7777";
  if (how === "right") return "templateId" in item ? plainExact(item.answer) : String(item.answer);
  if ("templateId" in item) return item.mistakes.length ? plainExact(item.mistakes[0].value) : null;
  const m = item.mistakes?.[0];
  return m ? String(m.answer) : null;
}

describe("Percent, converted, end to end", () => {
  it("plays story to principle: cards with presets, Quick tries to fluency, typed quizzes, the conversation Check, the reveal Widget, passed", async () => {
    const db = await testDb();
    await seedFedFunds(db);
    let sessionId = 0;
    const turn = async (message: string | { opener: true }, replies: ScriptedReply[]) => {
      const { client } = scriptedClient(replies);
      const items: SessionItem[] = [];
      for await (const e of runTutorTurn({ db, client, map, learnerId: me }, message)) {
        if (e.type === "item") items.push(e.item);
        if (e.type === "done") sessionId = e.ref.sessionId;
      }
      return items;
    };
    const place = async () => navigate(map, await loadProgress(db, me));
    const stored = () => loadSessionItems(db, sessionId, me);
    let n = 0;
    const finish = (step: string) => tool(`f-${++n}`, "finish_teaching_step", { step });

    // Story.
    await turn({ opener: true }, [say("Picture February 1994.")]);
    expect((await place())?.step).toBe("story");
    await turn("Go on", [finish("story"), say("Here is the idea.")]);

    let missedOnce = false;
    let fixLines = 0;
    for (const check of percent.checks) {
      expect(await place()).toMatchObject({ check: { id: check.id } });

      // Concept: the card, then its rate_move preset at the Running example.
      if (check.card) {
        expect(await place()).toMatchObject({ step: "concept" });
        const items = await stored();
        const card = items.findLast((i) => i.kind === CONCEPT_CARD);
        expect((card?.data as ConceptCardData).checkId).toBe(check.id);
        const preset = items[items.indexOf(card!) + 1];
        expect(preset.kind).toBe(WIDGET_SHOWN);
        expect(preset.data as ShownWidget).toMatchObject({ recipe: "rate_move", params: { inputs: { old: 4, new: 5, mode: "show" } } });
      }
      for (let i = 0; i < 3 && ["concept", "explore"].includes((await place())?.step ?? ""); i++) {
        await turn("Got it", [finish((await place())!.step), say("Over to you.")]);
      }

      // Your turn: Quick tries until every Skill is fluent. The first Check sees a right answer, a Known mistake and an
      // unknown wrong answer (two misses in a row), then right answers.
      if ((await place())?.step === "your_turn" && check.quickTries.length) {
        const plan: ("right" | "known" | "wrong")[] = missedOnce ? [] : ["right", "known", "wrong"];
        missedOnce = true;
        const verdicts: string[] = [];
        for (let i = 0; i < 40 && (await place())?.step === "your_turn"; i++) {
          const open = (await stored()).filter((x) => x.kind === QUICK_TRY).at(-1)!.data as QuickTryData;
          let how = plan.shift() ?? "right";
          let typed = answerFor(open, how);
          if (typed === null) [how, typed] = ["right", answerFor(open, "right")!];
          const answered = await answerQuickTry(db, map, me, open.key, typed, now());
          expect(answered.ok).toBe(true);
          if (!answered.ok) break;
          verdicts.push((answered.items[0].data as QuickTryResultData).verdict);
          // An unknown wrong answer asks for the code-written follow-up turn, which posts the next try.
          if (answered.followUp && (await place())?.step === "your_turn") await turn("Quick try follow-up by code: name the slip.", [say("You divided where you should multiply. Try this one.")]);
        }
        if (check.id === percent.checks[0].id) expect(verdicts.slice(0, 3)).toEqual(["right", "known_mistake", "wrong"]);
        expect((await stored()).at(-1)?.kind === STEP_DIVIDER || (await place())?.step === "check").toBe(true);
      }
      for (let i = 0; i < 2 && (await place())?.step === "your_turn"; i++) await turn("Done", [finish("your_turn"), say("To the Check.")]);
      expect(await place()).toMatchObject({ step: "check", check: { id: check.id } });

      if (check.kind === "quiz") {
        // A typed quiz: every typed question right but one, which takes a Known mistake and shows its fix line.
        const quiz = (await openQuiz(db, map, now(), me))!;
        expect(quiz.checkId).toBe(check.id);
        expect(quiz.questions.some((q) => q.kind === "number")).toBe(true);
        const lookup = await questionLookup(db, map, quiz.questions.map((q) => q.id));
        let slipped = false;
        const answers = Object.fromEntries(
          quiz.questions.map((q) => {
            const keyed = lookup.question(q.id)!;
            if (!keyed.drawn) return [q.id, keyed.answer];
            if (!slipped && keyed.drawn.mistakes.length) {
              slipped = true;
              return [q.id, plainExact(keyed.drawn.mistakes[0].value)];
            }
            return [q.id, plainExact(keyed.drawn.answer)];
          }),
        );
        const result = await submitQuiz(db, map, quiz.attemptId, answers, now(), me);
        expect(result).toMatchObject({ ok: true, passed: true });
        const fixes = result.ok ? result.questions.filter((q) => q.mistake) : [];
        expect(fixes).toHaveLength(1);
        fixLines += fixes.length;
        // The Learner's next message hears the result, and code shows the next step's card.
        await turn("I did the quiz", [say("Well done. Next idea.")]);
      } else {
        await turn("All three can be right: 50 bp is half a point, and 8 percent is of the old rate. I would say up 50 bp, from 6.25% to 6.75%.", [
          tool("v1", "record_check_verdict", { check_id: check.id, verdict: "pass", reasons: "Named the units and the base." }),
          say("Well put. Here is what happened in 1994."),
        ]);
      }
    }
    expect(fixLines).toBe(2);

    // The reveal opened through the tool's step divider, with rate_move at the Fed's move, read from Case Data.
    expect((await place())?.step).toBe("reveal");
    const reveal = (await stored()).filter((i) => i.kind === WIDGET_SHOWN && (i.data as ShownWidget).id === `reveal-${PERCENT}`);
    expect(reveal).toHaveLength(1);
    expect(reveal[0].data as ShownWidget).toMatchObject({ recipe: "rate_move", title: "The Fed's move of February 1994", params: { inputs: { old: 3, new: 3.25, mode: "show" } } });
    expect(await enterStepItems(db, map, me, sessionId, now())).toEqual([]);

    await turn("What happened next?", [finish("reveal"), say("The principle.")]);
    expect((await place())?.step).toBe("principle");
    await turn("That makes sense", [finish("principle"), say("Percent is done.")]);
    expect((await loadProgress(db, me)).topics[PERCENT]?.status).toBe("passed");
  });
});

describe("an old Percent Session after the conversion", () => {
  it("still loads with the gone Widget's chip and saved state, leaves the chip out of the thread, and keeps a Note of its code", async () => {
    const db = await testDb();
    const [s] = await db.insert(sessions).values({ learnerId: me, topicId: PERCENT, instructions: "i", tools: [], model: "m", effort: "medium", fingerprint: "f" }).returning();
    const fence = ["```openui-lang", OLD_PERCENT_WIDGET.code.trim(), "```"].join("\n");
    await db.insert(messages).values([
      { sessionId: s.id, seq: 0, role: "user", content: [{ type: "text", text: `Topic: ${percent.title} (Foundation Stage).\nTeaching Step: concept` }, { type: "text", text: "Show me." }] },
      { sessionId: s.id, seq: 1, role: "assistant", content: [{ type: "text", text: `Here it is.\n\n${fence}` }] },
    ]);
    await db.insert(sessionItems).values({ learnerId: me, sessionId: s.id, afterSeq: 1, kind: WIDGET_OPENED, data: { id: OLD_PERCENT_WIDGET.id, title: "One rate change, said three ways" } });
    await saveWidgetState(db, { sessionId: s.id, widgetKey: OLD_PERCENT_WIDGET.id, values: { $old: 6, $new: 6.4 }, ticked: [] }, me, now());

    // The Session's items and saved state still load.
    const items = await loadSessionItems(db, s.id, me);
    expect(items.map((i) => i.kind)).toEqual([WIDGET_OPENED]);
    expect((await loadWidgetStates(db, s.id, me))[OLD_PERCENT_WIDGET.id]).toEqual({ values: { $old: 6, $new: 6.4 }, ticked: [] });
    // Percent has no written-ahead Widget now, so the thread leaves the chip out instead of failing.
    const writtenAhead = await loadWrittenAhead(db, map, await loadProgress(db, me), PERCENT);
    expect(writtenAhead).toEqual([]);
    const thread: ThreadLine[] = [{ id: "i1", role: "item", kind: WIDGET_OPENED, data: items[0].data }];
    expect(widgetsIn(thread, false, writtenAhead)).toEqual([]);

    // A Widget saved to the Topic Note from that reply still draws from the stored reply's code.
    const saved = await saveToNotes(db, map, { kind: "widget", sessionId: s.id, turnSeq: 0, widgetIndex: 0, settings: { $old: 6, $new: 6.4 } }, now(), me);
    expect(saved).toMatchObject({ ok: true, topicId: PERCENT });
    const widgets = (await loadSaved(db, map, me)).get(PERCENT) ?? [];
    expect(widgets).toEqual([expect.objectContaining({ kind: "widget", title: "One rate change, said three ways", code: expect.stringContaining("$old = 6") })]);
  });
});
