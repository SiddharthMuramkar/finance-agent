import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { CONVERTED_TOPIC_DATA, topicFileOf } from "@/course/lesson-fixture";
import { parseCourseMap, type CourseMap } from "@/course/map";
import { navigate } from "@/course/navigator";
import { OWNER_LEARNER_ID, topicProgress } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadProgress } from "@/learner/memory";
import { openQuiz } from "@/learner/quiz";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { CONCEPT_CARD, QUICK_TRY } from "./session-item-kinds";
import { START_AGAIN_REFUSAL } from "./tools";
import { runTutorTurn, type TurnEvent } from "./turn";
import { withoutChoices } from "@/test/choices";

// The Companion Widget code adds to a reply with none (E4a) is off here: this file tests other behaviour, and
// src/tutor/companion-turn.test.ts tests the companion.
vi.mock("./companion", () => ({ pickCompanion: () => null }));

/** Seam: the Tutor Turn with the start_again tool (spec #229, ticket #245). */

const me = OWNER_LEARNER_ID;

function mapOf(data: object): CourseMap {
  const { map, errors } = parseCourseMap([topicFileOf(data)]);
  if (!map) throw new Error(errors.join("\n"));
  return map;
}

/** A Topic with no Skills: not converted. */
const { skills: _s, templates: _t, checks, ...rest } = CONVERTED_TOPIC_DATA;
void [_s, _t];
const UNCONVERTED = {
  ...rest,
  checks: [{ id: "plain-check", kind: "quiz", questions: ["pct-demo-headline"], passRule: { correct: 1 } }],
  questions: rest.questions.map((q) => ({ ...q, skill: undefined, choices: q.choices.map((c) => ({ id: c.id, text: c.text })) })),
};
void checks;

async function turn(db: Db, map: CourseMap, text: string, toolCall = false) {
  const replies = toolCall
    ? [
        { content: [{ type: "tool_use", id: `start-${Math.random()}`, name: "start_again", input: {} }], stop_reason: "tool_use" },
        { content: [{ type: "text", text: "Here is the first card again.\n\nReady for the first try?" }] },
      ]
    : [{ content: [{ type: "text", text: "Hello.\n\nReady?" }] }];
  const { client, requests } = scriptedClient(replies);
  const events: TurnEvent[] = [];
  for await (const e of runTutorTurn({ db, client, map, learnerId: me }, text)) events.push(e);
  return { events, requests, items: withoutChoices(events).flatMap((e) => (e.type === "item" ? [e.item] : [])) };
}

const toolResults = (requests: { messages: unknown }[]) => JSON.stringify(requests[requests.length - 1].messages);

describe("start_again", () => {
  it("re-posts the Concept cards in order, then the first Quick try, and keeps the step and the open quiz attempt", async () => {
    const db = await testDb();
    const map = mapOf(CONVERTED_TOPIC_DATA);
    await turn(db, map, "Hi");
    await db.update(topicProgress).set({ step: "check" }).where(and(eq(topicProgress.learnerId, me), eq(topicProgress.topicId, "pct-demo")));
    const quiz = (await openQuiz(db, map, new Date(), me))!;
    const { items } = await turn(db, map, "I am lost, can we start over?", true);
    expect(items.filter((i) => i.kind === CONCEPT_CARD).map((i) => i.data.title)).toEqual(["One move, two ways", "Compared with the start", "How the Fed said it"]);
    expect(items[items.length - 1].kind).toBe(QUICK_TRY);
    expect(items[items.length - 1].data).toMatchObject({ checkId: "pct-demo-check-1", halfDone: expect.any(String) });
    expect(navigate(map, await loadProgress(db, me))).toMatchObject({ step: "check", check: { id: "pct-demo-check-1" } });
    expect((await openQuiz(db, map, new Date(), me))?.attemptId).toBe(quiz.attemptId);
  });

  it("has the Tutor teach the first card's idea in its own words, never just point to the cards (ticket #248, T2)", async () => {
    const db = await testDb();
    const map = mapOf(CONVERTED_TOPIC_DATA);
    await turn(db, map, "Hi");
    const { requests } = await turn(db, map, "can I see the lesson again?", true);
    const result = toolResults(requests);
    expect(result).toContain("In your reply, teach the first card's idea in your own plain words, with one worked example, then one ask.");
    expect(result).not.toContain("points to the first card");
  });

  it("is refused in a Topic not yet converted", async () => {
    const db = await testDb();
    const map = mapOf(UNCONVERTED);
    await turn(db, map, "Hi");
    const { items, requests } = await turn(db, map, "start over please", true);
    expect(items.some((i) => i.kind === CONCEPT_CARD)).toBe(false);
    expect(toolResults(requests)).toContain(START_AGAIN_REFUSAL);
  });
});
