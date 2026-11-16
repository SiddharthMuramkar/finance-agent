import { describe, expect, it } from "vitest";
import { END_NOTE_TOPIC, endNote } from "./end-note";

// #75 "Where you end up": Home shows the one-page note Spine Topic 15 saves to the Notebook, worked out by the course's
// tested valuation engine, not typed in by hand.
describe("the note Home shows under 'Where you end up'", () => {
  it("is the one-page Valuation story the Notebook holds after Topic 15, on Amazon as of 3 Feb 2000", () => {
    expect(END_NOTE_TOPIC).toBe("spine-15-value-yourself");
    const note = endNote();
    expect(note.title).toBe("My Valuation story: Amazon, Feb 2000, against the price of 3 Feb 2000");
    expect(note.lines).toEqual([
      "How big it gets: revenue in year 10 $39bn",
      "What it keeps: operating margin once mature 10%",
      "What growth costs: sales for each dollar invested $3.00",
      "How risky: cost of capital while it grows 12.84%",
      "Chance it fails: 0%",
      "Worth: $35 a share",
      "Price on 3 Feb 2000: $84",
      "Value from after year 10: 112%",
    ]);
  });
});
