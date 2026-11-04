import { describe, expect, it } from "vitest";
import { ENGINE_INSTRUCTIONS, ENGINE_TOOLS, TUTOR_EXAMPLES, TUTOR_INSTRUCTIONS } from "./instructions";

/**
 * The rules tuned against the live Tutor tests (ticket #248, lane R11). The suite grades the model's first draft, so
 * the rules themselves carry each case's target: a miss (T3), simpler (T4), a quiz-me ask (T5), the own rule (T6).
 */

describe("the rules tuned against the live tests", () => {
  for (const [name, text] of [
    ["widget engine off", TUTOR_INSTRUCTIONS],
    ["widget engine on", ENGINE_INSTRUCTIONS],
  ] as const) {
    describe(name, () => {
      it("after a miss: the slip first, then one similar item on new numbers whose blank last step is the ask", () => {
        expect(text).toContain("After a wrong answer, in 60 words or fewer: the first sentence names the slip");
        expect(text).toContain("Then one similar item with new numbers");
        expect(text).toContain("Fill-in boxes leave the last box blank for the Learner: boxes you fill in are a worked example.");
        expect(text).toContain("The blank box is the reply's one ask, not a practice question of your own.");
      });

      it("simpler means the first idea only, with nothing new, and an open question asked again rather than answered", () => {
        expect(text).toContain("Simpler means less: the first idea only");
        expect(text).toContain("no analogy, not even the Topic's, and no new example");
        expect(text).toContain("Do not answer a question you left open: ask it again, in plainer words.");
      });

      it("a quiz-me ask gets one question in 40 words or fewer", () => {
        expect(text).toContain('"Ask me a question" gets one question, in 40 words or fewer.');
      });

      it("the Learner's own rule is saved before any prose, then confirmed in at most two sentences", () => {
        expect(text).toContain("call save_learner_rule with their words before you write");
        expect(text).toContain("confirm it in one sentence, at most one more sentence, then the ask");
      });
    });
  }

  it("with the engine, a quiz-me ask that also asks for a Widget gets the rate Widget in practice mode", () => {
    expect(ENGINE_INSTRUCTIONS).toContain("When the Learner also asks for a Widget and the idea is a rate move, show rate_move in practice mode on new numbers");
    expect(TUTOR_INSTRUCTIONS).not.toContain("show rate_move in practice mode");
  });

  it("save_learner_rule says when to call it, and leaves its conditions to code", () => {
    const tool = ENGINE_TOOLS.find((t) => t.name === "save_learner_rule") as { description: string };
    expect(tool.description).toContain("whenever they state a correct rule in their own words. Call it before you write your reply, and let code check the rest");
  });

  it("the repeat-miss example sets fill-in boxes on new numbers, with Box 2 left blank as its ask", () => {
    const boxes = TUTOR_EXAMPLES.find((e) => e.replyKind === "reteach")!;
    expect(boxes.reply).not.toContain("7.5%");
    expect(boxes.reply.split("\n").at(-1)).toBe("Box 2: 0.4 times 100 is how many basis points?");
  });

  it("the own-rule example shows the save call before the reply", () => {
    const own = TUTOR_EXAMPLES.find((e) => e.learner.startsWith("so its basically"))!;
    expect(own.situation).toContain("the reply first calls save_learner_rule with the Learner's words");
  });
});
