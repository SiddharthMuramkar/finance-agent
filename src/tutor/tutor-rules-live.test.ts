import { describe, expect, it } from "vitest";
import { ENGINE_INSTRUCTIONS, ENGINE_TOOLS, TUTOR_EXAMPLES, TUTOR_INSTRUCTIONS, TUTOR_TOOLS } from "./instructions";

/**
 * The rules tuned against the live Tutor tests (ticket #248, lane R11). The suite grades the model's first draft, so
 * the rules themselves carry each case's target: a Widget's ask (T1), starting from the beginning (T2), a miss (T3),
 * simpler (T4), a quiz-me ask (T5), the own rule (T6) and a request for the answer (T11).
 */

describe("the rules tuned against the live tests", () => {
  for (const [name, text] of [
    ["widget engine off", TUTOR_INSTRUCTIONS],
    ["widget engine on", ENGINE_INSTRUCTIONS],
  ] as const) {
    describe(name, () => {
      it("an ask is about the words, the people in the story and the right choice, never a number to work out (D3b)", () => {
        expect(text).toContain("Ask what the words mean, what people in the story did or would do, and which choice is right; never ask the Learner to work out a number.");
        expect(text).not.toContain("Never ask what a bond trader");
      });

      it("everyday finance words get a few plain words too, such as what a savings rate is", () => {
        expect(text).toContain('Define each new term in plain words the first time it appears, everyday finance words too ("a savings rate, the interest a bank pays on savings").');
      });

      it("a simpler reply's ask uses only what that reply says", () => {
        expect(text).toContain("Its ask uses only what the simpler reply itself says: no number or word it left out.");
      });

      it("asked to start from the beginning, the Tutor teaches the first idea in words, without start_again", () => {
        expect(text).toContain('"Start from the beginning" gets the first idea only, taught in words in this reply with one worked example and one ask; do not call start_again for it.');
      });

      it("after a miss: the slip in one sentence, even after code's fix, then one similar item on new numbers whose blank last step is the ask", () => {
        expect(text).toContain("After a wrong answer, in 60 words or fewer: name the slip in one sentence");
        expect(text).toContain("even when code has already shown a fix; only a short acknowledgement may come before it.");
        expect(text).toContain("Then one similar item with new numbers");
        expect(text).toContain("The methods, in order, are restate the rule, a worked example, a half-done choice, the Widget and a choice drill.");
      });

      it("simpler means the first idea only, with nothing new, and an open question asked again rather than answered", () => {
        expect(text).toContain("Simpler means less: the first idea only");
        expect(text).toContain("no analogy, not even the Topic's, and no new example");
        expect(text).toContain("Do not answer a question you left open: ask it again in plainer words, on the running example's own numbers (never switch to new ones), and never give its answer, not even as the worked line");
      });

      it("a quiz-me ask gets one choice question in words, in 40 words or fewer, with nothing after it", () => {
        expect(text).toContain('"Ask me a question" gets one choice question in words, in 40 words or fewer, with nothing after it: not even "Type your answer in the Widget".');
      });

      it("the Learner's own rule is saved before any prose, then confirmed in one sentence with nothing before the ask", () => {
        expect(text).toContain("call save_learner_rule with their words before you write");
        expect(text).toContain(
          'confirm it in one sentence that gives their rule back and starts "Yes:", then the ask as one sentence with its numbers in it, with nothing between: no reason, no note on the order of steps and no definition.',
        );
      });

      it("asked for the answer to one open question, the Tutor teaches only the idea that question tests", () => {
        expect(text).toContain(
          "Asked for the answer to one question, teach only the idea that question tests (the Course Navigator message names it): never refuse flatly: one warm line of ten words or fewer saying the last tap is theirs (\"Happy to get you there; the last tap stays yours.\"; never a bare \"That one's yours to win\" or \"a nudge rather than the answer\"), then the rule and the very same move done in full on other numbers, ending in its result, so one tap is all that is left, in two short sentences with no definitions (its terms are taught); then one short line that hands the tap back (\"Now pick your answer to question 1.\"), not a new question, in 50 words or fewer in all.",
        );
      });
    });
  }

  it("with the engine, a quiz-me ask that also asks for a Widget gets the rate Widget in practice mode", () => {
    expect(ENGINE_INSTRUCTIONS).toContain("When the Learner also asks for a Widget and the idea is a rate move, show rate_move in practice mode on new numbers");
    expect(ENGINE_INSTRUCTIONS).toContain("it asks the Learner to pick the right reading, so write only a short acknowledgement and that one question, and stop there");
    expect(ENGINE_INSTRUCTIONS).toContain("For a quiz-me ask, point to the next Quick try only when this turn's context says code shows one now; otherwise show choice_cards with one story or lingo question;");
    // Runs 8 and the D3b finish runs: T5 asked "Which reading gives that move?" with no readings in the reply, and the grader said a beginner could not follow it.
    expect(ENGINE_INSTRUCTIONS).toContain('never write "which reading": the readings are on the card, so ask how a trader would say the move');
    expect(ENGINE_INSTRUCTIONS).not.toContain("own answer box");
    expect(TUTOR_INSTRUCTIONS).not.toContain("show rate_move in practice mode");
  });

  it("start_again is for seeing the lesson again: asked to explain from the beginning, the Tutor teaches in words", () => {
    for (const tools of [TUTOR_TOOLS, ENGINE_TOOLS]) {
      const tool = tools.find((t) => t.name === "start_again") as { description: string };
      expect(tool.description).toContain("when the Learner asks to see the lesson or the cards again");
      expect(tool.description).toContain("When the Learner asks you to explain from the beginning, or says they are lost, do not call it: teach the first idea yourself");
    }
  });

  it("save_learner_rule says when to call it, and leaves its conditions to code", () => {
    const tool = ENGINE_TOOLS.find((t) => t.name === "save_learner_rule") as { description: string };
    expect(tool.description).toContain("whenever they state a correct rule in their own words. Call it before you write your reply, and let code check the rest");
  });

  it("the repeat-miss example names the slip and leaves the last step to the half-done choice code posts (D3b)", () => {
    const halfDone = TUTOR_EXAMPLES.find((e) => e.replyKind === "reteach")!;
    expect(halfDone.situation).toContain("method a half-done choice");
    expect(halfDone.reply).not.toMatch(/Box/);
    expect(halfDone.reply.split("\n").at(-1)).toBe("The try below has its first step done: tap the way a trader would say it.");
  });

  it("the start-from-the-beginning example says what a savings rate is, inside its one worked example", () => {
    const start = TUTOR_EXAMPLES.find((e) => e.learner.includes("start from the beginning"))!;
    expect(start.reply).toContain("A savings rate, the interest a bank pays on savings, goes from 4% to 5%.");
  });

  it("the own-rule example shows the save call before the reply, and confirms in one sentence before its ask", () => {
    const own = TUTOR_EXAMPLES.find((e) => e.learner.startsWith("so its basically"))!;
    expect(own.situation).toContain("the reply first calls save_learner_rule with the Learner's words");
    expect(own.reply.split("\n")[0]).toBe("Yes: **change times 100, then divide by the original.**");
    expect(own.reply.split("\n").at(-1)).toBe("When a price goes from ₹50 to ₹60, which price is the original?");
  });

  it("the request-for-the-answer example names the idea the question tests, and teaches only that idea", () => {
    const hint = TUTOR_EXAMPLES.find((e) => e.replyKind === "hint")!;
    expect(hint.situation).toContain("question 1 tests the idea that basis points are points times 100");
    expect(hint.reply).not.toMatch(/minus/);
  });
});
