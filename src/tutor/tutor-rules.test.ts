import { describe, expect, it } from "vitest";
import { ENGINE_INSTRUCTIONS, REPLY_WORD_LIMIT, TUTOR_EXAMPLES, TUTOR_INSTRUCTIONS } from "./instructions";
import { sumAsk } from "@/teaching/no-sums";
import { checkReply, fixReply, splitAsk, type ReplyCheckContext } from "./reply-checks";

/**
 * The Tutor's teaching rules (spec #229, ticket #238): written for a beginner, one idea and one ask, capped by step,
 * help while a quiz is open, and Appendix A's examples said in words. Both instruction sets share them.
 */

describe("the Tutor's rules", () => {
  for (const [name, text] of [
    ["widget engine off", TUTOR_INSTRUCTIONS],
    ["widget engine on", ENGINE_INSTRUCTIONS],
  ] as const) {
    describe(name, () => {
      it("write for a beginner, not an analyst course", () => {
        expect(text).toContain("Write for a beginner");
        expect(text).not.toContain("the way an analyst programme or MBA course would");
        expect(text).not.toContain("Keep the analyst-course depth");
      });

      it("name each step's cap, and say code's word-limit line rules", () => {
        expect(text).toContain("It is 80 words at the concept, your turn and Check steps, and 120 for a worked example, a Go deeper reply, and the story, explore, reveal and principle steps.");
        expect(text).toContain('("Word limit for this reply"), and that line rules');
        expect(text).not.toContain("at most about 120 words");
      });

      it("ask for one idea and one ask, the ask alone on the last line, and drop the offer of more", () => {
        expect(text).toContain("alone on the reply's last line");
        expect(text).toContain("never a list of tasks");
        expect(text).not.toMatch(/offer the rest/);
        expect(text).not.toMatch(/an Accordion for detail/);
      });

      it("name the third rung as code's half-done choice, with no question of the Tutor's own (D1a, ladder-moves.ts)", () => {
        expect(text).toContain("restate the rule, worked example, a half-done choice, Widget and drill");
        expect(text).toContain("At a half-done choice, code posts the half-done try after your reply: name the slip in one sentence and write no question of your own.");
        expect(text).not.toContain("The blank box is the reply's one ask");
      });

      it("say what Go deeper, simpler and Show me in a widget get", () => {
        expect(text).toContain('"Go deeper" gets one more layer, in at most 120 words, with the same running example and no new analogy.');
        expect(text).toContain("A request for something simpler gets the rule in four lines or fewer, with the same example.");
        expect(text).toContain('"Show me in a widget" gets one Widget and one sentence; when no Widget fits, say so in one sentence and give the shortest version in words.');
      });

      it("answer frustration with a short acknowledgement and a smaller step", () => {
        expect(text).toMatch(/Frustration: .*acknowledge it in eight words or fewer.*then give a smaller step/);
      });

      it("use the Learner Profile only when the Learner asks how an idea applies to them, never as advice", () => {
        expect(text).toContain("Use it only when the Learner asks how an idea applies to them");
        expect(text).not.toContain("Use it only to choose everyday examples");
        expect(text).toMatch(/It is never advice/);
      });

      it("let the Tutor teach during an open quiz, keeping back only the open answers", () => {
        expect(text).toContain("During an open quiz you may always explain an idea, show a Widget or start again from the beginning.");
        expect(text).toContain("Use no number from the blocked list");
      });

      it("keep a conversation Check's own reasoning for the Learner", () => {
        expect(text).toContain("never state the reasoning the pass criteria ask for about the prompt's own move");
      });

      it("allow short sums in words, and send every other sum to calculate", () => {
        expect(text).toContain('a difference in points ("5% minus 4% is 1 point")');
        expect(text).toContain('("1 point times 100 is 100 bp")');
        expect(text).toContain("apart from those short sums, never work out a sum in your head");
      });

      it("keep Guided Tasks as optional play, and use the spec's app words", () => {
        expect(text).toContain("Guided Tasks under a Widget are optional play");
        expect(text).toContain("you may name the Topic, a Check, the Check tab, a Widget, Next, Go deeper, Show me in a widget, a Quick try and the Concept card");
        expect(text).toContain('"Course Navigator", "Session item", "Reply kind" or "Skill state"');
      });

      it("keep the current rules: the past only, no advice, hindsight, Case Data, Citations, pacing, Formula Cards and the Library", () => {
        for (const rule of [
          "Teach from the past",
          "Never say what to buy, sell or hold",
          "Never reveal or hint at the outcome before the reveal step",
          "Historical figures come only from the Case Data",
          "Code adds a small citation number",
          "never finish a step that began in the same turn",
          "Show each only as a FormulaCard widget",
          "call search_library",
          "Ask it once.",
        ])
          expect(text).toContain(rule);
      });
    });
  }

  it("the engine text takes the word limit from code and no longer avoids the last archetype", () => {
    expect(ENGINE_INSTRUCTIONS).toContain("within the word limit code gives for this reply");
    expect(ENGINE_INSTRUCTIONS).not.toContain("archetype unless the Learner asked");
    expect(ENGINE_INSTRUCTIONS).toContain("make an Illustration only where no input or Case Data reference covers the same number");
  });

  it("keeps the longest reply at 120 words for the behaviour report", () => {
    expect(REPLY_WORD_LIMIT).toBe(120);
  });
});

describe("Appendix A's examples", () => {
  it("are all six in the instructions, with no typed sums and no refusal", () => {
    expect(TUTOR_EXAMPLES).toHaveLength(6);
    for (const e of TUTOR_EXAMPLES) expect(TUTOR_INSTRUCTIONS).toContain(e.reply);
    for (const e of TUTOR_EXAMPLES) {
      expect(e.reply).not.toMatch(/[−×÷=]|\d\s*-\s*\d/);
      expect(e.reply).not.toMatch(/can't|cannot/i);
    }
  });

  it("show an open quiz that asks for an idea, not a sum (ADR 0009, critic MP-3)", () => {
    for (const e of TUTOR_EXAMPLES) {
      for (const item of e.openItems ?? []) {
        expect(sumAsk(item.prompt)).toBeNull();
        // A choice set the idea separates: no option is a bare number.
        for (const choice of item.choices ?? []) expect(choice).not.toMatch(/^[\d.,%\s]+$/);
      }
    }
  });

  it("name the blocked numbers of an open quiz, and the Widget the reply shows", () => {
    expect(TUTOR_INSTRUCTIONS).toContain("Context: a quiz is open; blocked numbers: 4, 4.6, 60.");
    expect(ENGINE_INSTRUCTIONS).toContain("show_widget with recipe rate_move");
  });

  it("each pass every reply check", () => {
    for (const e of TUTOR_EXAMPLES) {
      const ctx: ReplyCheckContext = {
        step: e.step,
        replyKind: e.replyKind,
        exampleCurrency: "INR",
        caseCurrencies: [],
        openItems: e.openItems ?? [],
        internalWords: ["num-percent-bps", "check-1"],
        widgetOk: () => null,
      };
      expect({ reply: e.reply, problems: checkReply(fixReply({ text: e.reply, widgets: e.widget ? [e.widget] : [] }), ctx) }).toEqual({ reply: e.reply, problems: [] });
    }
  });
});

/**
 * F2-C1: at the half-done choice rung code posts the half-done try after the reply, and that try is the ask
 * (`ladder-moves.ts`). No rule that covers every rung may still demand an ask of the Tutor's own there, and the
 * example at that rung must use the current method name and end with no ask.
 */
describe("the half-done choice rung asks nothing of the Tutor's own (F2-C1)", () => {
  const sentences = (text: string) => text.split(/(?<=[.!?])\s+(?=[A-Z"(])/);
  const methodsIn = (text: string) => {
    const list = text.match(/The methods, in order, are ([^;]+);/)![1];
    return list.split(/, | and /).map((m) => m.trim());
  };

  for (const [name, text] of [
    ["widget engine off", TUTOR_INSTRUCTIONS],
    ["widget engine on", ENGINE_INSTRUCTIONS],
  ] as const) {
    it(`${name}: every rule that sets an ask in this reply's method carves out the half-done choice`, () => {
      const demands = sentences(text).filter((s) => s.includes("this reply's method") && /\bas the ask\b/.test(s));
      expect(demands.length).toBeGreaterThan(0);
      for (const s of demands) expect({ s, carvesOut: /half-done choice[^.]*write no ask of your own/.test(s) }).toEqual({ s, carvesOut: true });
    });

    it(`${name}: what is said at a half-done choice never asks the Tutor for a question or an ask`, () => {
      // The rules only: the method list names the rung, and an example's Context line is checked by the example tests below.
      const atRung = sentences(text).filter((s) => s.includes("half-done choice") && !s.startsWith("The methods, in order") && !s.startsWith("Context:"));
      expect(atRung.length).toBeGreaterThan(0);
      for (const s of atRung) expect(s).toMatch(/write no (?:question|ask) of your own/);
    });
  }

  it("every example that names a method names one on the current list", () => {
    const methods = methodsIn(TUTOR_INSTRUCTIONS);
    expect(methods).toEqual(["restate the rule", "worked example", "a half-done choice", "Widget", "drill"]);
    const named = TUTOR_EXAMPLES.map((e) => e.situation.match(/\bmethod ([^;]+);/)?.[1]).filter((m): m is string => !!m);
    expect(named.length).toBeGreaterThan(0);
    for (const m of named) expect(methods).toContain(m);
  });

  it("the example at the half-done choice rung names the slip in one sentence and ends with no ask", () => {
    const atRung = TUTOR_EXAMPLES.filter((e) => /\bmethod a half-done choice;/.test(e.situation));
    expect(atRung).toHaveLength(1);
    for (const e of atRung) {
      expect(splitAsk(e.reply).ask).toBeNull();
      expect(e.reply).not.toContain("?");
      expect(e.reply.split("\n")).toHaveLength(1);
    }
  });
});
