import { describe, expect, it } from "vitest";
import { loadCourseMap } from "@/course/map";
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
        // D3b finish run t3: T15 was "warm but nothing playful" next to the Learner's "lol", and one ask said "how many points".
        expect(text).toContain('when the Learner jokes ("lol"), answer with a light touch of your own ("Ha, then you\'ll like this: words, not maths.")');
        expect(text).toContain('that ask never says "how many" or "how much"');
      });

      // Run 3 (critics BP-2, EV-2): "bad at maths" got "mostly subtraction", a worked sum and a Quick try that asks for a number.
      it("keep a reply to a maths worry all words: no sum, not even said as a fact, and no Quick try (T15)", () => {
        expect(text).toContain("When the worry is maths, keep that reply all words");
        // Run 4: an ask about basis points competed with the Quick try on points. Round 9 (DA-1): any ask competed with
        // it, so with a Quick try on screen or posted after the reply the reply names the word and asks nothing.
        expect(text).toContain("When a Quick try is on screen or code posts a try after your reply, name the word that try uses and stop there: write no ask of your own, because the try is the ask.");
        expect(text).toContain("Otherwise, end on one choice ask about that word;");
        expect(text).toContain("with no sum in it, not even said as a fact, and no pointer to a Quick try");
        expect(text).toContain('The Learner writes: "ugh I\'m terrible with numbers".');
      });

      // Run 3 (critic BP-4): T13 held back the answer with "a nudge rather than the answer" and asked "bigger or smaller" again and again.
      it("keep an answer back playfully, and never ask the same question twice in a Session (T13)", () => {
        // Run 13 (critic BP-2): "this one's yours to win" read as a flat refusal; the hold-back now hands over the same move done in full.
        expect(text).toContain("never refuse flatly: one warm line of ten words or fewer saying the last tap is theirs");
        expect(text).toContain("A good reply:\nHappy to get you there; the last tap stays yours. Basis points are points times 100, so");
        expect(text).not.toContain("A good reply:\nThat one's yours to win.");
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

      // Run 7: story ties in every reply left "the Fed" and "our story" unexplained (T1, T6, T15), and T12 printed its reply twice around suggest_choice.
      it("tie only a why, what-for or life question to the story, with each name explained, and never at a Check, hint or maths worry (T1, T6, T15)", () => {
        expect(text).toContain("when the Learner asks why, what it is for or how it touches their life, tie the answer to the Case's people");
        expect(text).toContain("Leave the story out of a reply at a Check, a hint, a confirmed rule, a maths worry or a simpler reply.");
        expect(text).toContain("in 60 words or fewer, say what it means for someone in the Case");
      });

      // Runs 8 and 9: T14's nudge reply left "shares", "Bombay Stock Exchange" and "the starting 100" unexplained, and ran past 80 words.
      it("gloss every market word of a nudge reply in its own sentence, name no number it has not set up, and cut history first (T14)", () => {
        expect(text).toContain('Give each market word from the Case its plain meaning in the same sentence ("the Sensex, a score for 30 big Indian companies")');
        expect(text).toContain('never "the starting 100" unless a sentence before it says the score began at 100');
        expect(text).toContain("To stay within the limit, cut a date or a history line, never a meaning.");
      });

      it("write the reply once, after any tool calls (T12)", () => {
        expect(text).toContain("Call suggest_choice before you write, and write the reply once, after your tool calls.");
      });

      it("answer a word question with the word only, within 70 words (T16)", () => {
        expect(text).toContain("gets that word only, in 70 words or fewer");
      });

      it("explain a role before an ask uses it, and spell out basis points first (T1, T5, T15)", () => {
        expect(text).toContain('write "a trader", never "a bond trader", unless that reply says what a bond is');
        expect(text).toContain('Write "basis points" in full in each reply before you shorten it to bp');
      });

      // Run 13 (critic BP-2, BP-3): T13 ended all 20 replies on a quiz question, refused "just tell me the answer" flatly,
      // and twice pointed to a Quick try "just below" that was not on screen.
      it("end on a quiz question only when the step asks for one, hand over the same move when asked for the answer, and name only what is on screen (T13)", () => {
        expect(text).toContain("That last line is a quiz question, a choice with a right answer, only when the step asks for one");
        expect(text).toContain("it is an invitation with no wrong answer");
        expect(text).toContain("never end two replies in a row on a quiz question");
        expect(text).toContain('Mention a Quick try, a Widget or anything "below" only when this turn\'s Course Navigator message or a tool result says code shows it now');
      });

      // Run 16 (critics MP-1, MP-2, BP-1): "just tell me the answer pls" got a worked sum, then "Now do the same steps on the
      // Quick try's numbers": arithmetic asked of a Learner who does not do sums. Asked for an answer, the Tutor gives it.
      it("give the answer to a Quick try or a question of the Tutor's in words, then one story or lingo choice, and never ask the Learner to redo the steps (T13)", () => {
        expect(text).not.toContain("the very same move done in full on other numbers, ending in its result, so one tap is all that is left");
        expect(text).not.toContain("When the Learner asks for the answer to anything still open");
        expect(text).toContain(
          "When the Learner asks for the answer to a Quick try or to a question of yours, give it: say the answer in words as a story fact, the move and its result",
        );
        expect(text).toContain("then end on one story or lingo choice");
        expect(text).toContain('Never tell the Learner to repeat the steps, work it out or "do the same on the Quick try\'s numbers": the Learner taps a choice and never does a sum.');
        // An open Check keeps its answer back (reply check V5): the move in words, then the tap handed back to its choices.
        expect(text).toContain("then one short line that hands the tap back to its choices");
        expect(text).toContain('The Learner writes: "just tell me the answer pls".');
        expect(text).toContain('A good reply:\nSure. The reporter would write "up half a percentage point": points are the gap between two rates, not where the rate ended.');
      });

      it("keep a hint within 50 words (T11)", () => {
        expect(text).toContain("not a new question and never a sum, in 50 words or fewer in all");
      });

      // Run 11: with a quiz open on "which would you use to tell a friend how far the rate moved", T4's simpler reply said "Points tell you how far the rate moved".
      it("keep a simpler reply off the open quiz's own words, and the closing ask within 20 words (T4, T11)", () => {
        expect(text).toContain("never describe an option in the open question's own words");
        expect(text).toContain("never say which option fits its situation");
        // Targeted run t9: T4 then explained points and basis points side by side, two ideas.
        expect(text).toContain("explain only the first idea in fresh words of your own, never each option in turn");
        expect(text).toContain("one short sentence of 20 words or fewer");
      });

      it("keep the running example's numbers when asked for something simpler (T4)", () => {
        expect(text).toContain("on the running example's own numbers (never switch to new ones)");
      });

      // Run 10: T16 glossed a basis point with an unexplained "percentage point", and T4 said "1 percentage point" right before asking how far the rate moved.
      it("gloss a term in everyday words, and never state the answer its ask is after (T4, T16)", () => {
        expect(text).toContain("explain each finance word the first time in everyday words, and never lean on another finance word you leave unexplained");
        // Round 11 (C1): the everyday picture is a move on the Running example, so "percentage point" needs no second explanation.
        expect(text).toContain('its everyday picture is a move on the Running example ("a rate going from 4% to 5% has moved 100 basis points, so one basis point is a hundredth of that step")');
        expect(text).toContain("Traders measure such moves in basis points: one hundredth of a percentage point. A rate going from 4% to 5% has moved 100 basis points.");
        expect(text).toContain("Never state the number or answer your ask is after");
        // Targeted run t6: T4 said "1 percentage point. That is how far the rate moved." while that question was still open.
        expect(text).toContain("While a question you asked is still open, work the running example only up to its last step");
        // Targeted run t7: T4 still wrote "5% minus 4% is 1 percentage point" under the open "how far the rate moved?".
        expect(text).toContain('and never give its answer, not even as the worked line ("5% minus 4% is 1 point" answers "how far did it move?")');
      });

      // Round 11 (critic C1): round 10's Lingo rule made the Tutor say a basis point is "a hundredth of one percent" and
      // banned "a hundredth of a percentage point". That is the percent-vs-percentage-point slip Percent corrects: a basis
      // point is 0.01 percentage points, as the Topic's term card says; a hundredth of a percent is a share of a rate.
      it("define a basis point as its card does, one hundredth of a percentage point, never as a hundredth of a percent (C1)", () => {
        const card = loadCourseMap().topic("num-percent-bps")!.terms.find((t) => t.term === "basis point")!;
        const cardDefinition = card.means.split(",")[0].toLowerCase();
        expect(cardDefinition).toBe("one hundredth of a percentage point");
        // No line defines it as a hundredth of a percent (of one percent, of 1%), or as 0.01%.
        expect(text).not.toMatch(/\bhundredths? of (?:a|one|1)\s*(?:percent\b(?!age)|%)/i);
        expect(text).not.toMatch(/\b0\.01\s*(?:%|percent\b(?!age))/i);
        // Every "hundredth of ..." in the text is the card's: of a percentage point.
        const hundredthsOf = [...text.matchAll(/\bhundredths? of (a|one|1)\s+([a-z]+(?: point)?)/gi)].map((m) => `${m[1].toLowerCase()} ${m[2].toLowerCase()}`);
        expect(hundredthsOf.length).toBeGreaterThan(0);
        for (const of of hundredthsOf) expect(of).toBe("a percentage point");
        // The Lingo rule and the story opener both say the card's words.
        expect(text).toContain(`a basis point is "${cardDefinition}", as its card says`);
        expect(text).toContain(`Traders measure such moves in basis points: ${cardDefinition}.`);
        expect(text).toContain('Never put "percent" in place of "percentage point" there: a percent is a share of the old rate, not the gap between two rates');
      });
    });
  }
});
