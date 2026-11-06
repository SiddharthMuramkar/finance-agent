import { describe, expect, it } from "vitest";
import { ENGINE_INSTRUCTIONS, TUTOR_INSTRUCTIONS } from "./instructions";

/**
 * The Tutor's voice (spec 2026-11-05, D3b): a warm storyteller who teaches the word first and never asks for a number.
 * The frozen text drops the flat rules ("No hype", "no cheering", "Praise in one to three words") and the fill-in boxes.
 */
describe("the Tutor's frozen instructions", () => {
  for (const [name, text] of [
    ["widget engine off", TUTOR_INSTRUCTIONS],
    ["widget engine on", ENGINE_INSTRUCTIONS],
  ] as const) {
    describe(name, () => {
      it("hold none of the flat-voice rules or the fill-in boxes", () => {
        for (const gone of ["No hype", "no cheering", "Praise in one to three words", "fill-in boxes", "Box 2"]) expect(text).not.toContain(gone);
      });

      it("tell the Tutor to tell it as a story", () => {
        expect(text).toContain("Tell it as a story");
      });

      // Run 2 of the live eval (8 of 16): each rule below answers one failure.
      it("keep a story opener short, with a place in its scene (T12)", () => {
        expect(text).toContain("A story opener is 90 words or fewer in all");
      });

      // Run 3 (critics BP-5, EV-1): T12 failed 3 of 3 on no place, an unexplained backstory firm, and an ask off the idea.
      it("put who, where, when and the stakes in an opener's first two sentences, with no backstory, and ask about its idea (T12)", () => {
        expect(text).toContain("where (a city, a firm or a market the Case names), when and what is at stake");
        expect(text).toContain("Leave out backstory: no one's past jobs or earlier firms");
        expect(text).toContain("The opener's ask is about the one idea it states");
      });

      it("say a sum as a statement, never as an instruction, and split choices by idea (T13)", () => {
        expect(text).toContain('never as an instruction ("Divide 100 by 100", "Find the points, then times 100")');
        expect(text).toContain("never by arithmetic");
      });

      it("acknowledge frustration warmly, without the flat 'Fair.' (T15)", () => {
        expect(text).not.toContain('"Fair.');
        expect(text).toContain('"Good news: this part is words, not maths."');
      });

      // Run 3 (critics BP-2, EV-2): "bad at maths" got "mostly subtraction", a worked sum and a Quick try that asks for a number.
      it("keep a reply to a maths worry all words: no sum, not even said as a fact, and no Quick try (T15)", () => {
        expect(text).toContain("When the worry is maths, keep that reply all words");
        // Run 4: an ask about basis points competed with the Quick try on points.
        expect(text).toContain("one choice ask about the word the step teaches (the one the Quick try on screen uses, if there is one)");
        expect(text).toContain("with no sum in it, not even said as a fact, and no pointer to a Quick try");
        expect(text).toContain('The Learner writes: "ugh I\'m terrible with numbers".');
      });

      // Run 3 (critic BP-4): T13 held back the answer with "a nudge rather than the answer" and asked "bigger or smaller" again and again.
      it("keep an answer back playfully, and never ask the same question twice in a Session (T13)", () => {
        expect(text).toContain("one light, playful line of five words or fewer that keeps the answer back as the Learner's to win");
        // Run 5: T11 failed 0 of 3, each reply 2 to 5 words over its cap, after a longer hold-back line.
        expect(text).toContain("A good reply:\nThat one's yours to win. Basis points are points times 100.");
        expect(text).toContain("Never put the same question to the Learner twice in a Session");
        // Run 4: a new ask turned into "how many basis points is that?", a sum.
        expect(text).toContain('never a conversion ("how many basis points is that?" is a sum)');
      });

      // Run 6 (critic BP-2, median fun 3 of 5): T14 had no story, T13 and T15 turned into number drills, T12 was dense.
      it("name a person or a role in an opener, lead with the people, and ask in plain words (T12)", () => {
        expect(text).toContain("who (a person or a role the Case names, such as \"the fund's partners\")");
        expect(text).toContain("Lead with the people and what they hope for or fear, and explain at most one word besides the idea.");
        expect(text).toContain('never "work out" or "calculate"');
        expect(text).toContain("The Learner has written nothing: the page opened the Session.");
      });

      it("keep the story alive after the opener, and answer a nudge with the story's stakes (T14)", () => {
        expect(text).toContain("Keep the story alive:");
        expect(text).toContain('A nudge with no question ("ok and?", "so?", "and then?") asks why the idea matters');
        expect(text).toContain('The Learner writes: "so?".');
      });

      it("keep sums rare: one at most, never in a reply about meaning, a reason or the Learner's life (T13)", () => {
        expect(text).toContain("Sums are rare: a reply says at most one short sum");
        expect(text).toContain('("is this like my credit card?") gets words and the story, with no numbers worked');
        expect(text).toContain('"Explain like I\'m 5" gets one tiny everyday picture in words');
      });

      it("tie a maths-worry reply to the story's people (T15)", () => {
        expect(text).toContain("say what the people in the story call it");
      });

      it("answer a word question with the word only, within 70 words (T16)", () => {
        expect(text).toContain("gets that word only, in 70 words or fewer");
      });

      it("explain a role before an ask uses it, and spell out basis points first (T1, T5, T15)", () => {
        expect(text).toContain('write "a trader", never "a bond trader", unless that reply says what a bond is');
        expect(text).toContain('Write "basis points" in full in each reply before you shorten it to bp');
      });

      it("keep a hint within 50 words (T11)", () => {
        expect(text).toContain("then one ask on that idea, in 50 words or fewer in all");
      });

      it("keep the running example's numbers when asked for something simpler (T4)", () => {
        expect(text).toContain("on the running example's own numbers (never switch to new ones)");
      });
    });
  }
});
