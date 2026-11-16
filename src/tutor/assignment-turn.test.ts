import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { loadCourseMap } from "@/course/map";
import { OWNER_LEARNER_ID, sessions, settings, topicProgress, turns } from "@/db/schema";
import type { Db } from "@/db/types";
import { openingEstimate, type OwnCaseInputs } from "@/finance/own-case";
import { saveOwnCase } from "@/learner/own-cases";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { ASSIGNMENT_SESSION_TOPIC, assignmentContext, runAssignmentTurn } from "./assignment-turn";
import { CAP_MESSAGES, dailyUse } from "./quota";
import { readSettings } from "./session-log";

// The AI Tutor in the Assignment (spec #68, ticket #110), at the Tutor Turn seam with the scripted model client: the
// Assignment's Session, its daily caps, its context (the Own Case's inputs and flags) and its reply checks (V9, V10).

const map = loadCourseMap();
const NOW = new Date("2026-11-16T10:00:00Z");

/** A food company typed with an operating margin of 45%: far above Food Processing's usual range, so the range check flags it. */
const WIDE_MARGIN: OwnCaseInputs = {
  company: "Tata Consumer Products",
  market: "IN",
  reportDate: "2025-03-31",
  industry: "food",
  sales: 10_000,
  operatingProfit: 4_500,
  taxPercent: 25,
  debt: 3_300,
  cash: 2_900,
  shares: 989_434_000,
  price: 1_090,
};

const text = (t: string) => ({ content: [{ type: "text", text: t }] });
const NAMES_MARGIN = "Your operating margin of 45% is far above Food Processing's usual range in India.\nWhat story about the company does a 45% margin assume?";

async function readyLearner(db: Db, inputs: OwnCaseInputs = WIDE_MARGIN) {
  for (const t of map.topics.filter((t) => t.stage === "spine")) await db.insert(topicProgress).values({ learnerId: OWNER_LEARNER_ID, topicId: t.id, step: "principle", status: "passed" });
  const saved = await saveOwnCase(db, map, OWNER_LEARNER_ID, inputs, openingEstimate("food"), NOW);
  expect(saved.ok).toBe(true);
}

async function cap(db: Db, key: string, value: string) {
  await readSettings(db);
  await db.update(settings).set({ value }).where(eq(settings.key, key));
}

const deps = (db: Db, client: ReturnType<typeof scriptedClient>["client"]) => ({ db, client, learnerId: OWNER_LEARNER_ID, map, now: () => NOW });

describe("the AI Tutor in the Assignment", () => {
  it("is open only once the Spine is passed", async () => {
    const db = await testDb();
    const { client, requests } = scriptedClient([text(NAMES_MARGIN)]);
    const result = await runAssignmentTurn(deps(db, client), "What do you make of my figures?");
    expect(result).toEqual({ ok: false, status: 403, error: "The Assignment opens once you pass the Spine." });
    expect(requests).toHaveLength(0);
  });

  it("runs in the Assignment's own Session, and its Turn counts against the daily caps", async () => {
    const db = await testDb();
    await readyLearner(db);
    await cap(db, "turns_per_learner_day", "1");
    const { client, requests } = scriptedClient([text(NAMES_MARGIN), text(NAMES_MARGIN)]);

    const first = await runAssignmentTurn(deps(db, client), "What do you make of my figures?");
    expect(first).toMatchObject({ ok: true, reply: NAMES_MARGIN });
    const [session] = await db.select().from(sessions).where(eq(sessions.learnerId, OWNER_LEARNER_ID));
    expect(session.topicId).toBe(ASSIGNMENT_SESSION_TOPIC);
    const [turn] = await db.select().from(turns).where(eq(turns.learnerId, OWNER_LEARNER_ID));
    expect(turn).toMatchObject({ sessionId: session.id, status: "finished" });
    expect((await dailyUse(db, OWNER_LEARNER_ID, NOW)).learnerTurns).toBe(1);

    const second = await runAssignmentTurn(deps(db, client), "And the tax rate?");
    expect(second).toEqual({ ok: false, status: 429, error: CAP_MESSAGES.learner_turns });
    expect(requests).toHaveLength(1);
  });

  it("tells the Tutor the Own Case's inputs and each flag, and its reply names the flagged input", async () => {
    const db = await testDb();
    await readyLearner(db);
    const { client, requests } = scriptedClient([text(NAMES_MARGIN)]);
    const result = await runAssignmentTurn(deps(db, client), "What do you make of my figures?");
    expect(result).toMatchObject({ ok: true, reply: expect.stringMatching(/operating margin/i) });
    const sent = JSON.stringify(requests[0].messages);
    expect(sent).toContain("Tata Consumer Products");
    expect(sent).toContain("Your operating margin of 45% is far above Food Processing");
    expect(sent).toContain("What do you make of my figures?");
  });

  it("refuses a reply with a verdict word: the retry is told why, and its clean reply is shown", async () => {
    const db = await testDb();
    await readyLearner(db);
    const verdict = "Your operating margin of 45% makes the shares look undervalued.\nWhat story does it assume?";
    const { client, requests } = scriptedClient([text(verdict), text(NAMES_MARGIN)]);
    const result = await runAssignmentTurn(deps(db, client), "Is it a buy?");
    expect(result).toMatchObject({ ok: true, reply: NAMES_MARGIN, failed: ["V9"] });
    expect(JSON.stringify(requests[1].messages)).toContain("undervalued");
  });

  it("falls back to code's own line naming the flagged input when the retry breaks a check too", async () => {
    const db = await testDb();
    await readyLearner(db);
    const { client } = scriptedClient([text("Looks cheap to me.\nWill you buy?"), text("Your figures are in.\nWhat do they tell you?")]);
    const result = await runAssignmentTurn(deps(db, client), "Is it a buy?");
    expect(result).toMatchObject({ ok: true, fallback: true });
    if (!result.ok) return;
    expect(result.reply).toMatch(/operating margin/i);
    expect(result.reply).toMatch(/what story/i);
    expect(result.reply).not.toMatch(/cheap|buy/i);
  });
});

describe("assignmentContext", () => {
  it("lists the Own Case's figures and asks the Tutor to name each flagged input without a verdict", () => {
    const lines = assignmentContext({
      note: "Tata Consumer Products, India. Annual report of 31 Mar 2025.",
      flags: [{ name: "operating margin", sentence: "Your operating margin of 45% is far above Food Processing's usual 3.63% to 14.52% in India." }],
    });
    expect(lines).toContain("Tata Consumer Products, India.");
    expect(lines).toContain("Your operating margin of 45% is far above");
    expect(lines).toMatch(/name each flagged input/i);
    expect(lines).toMatch(/what story it assumes/i);
  });

  it("says when no Own Case is saved yet", () => {
    expect(assignmentContext(null)).toMatch(/no Own Case saved yet/i);
  });
});
