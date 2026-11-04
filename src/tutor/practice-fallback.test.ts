import { describe, expect, it } from "vitest";
import { CONVERTED_TOPIC_DATA, topicFileOf } from "@/course/lesson-fixture";
import { parseCourseMap, type CourseMap } from "@/course/map";
import { navigate } from "@/course/navigator";
import { OWNER_LEARNER_ID } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadProgress, saveFinishedStep } from "@/learner/memory";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { cardFallback } from "./reply-fallback";
import { runTutorTurn, type TurnInput } from "./turn";

/** The checked replies' card fallback (spec #229, ticket #243): the card's write-down line, then the next Quick try. */

const map = parseCourseMap([topicFileOf(CONVERTED_TOPIC_DATA)]).map as CourseMap;
const me = OWNER_LEARNER_ID;

async function turn(db: Db, input: TurnInput) {
  const { client } = scriptedClient([{ content: [{ type: "text", text: "In 1994 the Fed held its rate at 3%." }] }]);
  for await (const e of runTutorTurn({ db, client, map, learnerId: me }, input)) void e;
}

const placeOf = async (db: Db) => navigate(map, await loadProgress(db, me));

describe("cardFallback", () => {
  it("gives the card's write-down line at a converted Concept step, with no items", async () => {
    const db = await testDb();
    await turn(db, "Hi");
    await saveFinishedStep(db, map, "story", new Date(), me);
    const shown = await cardFallback(db, map, me, await placeOf(db));
    expect(shown).toEqual({ text: "Points times 100 give basis points. Basis points divided by 100 give points.", items: [] });
  });

  it("at Your turn adds no Quick try while one is open, so nothing is stored twice", async () => {
    const db = await testDb();
    await turn(db, "Hi");
    await saveFinishedStep(db, map, "story", new Date(), me);
    await saveFinishedStep(db, map, "concept", new Date(), me);
    // The turn's start posts the first try.
    await turn(db, "Ready.");
    const shown = await cardFallback(db, map, me, await placeOf(db));
    expect(shown?.text).toContain("Points times 100");
    expect(shown?.items).toEqual([]);
  });

  it("is null with no place", async () => {
    const db = await testDb();
    expect(await cardFallback(db, map, me, null)).toBeNull();
  });
});
