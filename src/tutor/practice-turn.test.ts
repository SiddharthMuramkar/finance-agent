import { describe, expect, it } from "vitest";
import { OWNER_LEARNER_ID } from "@/db/schema";
import type { Db } from "@/db/types";
import { saveFinishedStep } from "@/learner/memory";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { WIDGET_SHOWN } from "@/widgets/shown-widget";
import { answerQuickTry, enterStepItems } from "./practice";
import { plainWrongMap, PLAIN_WRONG } from "@/test/plain-wrong-map";
import { CONCEPT_CARD, QUICK_TRY, STEP_DIVIDER, type QuickTryData } from "./session-item-kinds";
import { loadSessionItems } from "./session-items";
import { NO_QUICK_TRY_FOLLOW_UP, runTutorTurn, type TurnEvent, type TurnInput } from "./turn";

/**
 * Seam 1, Tutor Turn, in a converted Topic (spec #229, ticket #243): code shows the Concept card, its Widget and the
 * Quick tries; the Tutor hears the card's text and the marked tries, and never writes practice of its own.
 */

const map = plainWrongMap();
const me = OWNER_LEARNER_ID;

async function turn(db: Db, input: TurnInput, text = "Okay.") {
  const { client, requests } = scriptedClient([{ content: [{ type: "text", text }] }]);
  const events: TurnEvent[] = [];
  for await (const e of runTutorTurn({ db, client, map, learnerId: me }, input)) events.push(e);
  return { events, requests, sent: requests.map((r) => JSON.stringify(r.messages)).join("\n") };
}

const itemKinds = (events: TurnEvent[]) => events.flatMap((e) => (e.type === "item" ? [e.item.kind] : []));

describe("a converted Concept step", () => {
  it("Next shows the card and its Widget with no model call, and the Tutor is told to add one sentence and one ask", async () => {
    const db = await testDb();
    await turn(db, "Hi", "In 1994 the Fed held its rate at 3%.");
    const { events, sent } = await turn(db, { next: "concept" }, "Points and basis points say one move two ways. Which is bigger?");
    expect(itemKinds(events)).toEqual([STEP_DIVIDER, CONCEPT_CARD, WIDGET_SHOWN]);
    expect(sent).toContain("Concept card on screen (code showed it; never write your own version): \\\"One move, two ways\\\": A savings rate goes from 4% to 5%.");
    expect(sent).toContain("Add one sentence and one ask");
    expect(sent).not.toContain("teach it now");
    expect(sent).not.toContain("Concept: Points, basis points and percent change.");
  });
});

describe("a converted Your turn", () => {
  async function atYourTurn(db: Db) {
    await turn(db, "Hi", "In 1994 the Fed held its rate at 3%.");
    await saveFinishedStep(db, map, "story", new Date(), me);
    await saveFinishedStep(db, map, "concept", new Date(), me);
    const { events } = await turn(db, "Ready.");
    const shown = events.flatMap((e) => (e.type === "item" && e.item.kind === QUICK_TRY ? [e.item.data as QuickTryData] : []));
    return shown[0];
  }

  it("shows the first Quick try at the turn's start, and tells the Tutor it writes no practice and cannot finish the step", async () => {
    const db = await testDb();
    await turn(db, "Hi", "In 1994 the Fed held its rate at 3%.");
    await saveFinishedStep(db, map, "story", new Date(), me);
    await saveFinishedStep(db, map, "concept", new Date(), me);
    const { events, sent } = await turn(db, "Ready.");
    expect(itemKinds(events)).toEqual([QUICK_TRY]);
    expect(sent).toContain("Write no practice questions of your own");
    expect(sent).toContain("Do not call finish_teaching_step for your_turn");
  });

  it("passes the results marked since the last reply into the next turn", async () => {
    const db = await testDb();
    const first = await atYourTurn(db);
    await answerQuickTry(db, map, me, first.key, PLAIN_WRONG, new Date());
    const { sent } = await turn(db, "Hmm.");
    expect(sent).toContain("Quick try results since your last reply");
    expect(sent).toContain('The Learner gave \\"Up 1\\": not right; the answer is');
    // Told once: the turn after has nothing new.
    expect((await turn(db, "Okay.")).sent.match(/Quick try results since your last reply/g)).toHaveLength(1);
  });

  it("follows a wrong answer with a short code-started turn that names the slip, then posts a fresh try", async () => {
    const db = await testDb();
    const first = await atYourTurn(db);
    await answerQuickTry(db, map, me, first.key, PLAIN_WRONG, new Date());
    const { events, sent } = await turn(db, { quickTryFollowUp: true }, "You typed the rates, not the move. Take the old rate from the new one first.");
    expect(sent).toContain("Quick try follow-up by code:");
    expect(sent).toContain("Name the slip in one sentence");
    // The fresh try comes after the reply's text.
    const lastText = events.findLastIndex((e) => e.type === "text");
    const tryAt = events.findIndex((e) => e.type === "item" && e.item.kind === QUICK_TRY);
    expect(tryAt).toBeGreaterThan(lastText);
    expect((await turn(db, { quickTryFollowUp: true })).events).toEqual([{ type: "not_allowed", message: NO_QUICK_TRY_FOLLOW_UP }]);
  });

  it("keeps the same items and the same open try on a reload", async () => {
    const db = await testDb();
    const first = await atYourTurn(db);
    const [{ sessionId }] = await db.query.sessions.findMany({ columns: { id: true } }).then((rows) => rows.map((r) => ({ sessionId: r.id })));
    const before = await loadSessionItems(db, sessionId, me);
    expect(await enterStepItems(db, map, me, sessionId, new Date())).toEqual([]);
    expect(await loadSessionItems(db, sessionId, me)).toEqual(before);
    expect(before.filter((i) => i.kind === QUICK_TRY).map((i) => i.data)).toEqual([first]);
  });
});
