import { describe, expect, it } from "vitest";
import { CONVERTED_TOPIC_DATA, topicFileOf } from "@/course/lesson-fixture";
import { parseCourseMap, type CourseMap } from "@/course/map";
import { OWNER_LEARNER_ID } from "@/db/schema";
import type { Db } from "@/db/types";
import { saveFinishedStep } from "@/learner/memory";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { answerQuickTry, enterStepItems } from "./practice";
import { QUICK_TRY, type QuickTryData } from "./session-item-kinds";
import { loadSessionItems } from "./session-items";
import { runTutorTurn, type TurnInput } from "./turn";

/** Seam: the Tutor Turn's context (ticket #245). The frustration count reaches the Tutor, and resets as the spec says. */

const { map: parsed } = parseCourseMap([topicFileOf(CONVERTED_TOPIC_DATA)]);
const map = parsed as CourseMap;
const me = OWNER_LEARNER_ID;
const now = () => new Date();

/** Runs a turn and returns the Navigator context it sent last (the latest message that carries one). */
async function contextOf(db: Db, input: TurnInput): Promise<{ context: string; sessionId: number }> {
  const { client, requests } = scriptedClient([{ content: [{ type: "text", text: "Fair enough. One small step.\n\nReady?" }] }]);
  let sessionId = 0;
  for await (const e of runTutorTurn({ db, client, map, learnerId: me }, input)) if (e.type === "done") sessionId = e.ref.sessionId;
  const texts = requests[0].messages.map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)));
  return { context: texts.findLast((t) => t.includes("Course Navigator")) ?? "", sessionId };
}

describe("frustration in the context", () => {
  it("tells the Tutor the count, and stops once the phrase is more than three messages back", async () => {
    const db = await testDb();
    expect((await contextOf(db, "Hi")).context).not.toContain("Frustration:");
    expect((await contextOf(db, "this is too complicated")).context).toContain("Frustration: 1. Acknowledge it in eight words or fewer");
    for (const text of ["ok", "and then?", "go on"]) await contextOf(db, text);
    expect((await contextOf(db, "sure")).context).not.toContain("Frustration:");
  });

  it("resets on a right code-marked answer", async () => {
    const db = await testDb();
    const { sessionId } = await contextOf(db, "Hi");
    for (const step of ["story", "concept"] as const) await saveFinishedStep(db, map, step, now(), me);
    expect((await contextOf(db, "I don't know any of this")).context).toContain("Frustration: 1.");
    // The turn at Your turn showed the first try when it started.
    await enterStepItems(db, map, me, sessionId, now());
    const t = (await loadSessionItems(db, sessionId, me)).findLast((i) => i.kind === QUICK_TRY)?.data as QuickTryData | undefined;
    // The open try's first step is shown done, so its answer is in its half-done line: "the move is N points".
    const points = Number(t?.halfDone?.match(/([\d.]+) points/)?.[1]);
    expect(await answerQuickTry(db, map, me, t!.key, String(Math.round(points * 100)), now())).toMatchObject({ ok: true });
    expect((await contextOf(db, "ok")).context).not.toContain("Frustration:");
  });
});
