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
    });
  }
});
