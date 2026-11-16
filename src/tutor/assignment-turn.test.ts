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
import { TUTOR_MODEL } from "./model";
import { CAP_MESSAGES, dailyUse } from "./quota";
import { readSettings } from "./session-log";

// The AI Tutor in the Assignment (spec #68, ticket #110), at the Tutor Turn seam with the scripted model client: the
// Assignment's Session, its daily caps, its context (the Own Case's inputs and flags) and its reply checks (V9, V10).

const map = loadCourseMap();
const NOW = new Date("2026-11-16T10:00:00Z");

/** A food company typed with an operating margin of 45%: more than double Food Processing's 7.26%, so the range check flags it. */
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
const NAMES_MARGIN = "Your operating margin of 45% is far above Food Processing's 7.26% in India (Jan 2026).\nWhat story about the company does a 45% margin assume?";

async function readyLearner(db: Db, inputs: OwnCaseInputs = WIDE_MARGIN) {
  for (const t of map.topics.filter((t) => t.stage === "spine")) await db.insert(topicProgress).values({ learnerId: OWNER_LEARNER_ID, topicId: t.id, step: "principle", status: "passed" });
  const saved = await saveOwnCase(db, map, OWNER_LEARNER_ID, inputs, openingEstimate(inputs.industry, inputs.market), NOW);
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

// ADR 0007 (review G06): the Assignment's Session is kept current as the Study Tutor's is (turn.ts). After a TUTOR_MODEL
// change its Session is closed and a fresh one made, so the turn never calls a model that is gone; after a deploy that
// changed the instructions, they are refrozen in the same Session.
describe("the Assignment's Session after a model or instructions change", () => {
  const sessionsOf = (db: Db) => db.select().from(sessions).where(eq(sessions.learnerId, OWNER_LEARNER_ID)).orderBy(sessions.id);
  const sent = (r: { messages: unknown }) => JSON.stringify(r.messages);

  it("closes a Session frozen for an older model and runs the turn in a fresh one on TUTOR_MODEL", async () => {
    const db = await testDb();
    await readyLearner(db);
    const { client, requests } = scriptedClient([text("Picture the old margin.\nWhat story does your operating margin assume?"), text(NAMES_MARGIN)]);
    await runAssignmentTurn(deps(db, client), "What do you make of my figures?");
    const [first] = await sessionsOf(db);
    // As if TUTOR_MODEL changed after this Session was frozen.
    await db.update(sessions).set({ model: "gpt-6-sol" }).where(eq(sessions.id, first.id));

    const result = await runAssignmentTurn(deps(db, client), "And now?");
    expect(result).toMatchObject({ ok: true, reply: NAMES_MARGIN });
    expect(requests[1].model).toBe(TUTOR_MODEL);
    expect(sent(requests[1])).not.toContain("Picture the old margin.");
    const [old, fresh] = await sessionsOf(db);
    expect(old).toMatchObject({ id: first.id, older: true, model: "gpt-6-sol", topicId: ASSIGNMENT_SESSION_TOPIC });
    expect(fresh).toMatchObject({ older: false, model: TUTOR_MODEL, topicId: ASSIGNMENT_SESSION_TOPIC });
    if (result.ok) expect(result.sessionId).toBe(fresh.id);
  });

  it("refreezes changed instructions in the same Session, which keeps its history", async () => {
    const db = await testDb();
    await readyLearner(db);
    const { client, requests } = scriptedClient([text("Picture the first reply.\nWhat story does your operating margin assume?"), text(NAMES_MARGIN)]);
    await runAssignmentTurn(deps(db, client), "What do you make of my figures?");
    const [first] = await sessionsOf(db);
    const current = { instructions: first.instructions, fingerprint: first.fingerprint };
    // As if a deploy changed the instructions after this Session was frozen.
    await db.update(sessions).set({ fingerprint: "an-earlier-build", instructions: "Old instructions." }).where(eq(sessions.id, first.id));

    await runAssignmentTurn(deps(db, client), "And now?");
    expect(requests[1].instructions).toBe(current.instructions);
    expect(sent(requests[1])).toContain("Picture the first reply.");
    const all = await sessionsOf(db);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: first.id, older: false, fingerprint: current.fingerprint });
    expect(all[0].refrozenAtSeq).toBeGreaterThan(0);
  });
});

describe("the AI Tutor on a US Own Case (#113)", () => {
  it("lets the Tutor write dollars, the Own Case's currency, and names the input flagged against the US yardsticks", async () => {
    const db = await testDb();
    const apple: OwnCaseInputs = { company: "Apple Inc.", market: "US", reportDate: "2025-09-27", industry: "market", sales: 416_161, operatingProfit: 133_050, taxPercent: 25, debt: 112_377, cash: 35_934, shares: 14_776_353_000, price: 255.46 };
    await readyLearner(db, apple);
    const reply = "Your operating margin of 31.97% on $416,161 million of sales is far above the US usual range.\nWhat story about Apple does that margin assume?";
    const { client, requests } = scriptedClient([text(reply)]);
    const result = await runAssignmentTurn(deps(db, client), "What do you make of my figures?");
    expect(result).toMatchObject({ ok: true, reply, failed: [] });
    expect(JSON.stringify(requests[0].messages)).toContain("in the US (Jan 2026)");
  });
});

// G19: the reply checks take the Own Case's currency, so a Japanese Own Case's reply may write yen and not rupees.
describe("the AI Tutor on a Japanese Own Case (#114)", () => {
  /** Kikkoman's figures (own-cases-japan-korea.test.ts) with its operating profit typed as 45% of sales, so the margin is flagged. */
  const WIDE_KIKKOMAN: OwnCaseInputs = { company: "Kikkoman", market: "JP", reportDate: "2026-03-31", industry: "food", sales: 745_539, operatingProfit: 335_493, taxPercent: 30.5, debt: 18_217, cash: 111_770, shares: 927_741_900, price: 1_435 };

  it("lets the Tutor write yen, refuses rupees, and is told to write yen", async () => {
    const db = await testDb();
    await readyLearner(db, WIDE_KIKKOMAN);
    const yen = "Your operating margin of 45% on ¥745,539 million of sales is far above the food industry's figure in Japan.\nWhat story about Kikkoman does that margin assume?";
    const rupees = "Your operating margin of 45% on ₹745,539 million of sales is far above the food industry's figure.\nWhat story about Kikkoman does that margin assume?";
    const { client, requests } = scriptedClient([text(rupees), text(yen)]);
    const result = await runAssignmentTurn(deps(db, client), "What do you make of my figures?");
    expect(result).toMatchObject({ ok: true, reply: yen, failed: ["V7"], fallback: false });
    expect(JSON.stringify(requests[0].messages)).toContain("Write any amount in yen (¥)");
    expect(JSON.stringify(requests[1].messages)).toContain("use yen (¥)");
  });
});

describe("assignmentContext", () => {
  it("lists the Own Case's figures and asks the Tutor to name each flagged input without a verdict", () => {
    const lines = assignmentContext({
      note: "Tata Consumer Products, India. Annual report of 31 Mar 2025.",
      flags: [{ name: "operating margin", sentence: "Your operating margin of 45% is far above Food Processing's 7.26% in India (Jan 2026): more than double it." }],
      currency: "INR",
    });
    expect(lines).toContain("Tata Consumer Products, India.");
    expect(lines).toContain("Your operating margin of 45% is far above");
    expect(lines).toMatch(/name each flagged input/i);
    expect(lines).toMatch(/what story it assumes/i);
    expect(lines).toContain("Write any amount in rupees (₹), the Own Case's currency.");
  });

  // The source prints one dated average per industry, not a range (range-check.ts): the context never calls the
  // course's half-to-double band the industry's "usual range" (round-1 deferral of F08/F09).
  it("words the range check as the flag sentences do: the industry's dated figure, not a usual range", () => {
    const flagged = assignmentContext({ note: "Kikkoman, Japan.", flags: [{ name: "operating margin", sentence: "Your operating margin of 60% is far above x." }], currency: "JPY" });
    const clean = assignmentContext({ note: "Kikkoman, Japan.", flags: [], currency: "JPY" });
    for (const lines of [flagged, clean]) {
      expect(lines).not.toMatch(/usual range/i);
      expect(lines).toMatch(/industry's dated figure/);
      expect(lines).toContain("Write any amount in yen (¥), the Own Case's currency.");
    }
  });

  it("says when no Own Case is saved yet", () => {
    expect(assignmentContext(null)).toMatch(/no Own Case saved yet/i);
  });
});
