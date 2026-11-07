import { describe, expect, it } from "vitest";
import { loadCourseMap } from "@/course/map";
import { testDb } from "@/test/pglite";
import { checkTabNow } from "@/learner/quiz";
import { CASES_DIR, loadCases, type DialogueCase, type LiveCase } from "./case";
import { answerDrawnTry, pendingReason, prepareCase } from "./setup";

/**
 * Seam: setup on in-memory Postgres against the real Course Map, with no model call. Every live case must prepare
 * its state, so a content change (a Check, a question, a Skill) cannot break the live suite silently.
 */
const map = loadCourseMap();
const all = loadCases(CASES_DIR).cases;
const live = all.filter((c): c is LiveCase => c.kind === "live");
// A dialogue (T13) places its Learner the same way.
const placed = all.filter((c): c is LiveCase | DialogueCase => c.kind === "live" || c.kind === "dialogue");
const settings = { model: "claude-sonnet-5-5", effort: "low", widgetEngine: "off" as const };

describe("every live case prepares against today's Course Map", () => {
  it.each(placed.map((c) => [c.id, c] as const))(
    "%s",
    async (_id, c) => {
      expect(pendingReason(c, map), `${c.id} is not runnable`).toBeNull();
      const db = await testDb();
      const p = await prepareCase(db, c, { map, settings });
      expect(p.place.step).toBe(c.state.step);
      // A case whose message answers a Quick try shows the try and has code mark it, as the suite does before the Tutor's turn.
      if (c.kind === "live" && c.answer) expect(typeof (await answerDrawnTry(db, map, c, p))).toBe("boolean");
    },
    60_000,
  );

  it("T1, T2 and T11 open Percent's Check 1 on drawn choice questions", async () => {
    for (const id of ["T1", "T2", "T11"]) {
      const c = live.find((x) => x.id === id)!;
      const db = await testDb();
      const p = await prepareCase(db, c, { map, settings });
      expect(p.place.check?.id).toBe("pb-quiz-language");
      if (c.state.quiz?.state === "open") {
        expect(p.openItems).toHaveLength(3);
        // Every drawn question is served as choices, so the grader's note lists them.
        expect(p.stateNote).toMatch(/choices: [^;]+ \/ [^;]+; right answer, which the Tutor must keep back: /);
        expect(p.stateNote).not.toMatch(/choices: ;/);
        expect((await checkTabNow(db, map, new Date(), p.learnerId)).quiz?.questions).toHaveLength(3);
      } else expect(p.openItems).toEqual([]);
    }
  }, 60_000);
});
