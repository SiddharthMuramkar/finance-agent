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
        expect(text).toContain("that name who, where (a city, a firm or a market), when and what is at stake");
        expect(text).toContain("A story opener is 90 words or fewer in all");
      });

      it("say a sum as a statement, never as an instruction, and split choices by idea (T13)", () => {
        expect(text).toContain('never as an instruction ("Divide 100 by 100", "Find the points, then times 100")');
        expect(text).toContain("never by arithmetic");
      });

      it("acknowledge frustration warmly, without the flat 'Fair.' (T15)", () => {
        expect(text).not.toContain('"Fair.');
        expect(text).toContain('"Good news: this part is words, not maths."');
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
