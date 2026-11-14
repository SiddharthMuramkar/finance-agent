import { describe, expect, it } from "vitest";
import { PERSONA_TURNS } from "./beginner-persona";
import { draftOf, E2E_SCRIPTS } from "./e2e-tutor";

/**
 * #531: the Beginner persona gate is scored on the 10-turn scripted transcript (spec 2026-11-05, §6.2). The F1 run found it
 * repeating canned scripts word for word (concept-reply-widget x3, plain-reply x3, stage-reply-2 x2), so a persona who asked
 * about her dad's 25 bps cut got the 4%-to-5% rise again. These tests fail if any turn shares a script, a reply or a Widget.
 */
describe("the Beginner persona's 10-turn scripted transcript", () => {
  it("has ten turns, the first from the seed and none after it", () => {
    expect(PERSONA_TURNS).toHaveLength(10);
    expect(PERSONA_TURNS.map((t) => t.how === "seed")).toEqual([true, ...Array<boolean>(9).fill(false)]);
  });

  it("plays a different script on every turn", () => {
    const names = PERSONA_TURNS.map((t) => t.script);
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
  });

  it("never repeats a reply word for word, and each reply answers what the persona asked", () => {
    const texts = PERSONA_TURNS.map((t) => draftOf(t.script).text);
    expect(texts.filter((x, i) => texts.indexOf(x) !== i)).toEqual([]);
    for (const turn of PERSONA_TURNS) {
      expect({ learner: turn.learner, carries: draftOf(turn.script).text.includes(turn.answers) }).toEqual({ learner: turn.learner, carries: true });
    }
  });

  it("gives each Widget its own title, so a Session keeps one thumbnail for every turn that shows one", () => {
    const titles = PERSONA_TURNS.flatMap((t) => draftOf(t.script).widgets.map((w) => String((w.params as { title?: unknown }).title)));
    expect(titles.filter((x, i) => titles.indexOf(x) !== i)).toEqual([]);
    // The replies without a Widget of their own (plain-reply, persona-bps-short) get a Companion card from code.
    expect(PERSONA_TURNS.filter((t) => draftOf(t.script).widgets.length === 0).map((t) => t.script)).toEqual(["plain-reply", "persona-bps-short"]);
  });

  it("uses only scripts that exist, each at the Concept step the transcript plays at", () => {
    for (const turn of PERSONA_TURNS) expect(E2E_SCRIPTS[turn.script].step, turn.script).toBe("concept");
  });
});
