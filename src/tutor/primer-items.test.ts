import { describe, expect, it } from "vitest";
import { PRIMER, type PrimerData } from "@/course/primers";
import { spineMap } from "@/course/spine-fixture";
import { OWNER_LEARNER_ID } from "@/db/schema";
import { ensureTopicStarted, saveFinishedStep } from "@/learner/memory";
import { skillStates } from "@/learner/skill-state";
import { testDb } from "@/test/pglite";
import { answerQuickTry, enterStepItems } from "./practice";
import { passPrimer } from "./primer-items";
import { CONCEPT_CARD, QUICK_TRY, QUICK_TRY_RESULT, type QuickTryResultData } from "./session-item-kinds";
import { loadSessionItems } from "./session-items";
import { sessionForTurn } from "./session-log";

// Primers in a Session (spec 2026-11-12, C3), on the Spine fixture: its Primer sits at the concept step, so code stores
// it when the Learner reaches that step, before the Concept card. Its Quick try is marked like any other, and "I know
// this" passes over it.

const map = spineMap();
const me = OWNER_LEARNER_ID;
const now = () => new Date();

/** The Learner at the fixture's concept step, in its Session. */
async function atConcept() {
  const db = await testDb();
  await ensureTopicStarted(db, map, now(), me);
  const session = await sessionForTurn(db, now(), me, "spine-01-worth");
  await saveFinishedStep(db, map, "story", now(), me);
  return { db, sessionId: session.id };
}

describe("a Primer shown where the Topic file places it", () => {
  it("is stored on entering its step, before the Concept card, and once per Session", async () => {
    const { db, sessionId } = await atConcept();
    const items = await enterStepItems(db, map, me, sessionId, now());
    expect(items.map((i) => i.kind)).toEqual([PRIMER, CONCEPT_CARD]);
    const primer = items[0].data as PrimerData;
    expect(primer.primer.title).toBe("What a margin keeps");
    expect(primer.key).toBe(`qt:${sessionId}:p:worth-primer-try`);
    expect(await enterStepItems(db, map, me, sessionId, now())).toEqual([]);
    expect((await loadSessionItems(db, sessionId, me)).filter((i) => i.kind === PRIMER)).toHaveLength(1);
  });

  it("is not stored at a step it does not name", async () => {
    const { db, sessionId } = await atConcept();
    await enterStepItems(db, map, me, sessionId, now());
    await saveFinishedStep(db, map, "concept", now(), me);
    expect((await enterStepItems(db, map, me, sessionId, now())).some((i) => i.kind === PRIMER)).toBe(false);
  });
});

describe("a Primer's Quick try", () => {
  it("is marked like any Quick try: a wrong tap shows its fix, with no next try and no move of the step", async () => {
    const { db, sessionId } = await atConcept();
    const [{ data }] = await enterStepItems(db, map, me, sessionId, now());
    const key = (data as PrimerData).key;
    const wrong = await answerQuickTry(db, map, me, key, "up", now());
    if (!wrong.ok) throw new Error(wrong.error);
    expect(wrong.followUp).toBe(false);
    expect(wrong.items.map((i) => i.kind)).toEqual([QUICK_TRY_RESULT]);
    expect(wrong.items[0].data as QuickTryResultData).toMatchObject({ key, verdict: "known_mistake", line: "Selling more is size. The margin is the share kept, which did not change.", choice: "up", answer: "same" });
    // Answered once per key; the Topic's own Quick tries are untouched.
    expect(await answerQuickTry(db, map, me, key, "same", now())).toEqual({ ok: true, items: [], followUp: false });
    expect((await loadSessionItems(db, sessionId, me)).some((i) => i.kind === QUICK_TRY)).toBe(false);
    expect(Object.keys(await skillStates(db, me, "spine-01-worth"))).toEqual(["levers"]);
  });

  it("marks the right tap Right.", async () => {
    const { db, sessionId } = await atConcept();
    const [{ data }] = await enterStepItems(db, map, me, sessionId, now());
    const right = await answerQuickTry(db, map, me, (data as PrimerData).key, "same", now());
    expect(right.ok && (right.items[0].data as QuickTryResultData)).toMatchObject({ verdict: "right", line: "Right." });
  });
});

describe("I know this", () => {
  it("marks the stored Primer passed over, so a reload draws it folded", async () => {
    const { db, sessionId } = await atConcept();
    const [{ data }] = await enterStepItems(db, map, me, sessionId, now());
    const key = (data as PrimerData).key;
    expect(await passPrimer(db, me, key)).toBe(true);
    const stored = (await loadSessionItems(db, sessionId, me)).find((i) => i.kind === PRIMER)!.data as PrimerData;
    expect(stored.primer.passed).toBe(true);
    expect(await passPrimer(db, me, key)).toBe(true);
    expect(await passPrimer(db, me, "qt:1:p:nothing")).toBe(false);
    expect(await passPrimer(db, me + 1, key)).toBe(false);
  });
});
